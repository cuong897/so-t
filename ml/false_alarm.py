"""Đo TỶ LỆ BÁO ĐỘNG GIẢ trên văn bản viết ĐÚNG, ở ngưỡng sản xuất.

Con số này chưa từng được đo, và nó là con số quyết định người dùng có gỡ cài
hay không. Mọi số F1 trong repo đều đo trên câu CÓ SẴN LỖI: chúng trả lời "khi
có lỗi, model sửa đúng bao nhiêu phần". Chúng không trả lời câu hỏi mà người
dùng thật sự sống cùng mỗi ngày:

    Tôi viết đúng. Bao lâu một lần thì nó gạch chân oan?

Khác biệt với evaluate.py, và đây là lý do file này tồn tại:

  * evaluate.py chọn bằng argmax trong tập nhãn hợp lệ, KHÔNG ngưỡng. Sản phẩm
    thì chỉ báo khi xác suất >= 0.90 VÀ hơn KEEP một biên >= 0.25
    (onnxEngine.js). File này dựng lại ĐÚNG phép quyết định đó.
  * evaluate.py chấm trên câu có lỗi. File này chấm trên câu KHÔNG có lỗi.

Hai nguồn văn bản đúng, cố tình khác nhau:

  A. data/test.jsonl — câu Wikipedia sạch. dataset.py chia theo băm câu GỐC nên
     model chưa từng thấy những câu này lúc train. Cùng miền văn phong với dữ
     liệu train, tức là ca DỄ.
  B. VSEC nửa giữ kín — câu đã sửa đúng, do người thật viết. Khác miền, nhiều
     tên riêng và khẩu ngữ. Ca KHÓ, và gần với đời thật hơn.

Chạy:
    python false_alarm.py                      # cả hai nguồn, model INT8 đang ship
    python false_alarm.py --source test --limit 3000
    python false_alarm.py --threshold 0 --margin 0   # để thấy ngưỡng mua được gì
"""

from __future__ import annotations
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

import gate
import vi
from encoding import encode_words, first_subword_index
from noise import load_lexicon

# Phải khớp onnxEngine.js. Lệch là đo một sản phẩm khác với sản phẩm đang ship.
PROD_THRESHOLD = 0.95
PROD_MARGIN = 0.25


def clean_sentences_from_jsonl(path: Path, limit: int) -> list[list[str]]:
    """Dựng lại câu ĐÚNG từ tập đã làm hỏng: áp nhãn sửa lên từng token."""
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            words = [w if t == "KEEP" else vi.TAGS[t](w)
                     for w, t in zip(row["tokens"], row["tags"])]
            out.append(words)
            if limit and len(out) >= limit:
                break
    return out


def clean_sentences_from_vsec(path: Path, limit: int) -> list[list[str]]:
    """Câu đã sửa đúng ở nửa VSEC giữ kín — văn người thật, khác miền train."""
    from evaluate import load_vsec

    rows = load_vsec(path, split="eval")
    out = [r["right"] for r in rows]
    return out[:limit] if limit else out


def alarms(sess, tok, words: list[str], lexicon, max_len: int,
           threshold: float, margin: float,
           thresholds: dict[str, float] | None = None
           ) -> list[tuple[str, str, float]]:
    """Những chỗ sản phẩm sẽ GẠCH CHÂN trên câu này.

    Phép quyết định lấy từ `gate.decide` — cùng một bản với evaluate.py và
    consonant_eval.py, và `test/gate.test.mjs` canh cho nó khớp onnxEngine.js.
    """
    ids, word_ids = encode_words(tok, words, max_len)
    first_idx = first_subword_index(word_ids, len(words))

    logits = sess.run(None, {
        "input_ids": np.array([ids], dtype=np.int64),
        "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
    })[0][0]

    found = []
    for w, token in enumerate(words):
        pos = first_idx[w]
        if pos < 0:
            continue
        allowed = vi.applicable_tags(token, lexicon)
        if len(allowed) <= 1:
            continue

        idxs = [vi.TAG_INDEX[t] for t in allowed]
        z = logits[pos, idxs].astype(np.float64)

        tag, best_p = gate.decide(z, allowed, threshold, margin, thresholds)
        best_j = allowed.index(tag) if tag != "KEEP" else -1

        if best_j < 0:
            continue
        sugg = vi.TAGS[allowed[best_j]](token)
        if sugg == token:
            continue
        found.append((token, sugg, best_p))
    return found


