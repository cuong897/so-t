"""Chấm theo CÂU, không theo lỗi — thứ người dùng thật sự nhìn thấy.

Mọi phép đo khác trong dự án này chấm từng lỗi một: `evaluate.py` cộng tp/fp/fn
trên toàn bộ vị trí, `consonant_eval.py` chấm mỗi ca một vị trí. Cách đó trả lời
"trong tất cả lỗi, bao nhiêu phần trăm được sửa".

Người dùng thì không sống theo đơn vị lỗi. Họ gõ một CÂU và nhìn kết quả. Ảnh
chụp màn hình từ người dùng thật:

    chúc mựng anh chị đã giành được phần quà trí giá 10 triệu đuồng

Bốn chữ, ba chữ sai, sản phẩm không đụng chữ nào. Tính theo lỗi thì đó là ba lần
bỏ sót trong một biển hàng nghìn lỗi khác. Tính theo CÂU thì đó là một câu người
dùng nhìn vào và thấy sản phẩm **không làm gì cả** — một trải nghiệm hoàn toàn
khác, và không phép đo nào trong repo này đang đo nó.

File này chia câu VSEC giữ kín thành năm rổ:

  SẠCH HẲN       mọi lỗi trong câu đều được sửa, không đụng nhầm chỗ nào
  HẾT PHẦN TRONG TẦM  sửa hết phần bộ nhãn với tới được, phần còn lại ngoài tầm
  SỬA MỘT PHẦN   sửa được vài lỗi, còn sót, không đụng nhầm
  KHÔNG ĐỤNG     im lặng hoàn toàn dù câu có lỗi
  CÓ SỬA SAI     động vào ít nhất một chỗ không nên, hoặc sửa sai hướng

Rổ cuối tách riêng và xếp cuối vì nó là rổ **tệ nhất với người dùng**: gạch chân
nhầm một lần là người ta gỡ cài, còn bỏ sót thì họ không biết (quyết định 8).
Một câu vừa sửa đúng hai lỗi vừa gạch oan một chỗ vẫn vào rổ CÓ SỬA SAI.

**PHẠM VI: file này chỉ đo TẦNG MODEL.** Sản phẩm thật có bốn tầng, và tầng luật
(`ruleEngine.js`) bắt thêm 137 cụm sai tuyệt đối mà phía Python không có bản
tương ứng. Nên con số ở đây là **chặn dưới** của trải nghiệm thật. Đừng báo cáo
nó như số của cả sản phẩm — đó đúng là kiểu nhầm mà cả dự án này lấy làm luận
điểm.

    python sentence_eval.py --onnx ../extension/models/soat.int8.onnx \\
      --tokenizer out/student768_v4/best --held-out --limit 1500
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
from evaluate import load_vsec
from noise import load_lexicon

BUCKETS = ["sach_han", "het_trong_tam", "sua_mot_phan", "khong_dung", "co_sua_sai"]
NHAN = {
    "sach_han": "SẠCH HẲN",
    "het_trong_tam": "HẾT PHẦN TRONG TẦM",
    "sua_mot_phan": "SỬA MỘT PHẦN",
    "khong_dung": "KHÔNG ĐỤNG",
    "co_sua_sai": "CÓ SỬA SAI",
}


def predict(sess, tok, words, lexicon, max_len, threshold, margin, tbl):
    """Nhãn sản phẩm chọn cho từng từ, đi qua đúng gate.decide của sản phẩm."""
    ids, word_ids = encode_words(tok, words, max_len)
    first = first_subword_index(word_ids, len(words))
    logits = sess.run(None, {
        "input_ids": np.array([ids], dtype=np.int64),
        "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
    })[0][0]

    out = ["KEEP"] * len(words)
    for w, token in enumerate(words):
        pos = first[w]
        if pos < 0:
            continue
        allowed = vi.applicable_tags(token, lexicon)
        if len(allowed) <= 1:
            continue
        z = logits[pos, [vi.TAG_INDEX[t] for t in allowed]].astype(np.float64)
        out[w], _ = gate.decide(z, allowed, threshold, margin, tbl)
    return out


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", type=Path,
                    default=Path("../extension/models/soat.int8.onnx"))
    ap.add_argument("--tokenizer", type=Path, default=Path("out/student768_v4/best"))
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--vsec", type=Path, default=Path("data/raw/VSEC.jsonl"))
    ap.add_argument("--held-out", action="store_true")
    ap.add_argument("--limit", type=int, default=1500)
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--threshold", type=float, default=gate.PROD_THRESHOLD)
    ap.add_argument("--margin", type=float, default=gate.PROD_MARGIN)
    ap.add_argument("--consonant-threshold", type=float, default=gate.PROD_CONSONANT)
    ap.add_argument("--result", default="out/sentence_eval.json")
    ap.add_argument("--dump", type=int, default=6, help="in bao nhiêu câu KHÔNG ĐỤNG")
    ap.add_argument("--export-cases", action="store_true",
                    help="chỉ xuất fixture cho dev/sentence-eval.html rồi thoát. "
                         "Trang đó chạy CẢ HAI tầng, file này chỉ chạy tầng model.")
    ap.add_argument("--cases-out", type=Path,
                    default=Path("../extension/models/_sentence_cases.json"))
    args = ap.parse_args()

    lexicon = load_lexicon(args.lexicon)
    if args.export_cases:
        rows = load_vsec(args.vsec, "eval" if args.held_out else None)[: args.limit]
        out = []
        for r in rows:
            w, c = r["wrong"], r["right"]
            errs = [i for i in range(len(w)) if w[i] != c[i]]
            if not errs:
                continue
            out.append({
                "wrong": w, "right": c, "errs": errs,
                "in_scope": [i for i in errs
                             if (vi.tag_between(w[i], c[i], lexicon) or "KEEP") != "KEEP"],
            })
        args.cases_out.parent.mkdir(parents=True, exist_ok=True)
        args.cases_out.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        print(f"{len(out):,} câu -> {args.cases_out} "
              f"({args.cases_out.stat().st_size / 1e6:.1f} MB)")
        print("giờ mở dev/sentence-eval.html để chấm CẢ HAI tầng")
        return

    import onnxruntime as ort
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(args.tokenizer)
    o = ort.SessionOptions()
    o.intra_op_num_threads = 1
    sess = ort.InferenceSession(str(args.onnx), o, providers=["CPUExecutionProvider"])
    tbl = gate.thresholds_for(args.threshold, args.consonant_threshold)

    rows = load_vsec(args.vsec, "eval" if args.held_out else None)[: args.limit]
    print(f"model : {args.onnx}")
    print(f"ngưỡng: thanh điệu {args.threshold}, phụ âm {args.consonant_threshold}, "
          f"biên {args.margin}")
    print(f"VSEC  : {len(rows):,} câu"
          + ("  (nửa giữ kín)" if args.held_out else "  (TOÀN BỘ)"))
    print("PHẠM VI: chỉ tầng model. Tầng luật bắt thêm — đây là CHẶN DƯỚI.\n")

    stat = Counter()
    n_err_total = n_fixed_total = 0
    by_nerr = {}          # số lỗi trong câu -> Counter(rổ)
    untouched = []

    for n, r in enumerate(rows, 1):
        wrong, right = r["wrong"], r["right"]
        errs = [i for i, (w, c) in enumerate(zip(wrong, right)) if w != c]
        if not errs:
            continue                              # câu vốn không có lỗi
        in_scope = [i for i in errs
                    if (vi.tag_between(wrong[i], right[i], lexicon) or "KEEP") != "KEEP"]

        tags = predict(sess, tok, wrong, lexicon, args.max_len,
                       args.threshold, args.margin, tbl)
        fixed, bad = 0, 0
        for i, tag in enumerate(tags):
            if tag == "KEEP":
                continue
            got = vi.TAGS[tag](wrong[i])
            if i in errs and got == right[i]:
                fixed += 1
            else:
                bad += 1                          # động vào chỗ không nên, hoặc sai hướng

        n_err_total += len(errs)
        n_fixed_total += fixed

        if bad:
            b = "co_sua_sai"
        elif fixed == len(errs):
            b = "sach_han"
        elif in_scope and fixed == len(in_scope):
            b = "het_trong_tam"
        elif fixed:
            b = "sua_mot_phan"
        else:
            b = "khong_dung"
            if len(untouched) < args.dump:
                untouched.append((
                    " ".join(wrong)[:96],
                    ", ".join(f"{wrong[i]}→{right[i]}" for i in errs[:4])))
        stat[b] += 1
        by_nerr.setdefault(min(len(errs), 4), Counter())[b] += 1

        if n % 300 == 0:
            print(f"  {n:,}/{len(rows):,}…", flush=True)

    total = sum(stat.values())
    print(f"\n=== {total:,} CÂU CÓ LỖI, CHIA THEO KẾT CỤC ===\n")
    hdr = f"{'kết cục':<22}{'câu':>8}{'tỷ lệ':>9}"
    print(hdr)
    print("-" * len(hdr))
    for b in BUCKETS:
        print(f"{NHAN[b]:<22}{stat[b]:>8,}{stat[b] / total:>9.1%}")
    print("-" * len(hdr))
    print(f"{'CỘNG':<22}{total:>8,}{1:>9.0%}")

    tot_tot = stat["sach_han"] + stat["het_trong_tam"]
    print(f"\nngười dùng thấy câu mình SẠCH HẲN : {stat['sach_han'] / total:.1%}")
    print(f"sạch hết phần sản phẩm với tới được: {tot_tot / total:.1%}")
    print(f"sản phẩm IM LẶNG dù câu có lỗi     : {stat['khong_dung'] / total:.1%}")
    print(f"tỷ lệ lỗi được sửa (theo LỖI)      : {n_fixed_total / n_err_total:.1%}"
          "   <- con số mà các phép đo khác báo")

    print("\n=== THEO SỐ LỖI TRONG CÂU ===\n")
    h2 = f"{'số lỗi':<9}{'câu':>7}" + "".join(f"{NHAN[b]:>21}" for b in BUCKETS[:2])
    print(h2)
    print("-" * len(h2))
    for k in sorted(by_nerr):
        c = by_nerr[k]
        m = sum(c.values())
        lab = f"{k}" if k < 4 else "4+"
        print(f"{lab:<9}{m:>7,}"
              + "".join(f"{c[b] / m:>20.1%} " for b in BUCKETS[:2]))
    print("\nCâu một lỗi thì còn có cửa sạch hẳn. Câu nhiều lỗi thì xác suất sạch"
          "\nhẳn là tích của từng lỗi một — đó là lý do câu người dùng gõ trên"
          "\nFacebook, bốn chữ ba sai, gần như chắc chắn không sạch.")

    if untouched:
        print("\n=== VÍ DỤ CÂU SẢN PHẨM IM LẶNG HOÀN TOÀN ===")
        for s, e in untouched:
            print(f"\n  {s}\n    lỗi thật: {e}")

    res = Path(args.result)
    res.parent.mkdir(parents=True, exist_ok=True)
    res.write_text(json.dumps({
        "_meta": {"model": str(args.onnx), "cau": total,
                  "held_out": bool(args.held_out),
                  "threshold": args.threshold, "margin": args.margin,
                  "consonant_threshold": args.consonant_threshold,
                  "pham_vi": "chỉ tầng model, chưa tính tầng luật"},
        "theo_cau": {b: stat[b] for b in BUCKETS},
        "ty_le_cau": {b: stat[b] / total for b in BUCKETS},
        "ty_le_theo_loi": n_fixed_total / n_err_total,
        "theo_so_loi": {str(k): dict(v) for k, v in by_nerr.items()},
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nđã lưu -> {res}")


if __name__ == "__main__":
    main()
