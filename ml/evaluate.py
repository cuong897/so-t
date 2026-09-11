"""Đánh giá model, đối chiếu VSEC — và nói rõ phạm vi.

VSEC (PRICAI 2021) công bố 86.8% phát hiện / 81.5% sửa đúng. Nhưng so thẳng
con số của ta với con số đó là SO SÁNH SAI, và phải nói ra điều này chứ không
được lặng lẽ chọn cái số đẹp hơn:

    Bộ nhãn của ta chỉ biểu diễn được 54.5% số lỗi trong VSEC.
    Phần còn lại là chèn/xoá ký tự ("tranhh"->"tranh", "iên"->"nhiên") và đổi
    phẩm chất nguyên âm ("bức"->"bước") — VSEC nặng về lỗi GÕ PHÍM, còn sản
    phẩm này nhắm vào lỗi KIẾN THỨC (người không biết hỏi hay ngã).

Vì vậy script in ra ba khối số:
    A. Phạm vi   — bao nhiêu phần VSEC nằm trong tầm với, và phần ngoài là gì
    B. Trong tầm — P/R/F1 trên đúng phần bộ nhãn biểu diễn được (so sánh công bằng)
    C. Toàn bộ   — P/R/F1 trên cả VSEC (trần trên bị chặn bởi A, ghi rõ)

Chạy:
    python evaluate.py --model out/student                 # trên VSEC
    python evaluate.py --model out/student --data data     # trên tập test tự sinh
    python evaluate.py                                     # chỉ phân tích phạm vi
"""

from __future__ import annotations
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import vi
from encoding import encode_words, first_subword_index

PUNCT = ".,!?;:\"'()[]{}<>«»…-–—"


# --- nạp VSEC -----------------------------------------------------------------

def load_vsec(path: Path) -> list[dict]:
    """Trả về [{tokens_sai, tokens_đúng}] đã chuẩn hoá, bỏ dấu câu dính token."""
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            wrong, right = [], []
            for a in row["annotations"]:
                w = vi.normalize(a["current_syllable"]).strip(PUNCT)
                if not w:
                    continue
                if a["is_correct"] or not a["alternative_syllables"]:
                    c = w
                else:
                    c = vi.normalize(a["alternative_syllables"][0]).strip(PUNCT) or w
                wrong.append(w)
                right.append(c)
            if wrong:
                out.append({"wrong": wrong, "right": right})
    return out


# --- A. phân tích phạm vi -----------------------------------------------------

def scope_report(rows: list[dict], lexicon: set[str] | None) -> dict:
    total = in_scope = 0
    by_tag = Counter()
    oos_len_diff = 0
    oos_examples = []

    for r in rows:
        for w, c in zip(r["wrong"], r["right"]):
            if w == c:
                continue
            total += 1
            tag = vi.tag_between(w, c, lexicon)
            if tag and tag != "KEEP":
                in_scope += 1
                by_tag[tag] += 1
            else:
                if len(vi.to_ascii(w).lower()) != len(vi.to_ascii(c).lower()):
                    oos_len_diff += 1
                if len(oos_examples) < 8:
                    oos_examples.append((w, c))

    return {
        "total": total,
        "in_scope": in_scope,
        "ratio": in_scope / total if total else 0.0,
        "by_tag": by_tag,
        "oos_len_diff": oos_len_diff,
        "oos_examples": oos_examples,
    }


# --- B/C. chấm model ----------------------------------------------------------

def predict(model, tok, device, words: list[str], lexicon, max_len: int) -> list[str]:
    """Dự đoán nhãn cho từng từ, CHẶN trong applicable_tags như lúc chạy thật.

    Dùng encode_words chứ không dùng word_ids() của HuggingFace: PhoBERT không
    có tokenizer bản fast nên word_ids() không tồn tại, và tự tách theo từng từ
    cũng là cách bpe.js làm trong trình duyệt — giữ cho lúc đo và lúc chạy thật
    đi qua đúng một đường.
    """
    import torch

    ids, word_ids = encode_words(tok, words, max_len)
    first_idx = first_subword_index(word_ids, len(words))

    with torch.no_grad():
        logits = model(
            input_ids=torch.tensor([ids], device=device),
            attention_mask=torch.ones(1, len(ids), dtype=torch.long, device=device),
        ).logits[0]

    tags = ["KEEP"] * len(words)
    for w, token in enumerate(words):
        pos = first_idx[w]
        if pos < 0:
            continue
        allowed = vi.applicable_tags(token, lexicon)
        if len(allowed) <= 1:
            continue
        idxs = [vi.TAG_INDEX[t] for t in allowed]
        sub = logits[pos, idxs]
        tags[w] = allowed[int(sub.argmax())]
    return tags


