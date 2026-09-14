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

import gate
import vi
from encoding import encode_words, first_subword_index

PUNCT = ".,!?;:\"'()[]{}<>«»…-–—"


# --- nạp VSEC -----------------------------------------------------------------

def load_vsec(path: Path, split: str | None = None) -> list[dict]:
    """Trả về [{tokens_sai, tokens_đúng}] đã chuẩn hoá, bỏ dấu câu dính token.

    `split='eval'` chỉ lấy nửa VSEC mà mine_errors.py KHÔNG dùng để rút phân bố.
    Bắt buộc phải dùng cờ này khi báo cáo kết quả của model train bằng trọng số
    đo được — nếu không thì đang chấm trên chính dữ liệu đã nhìn trộm đáp án,
    và con số chỉ phản ánh việc đó chứ không phản ánh chất lượng model.
    """
    from mine_errors import split_of

    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            if split is not None and split_of(row["text"]) != split:
                continue
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

def _gate(logit_row, allowed: list[str], token: str,
          threshold: float, margin: float,
          thresholds: dict[str, float] | None = None) -> str:
    """Chọn nhãn theo ĐÚNG phép quyết định của onnxEngine.js.

    Chỉ còn là lớp mỏng bọc `gate.decide` — luật thật nằm ở `gate.py`, một bản
    duy nhất cho cả phía Python, và `test/gate.test.mjs` canh cho nó khớp với
    onnxEngine.js. Trước đây luật này có ba bản chép tay trong ml/.
    """
    tag, _ = gate.decide(logit_row, allowed, threshold, margin, thresholds)
    return tag


def predict(model, tok, device, words: list[str], lexicon, max_len: int,
            threshold: float = 0.0, margin: float = 0.0,
            thresholds: dict[str, float] | None = None) -> list[str]:
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
        tags[w] = _gate(logits[pos, idxs].cpu().numpy(), allowed, token,
                        threshold, margin, thresholds)
    return tags


def predict_onnx(sess, tok, words: list[str], lexicon, max_len: int,
                 threshold: float = 0.0, margin: float = 0.0,
                 thresholds: dict[str, float] | None = None) -> list[str]:
    """Bản ONNX của predict().

    Cần thiết để trả lời câu hỏi mà export_onnx.py không tự trả lời được:
    lượng tử hoá INT8 lấy mất bao nhiêu điểm F1. Không có con số đó thì báo cáo
    "nhẹ hơn 4 lần, nhanh hơn 3 lần" mới kể một nửa câu chuyện — và là nửa đẹp.

    Đi qua ĐÚNG đường mà trình duyệt đi: cùng encode_words, cùng đọc logit ở
    subword đầu, cùng chặn theo applicable_tags.
    """
    import numpy as np

    ids, word_ids = encode_words(tok, words, max_len)
    first_idx = first_subword_index(word_ids, len(words))

    logits = sess.run(None, {
        "input_ids": np.array([ids], dtype=np.int64),
        "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
    })[0][0]

    tags = ["KEEP"] * len(words)
    for w, token in enumerate(words):
        pos = first_idx[w]
        if pos < 0:
            continue
        allowed = vi.applicable_tags(token, lexicon)
        if len(allowed) <= 1:
            continue
        idxs = [vi.TAG_INDEX[t] for t in allowed]
        tags[w] = _gate(logits[pos, idxs], allowed, token, threshold, margin,
                        thresholds)
    return tags