def run(name: str, sentences: list[list[str]], sess, tok, lexicon,
        max_len: int, threshold: float, margin: float,
        max_samples: int = 500,
        thresholds: dict[str, float] | None = None) -> dict:
    n_sent = n_words = n_candidate = 0
    hit_sent = 0
    pairs = Counter()
    samples = []

    for words in sentences:
        if not words:
            continue
        n_sent += 1
        n_words += len(words)
        n_candidate += sum(1 for w in words
                           if len(vi.applicable_tags(w, lexicon)) > 1)
        found = alarms(sess, tok, words, lexicon, max_len, threshold,
                       margin, thresholds)
        if found:
            hit_sent += 1
            for a, b, p in found:
                pairs[f"{a} -> {b}"] += 1
            if len(samples) < max_samples:
                samples.append({
                    "cau": " ".join(words),
                    "bao": [{"tu": a, "de_xuat": b, "p": round(p, 4)}
                            for a, b, p in found],
                })
        if n_sent % 500 == 0:
            print(f"  {name}: {n_sent:,} cau...", flush=True)

    n_alarm = sum(pairs.values())
    return {
        "nguon": name,
        "cau": n_sent,
        "tu": n_words,
        "tu_co_ung_vien": n_candidate,
        "cau_bi_bao_oan": hit_sent,
        "ty_le_cau": hit_sent / n_sent if n_sent else 0.0,
        "so_lan_bao_oan": n_alarm,
        "ty_le_tren_tu": n_alarm / n_words if n_words else 0.0,
        "ty_le_tren_tu_co_ung_vien": n_alarm / n_candidate if n_candidate else 0.0,
        "hay_bao_oan_nhat": pairs.most_common(20),
        "vi_du": samples,
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", type=Path,
                    default=Path("../extension/models/soat.int8.onnx"))
    ap.add_argument("--tokenizer", type=Path, default=Path("out/student768"))
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--test-data", type=Path, default=Path("data/test.jsonl"))
    ap.add_argument("--vsec", type=Path, default=Path("data/raw/VSEC.jsonl"))
    ap.add_argument("--source", choices=["test", "vsec", "both"], default="both")
    ap.add_argument("--limit", type=int, default=2000)
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--threshold", type=float, default=PROD_THRESHOLD)
    ap.add_argument("--margin", type=float, default=PROD_MARGIN)
    ap.add_argument("--consonant-threshold", type=float, default=None,
                    help="ngưỡng RIÊNG cho nhãn phụ âm và âm cuối")
    ap.add_argument("--out", type=Path, default=Path("out/false_alarm.json"))
    ap.add_argument("--max-samples", type=int, default=500,
                    help="giữ lại tối đa bao nhiêu câu bị báo oan, KÈM NGUYÊN "
                         "CÂU — để đọc tay và phân loại: văn bản sai thật hay "
                         "model oan. Không đọc tay thì con số chỉ là chặn trên.")
    args = ap.parse_args()

    import onnxruntime as ort
    from transformers import AutoTokenizer

    lexicon = load_lexicon(args.lexicon)
    tok = AutoTokenizer.from_pretrained(args.tokenizer)
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1          # giong Web Worker, khong phai batch GPU
    sess = ort.InferenceSession(str(args.onnx), opts,
                                providers=["CPUExecutionProvider"])

    tbl = (gate.thresholds_for(args.threshold, args.consonant_threshold)
           if args.consonant_threshold is not None else None)
    dung_nguong = ((args.threshold, args.margin) == (PROD_THRESHOLD, PROD_MARGIN)
                   and tbl is None)
    print(f"model     : {args.onnx}  ({args.onnx.stat().st_size / 1e6:.1f} MB)")
    print(f"nguong    : p >= {args.threshold}  va  p - KEEP >= {args.margin}"
          + ("   <-- DUNG nguong san pham" if dung_nguong
             else "   <-- KHAC nguong san pham"))
    print(f"tu dien   : {len(lexicon):,} am tiet\n")

    results = []
    if args.source in ("test", "both"):
        s = clean_sentences_from_jsonl(args.test_data, args.limit)
        print(f"A. Wikipedia sach (test, model chua tung thay): {len(s):,} cau")
        results.append(run("wikipedia_test", s, sess, tok, lexicon,
                           args.max_len, args.threshold, args.margin,
                           args.max_samples, tbl))
    if args.source in ("vsec", "both"):
        s = clean_sentences_from_vsec(args.vsec, args.limit)
        print(f"B. VSEC nua giu kin, cau da sua dung (van nguoi that): {len(s):,} cau")
        results.append(run("vsec_heldout_dung", s, sess, tok, lexicon,
                           args.max_len, args.threshold, args.margin,
                           args.max_samples, tbl))

    print("\n=== BAO DONG GIA TREN VAN BAN DUNG ===")
    for r in results:
        print(f"\n{r['nguon']}  ({r['cau']:,} cau, {r['tu']:,} tu)")
        print(f"  cau bi gach chan oan : {r['cau_bi_bao_oan']:,}/{r['cau']:,} "
              f"= {r['ty_le_cau']:.2%}")
        print(f"  so lan gach oan      : {r['so_lan_bao_oan']:,}  "
              f"({r['ty_le_tren_tu']:.3%} so tu, "
              f"{r['ty_le_tren_tu_co_ung_vien']:.3%} so tu co ung vien)")
        if r["hay_bao_oan_nhat"]:
            print("  hay oan nhat         : "
                  + ", ".join(f"{k} x{v}" for k, v in r["hay_bao_oan_nhat"][:8]))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        "_meta": {
            "model": str(args.onnx),
            "tokenizer": str(args.tokenizer),
            "threshold": args.threshold,
            "margin": args.margin,
            "consonant_threshold": args.consonant_threshold,
            "dung_nguong_san_pham": dung_nguong,
            "lenh": " ".join(sys.argv),
            "ghi_chu": "Chi do tang model. Tang luat do rieng bang "
                       "test/false_alarm_rules.mjs.",
        },
        "ket_qua": results,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nda luu -> {args.out}")


if __name__ == "__main__":
    main()