def score(rows, predict_fn, scoped: bool, lexicon) -> dict:
    """tp: sửa đúng. fp: động vào chỗ không nên. fn: bỏ sót lỗi thật."""
    tp = fp = fn = 0
    for r in rows:
        pred = predict_fn(r["wrong"])
        for w, c, tag in zip(r["wrong"], r["right"], pred):
            gold = vi.tag_between(w, c, lexicon) or None
            is_error = w != c
            if scoped and is_error and (gold is None or gold == "KEEP"):
                continue  # lỗi ngoài tầm với — không tính vào phần so sánh công bằng
            got = vi.TAGS[tag](w) if tag != "KEEP" else w
            if is_error:
                if got == c:
                    tp += 1
                else:
                    fn += 1
                    if tag != "KEEP":
                        fp += 1
            elif tag != "KEEP":
                fp += 1
    p = tp / (tp + fp) if tp + fp else 0.0
    r_ = tp / (tp + fn) if tp + fn else 0.0
    return {"precision": p, "recall": r_,
            "f1": 2 * p * r_ / (p + r_) if p + r_ else 0.0,
            "tp": tp, "fp": fp, "fn": fn}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, default=None)
    ap.add_argument("--vsec", type=Path, default=Path("data/raw/VSEC.jsonl"))
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--limit", type=int, default=0, help="chỉ chấm N câu đầu")
    args = ap.parse_args()

    from noise import load_lexicon
    lexicon = load_lexicon(args.lexicon) or None
    print(f"từ điển âm tiết: {len(lexicon) if lexicon else 0:,}"
          + ("" if lexicon else "  (TRỐNG — chạy dataset.py trước để có lọc ứng viên)"))

    rows = load_vsec(args.vsec)
    if args.limit:
        rows = rows[: args.limit]
    print(f"VSEC: {len(rows):,} câu\n")

    # --- A ---
    sc = scope_report(rows, lexicon)
    print("=== A. PHẠM VI ===")
    print(f"tổng lỗi          : {sc['total']:,}")
    print(f"bộ nhãn với tới   : {sc['in_scope']:,}  ({sc['ratio']:.1%})")
    print(f"ngoài tầm         : {sc['total'] - sc['in_scope']:,}  "
          f"(trong đó {sc['oos_len_diff']:,} là chèn/xoá ký tự)")
    print("ví dụ ngoài tầm   : "
          + ", ".join(f"{w}→{c}" for w, c in sc["oos_examples"][:6]))
    print("nhãn hay gặp nhất : "
          + ", ".join(f"{t} {n}" for t, n in sc["by_tag"].most_common(5)))

    if args.model is None:
        print("\n(không truyền --model nên dừng ở phân tích phạm vi)")
        return

    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForTokenClassification.from_pretrained(args.model).to(device).eval()
    n_params = sum(p.numel() for p in model.parameters())
    print(f"\nmodel: {args.model}  {n_params / 1e6:.1f}M tham số  ({device})")

    fn = lambda words: predict(model, tok, device, words, lexicon, args.max_len)

    print("\n=== B. TRONG TẦM (so sánh công bằng) ===")
    b = score(rows, fn, scoped=True, lexicon=lexicon)
    print(f"P {b['precision']:.4f}  R {b['recall']:.4f}  F1 {b['f1']:.4f}"
          f"   (tp {b['tp']} fp {b['fp']} fn {b['fn']})")

    print("\n=== C. TOÀN BỘ VSEC ===")
    c = score(rows, fn, scoped=False, lexicon=lexicon)
    print(f"P {c['precision']:.4f}  R {c['recall']:.4f}  F1 {c['f1']:.4f}"
          f"   (tp {c['tp']} fp {c['fp']} fn {c['fn']})")
    print(f"trần trên của recall ở khối này là {sc['ratio']:.1%} — bộ nhãn không "
          f"biểu diễn được phần còn lại.")
    print("VSEC công bố: 86.8% phát hiện / 81.5% sửa đúng (seq2seq, ~130M tham số).")

    Path("out").mkdir(exist_ok=True)
    Path("out/eval.json").write_text(json.dumps(
        {"scope": {k: v for k, v in sc.items() if k != "by_tag"},
         "in_scope": b, "full": c, "params_m": round(n_params / 1e6, 1)},
        ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print("\nđã lưu -> out/eval.json")


if __name__ == "__main__":
    main()