def score(rows, predict_fn, scoped: bool, lexicon) -> dict:
    """tp: sửa đúng. fp: động vào chỗ không nên. fn: bỏ sót lỗi thật.

    CHÚ Ý KHI ĐỌC SỐ: ở đây model chọn bằng argmax trong tập nhãn hợp lệ, KHÔNG
    có ngưỡng tin cậy. Sản phẩm thật thì khác — onnxEngine.js chỉ báo khi xác
    suất > 0.9 VÀ hơn KEEP một biên 0.25.

    Nên số ở đây đo NĂNG LỰC THÔ của model, còn ngoài sản phẩm precision sẽ cao
    hơn và recall thấp hơn. Đừng đem con số này đi hứa với người dùng, và cũng
    đừng lấy nó làm cớ để hạ ngưỡng.
    """
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
    ap.add_argument("--model", type=Path, default=None, help="thư mục model PyTorch")
    ap.add_argument("--onnx", type=Path, default=None,
                    help="file .onnx để chấm thay bản PyTorch — dùng để đo "
                         "lượng tử hoá INT8 lấy mất bao nhiêu F1")
    ap.add_argument("--tokenizer", type=Path, default=None,
                    help="thư mục tokenizer khi dùng --onnx (mặc định lấy --model)")
    ap.add_argument("--vsec", type=Path, default=Path("data/raw/VSEC.jsonl"))
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--threshold", type=float, default=0.0,
                    help="ngưỡng tin cậy như onnxEngine.js (sản phẩm: 0.95). "
                         "0 = argmax không ngưỡng, tức NĂNG LỰC THÔ của model "
                         "chứ không phải thứ người dùng thấy")
    ap.add_argument("--margin", type=float, default=0.0,
                    help="biên phải hơn KEEP (sản phẩm: 0.25)")
    ap.add_argument("--limit", type=int, default=0, help="chỉ chấm N câu đầu")
    ap.add_argument("--consonant-threshold", type=float, default=None,
                    help="ngưỡng RIÊNG cho nhãn phụ âm và âm cuối. Để trống "
                         "thì mọi nhãn dùng chung --threshold.")
    ap.add_argument("--result", default="out/eval.json",
                    help="nơi lưu JSON. Mặc định out/eval.json bị GHI ĐÈ mỗi "
                         "lần chạy — truyền tên riêng khi đối chiếu nhiều bản model.")
    ap.add_argument("--held-out", action="store_true",
                    help="chỉ chấm nửa VSEC mà mine_errors.py không đụng tới. "
                         "BẮT BUỘC khi model train bằng trọng số đo từ VSEC.")
    args = ap.parse_args()

    from noise import load_lexicon
    lexicon = load_lexicon(args.lexicon) or None
    tbl = (gate.thresholds_for(args.threshold, args.consonant_threshold)
           if args.consonant_threshold is not None else None)
    if tbl:
        print(f"ngưỡng RIÊNG cho phụ âm: {args.consonant_threshold} "
              f"(thanh điệu giữ {args.threshold})")
    print(f"từ điển âm tiết: {len(lexicon) if lexicon else 0:,}"
          + ("" if lexicon else "  (TRỐNG — chạy dataset.py trước để có lọc ứng viên)"))

    split = "eval" if args.held_out else None
    rows = load_vsec(args.vsec, split)
    if args.limit:
        rows = rows[: args.limit]
    print(f"VSEC: {len(rows):,} câu"
          + ("  (NỬA GIỮ KÍN — mine_errors.py không đụng tới)" if args.held_out
             else "  (TOÀN BỘ — nếu model train bằng trọng số đo từ VSEC thì số"
                  " này bị thổi phồng; dùng --held-out)") + "\n")

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

    if args.model is None and args.onnx is None:
        print("\n(không truyền --model hoặc --onnx nên dừng ở phân tích phạm vi)")
        return

    from transformers import AutoTokenizer

    tok_dir = args.tokenizer or args.model
    if tok_dir is None:
        raise SystemExit("dùng --onnx thì phải kèm --model hoặc --tokenizer "
                         "để biết lấy tokenizer ở đâu")
    tok = AutoTokenizer.from_pretrained(tok_dir)

    if args.onnx:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1      # giống Web Worker, không phải batch GPU
        sess = ort.InferenceSession(str(args.onnx), opts,
                                    providers=["CPUExecutionProvider"])
        print(f"\nmodel: {args.onnx}  "
              f"{args.onnx.stat().st_size / 1e6:.1f} MB  (onnxruntime, 1 luồng CPU)")
        fn = lambda words: predict_onnx(sess, tok, words, lexicon, args.max_len,
                                        args.threshold, args.margin, tbl)
    else:
        import torch
        from transformers import AutoModelForTokenClassification

        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = (AutoModelForTokenClassification
                 .from_pretrained(args.model).to(device).eval())
        n_params = sum(p.numel() for p in model.parameters())
        print(f"\nmodel: {args.model}  {n_params / 1e6:.1f}M tham số  ({device})")
        fn = lambda words: predict(model, tok, device, words, lexicon, args.max_len,
                                   args.threshold, args.margin, tbl)

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

    res = Path(args.result)
    res.parent.mkdir(parents=True, exist_ok=True)
    res.write_text(json.dumps(
        {"scope": {k: v for k, v in sc.items() if k != "by_tag"},
         "in_scope": b, "full": c, "model": str(args.onnx or args.model),
         "threshold": args.threshold, "margin": args.margin,
         "held_out": bool(args.held_out), "limit": args.limit,
         "consonant_threshold": args.consonant_threshold},
        ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    print(f"\nđã lưu -> {res}")


if __name__ == "__main__":
    main()
