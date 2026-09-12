"""Model mất điểm ở ĐÂU — chia nhỏ phần bỏ sót trước khi tiêu giờ GPU.

Biết F1 0,8710 chẳng nói được nên làm gì tiếp. Câu hỏi có ích là câu chia được
phần thua thành hai nhóm có cách sửa KHÁC HẲN nhau:

  A. Model đoán ĐÚNG nhãn nhưng xác suất dưới ngưỡng  -> hiệu chỉnh/ngưỡng,
     không cần train lại, vài phút
  B. Model đoán SAI nhãn, hoặc nhãn đúng còn không nằm trong tập ứng viên
     -> phải train lại hoặc sửa dữ liệu, vài tiếng GPU

Nếu phần lớn là A thì train thêm là lãng phí. Nếu phần lớn là B thì vặn ngưỡng
bao nhiêu cũng vô ích. Đo rồi mới chọn.

Chia thêm theo LỚP LỖI, vì hai nhóm đó không phân bố đều: lỗi phụ âm và lỗi mất
dấu là hai bài toán khác nhau với model.

Chạy:
    python diagnose.py --limit 1500
"""

from __future__ import annotations
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

import vi
from encoding import encode_words, first_subword_index
from noise import load_lexicon

PROD_THRESHOLD = 0.95
PROD_MARGIN = 0.25


def group_of(tag: str, wrong: str, right: str) -> str:
    """Quy nhãn về nhóm để đọc — cùng cách chia mà mine_errors.py dùng."""
    if tag.startswith("TONE_"):
        f = vi.get_tone(wrong)
        t = vi.get_tone(right)
        fv = f[0] if f else None
        tv = t[0] if t else None
        if fv in (vi.HOI, vi.NGA) and tv in (vi.HOI, vi.NGA):
            return "hoi_nga"
        if fv == vi.NGANG:
            return "mat_dau"
        return "sai_dau"
    if tag in ("L_N", "N_L", "CH_TR", "TR_CH", "S_X", "X_S"):
        return "phu_am_dau"
    if tag.startswith(("D_", "GI_", "R_")):
        return "d_gi_r"
    return "am_cuoi"


def predict_row(sess, tok, words, lexicon, max_len):
    """-> [(nhãn tốt nhất KHÔNG phải KEEP, p của nó, p của KEEP, tập ứng viên)]"""
    ids, word_ids = encode_words(tok, words, max_len)
    first_idx = first_subword_index(word_ids, len(words))
    logits = sess.run(None, {
        "input_ids": np.array([ids], dtype=np.int64),
        "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
    })[0][0]

    out = []
    for w, token in enumerate(words):
        pos = first_idx[w]
        if pos < 0:
            out.append(None)
            continue
        allowed = vi.applicable_tags(token, lexicon)
        if len(allowed) <= 1:
            out.append(("KEEP", 0.0, 1.0, allowed))
            continue
        idxs = [vi.TAG_INDEX[t] for t in allowed]
        z = logits[pos, idxs].astype(np.float64)
        e = np.exp(z - z.max())
        p = e / e.sum()
        keep_p = float(p[allowed.index("KEEP")]) if "KEEP" in allowed else 0.0
        best, best_p = "KEEP", 0.0
        for j, t in enumerate(allowed):
            if t != "KEEP" and p[j] > best_p:
                best, best_p = t, float(p[j])
        out.append((best, best_p, keep_p, allowed))
    return out


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", type=Path,
                    default=Path("../extension/models/soat.int8.onnx"))
    ap.add_argument("--tokenizer", type=Path, default=Path("out/student768"))
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--vsec", type=Path, default=Path("data/raw/VSEC.jsonl"))
    ap.add_argument("--limit", type=int, default=1500)
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--out", type=Path, default=Path("out/diagnose.json"))
    args = ap.parse_args()

    import onnxruntime as ort
    from transformers import AutoTokenizer
    from evaluate import load_vsec

    lexicon = load_lexicon(args.lexicon)
    tok = AutoTokenizer.from_pretrained(args.tokenizer)
    o = ort.SessionOptions()
    o.intra_op_num_threads = 1
    sess = ort.InferenceSession(str(args.onnx), o, providers=["CPUExecutionProvider"])

    rows = load_vsec(args.vsec, "eval")[: args.limit]
    print(f"VSEC giữ kín: {len(rows):,} câu\n")

    # đếm theo (nhóm lỗi, kết cục)
    tally = defaultdict(Counter)
    total = Counter()
    missed_conf = []          # p của nhãn ĐÚNG ở những ca bị bỏ sót vì ngưỡng
    wrong_pick = Counter()    # nhãn đúng -> nhãn model chọn, ở ca đoán sai

    for r in rows:
        preds = predict_row(sess, tok, r["wrong"], lexicon, args.max_len)
        for w, c, pr in zip(r["wrong"], r["right"], preds):
            if w == c or pr is None:
                continue
            gold = vi.tag_between(w, c, lexicon) or None
            if gold is None or gold == "KEEP":
                continue                      # ngoài tầm bộ nhãn
            g = group_of(gold, w, c)
            total[g] += 1

            best, best_p, keep_p, allowed = pr
            if gold not in allowed:
                tally[g]["ngoai_tap_ung_vien"] += 1
                continue
            if best != gold:
                tally[g]["doan_sai_nhan"] += 1
                wrong_pick[f"{gold}->{best}"] += 1
                continue
            # đoán đúng nhãn — chỉ còn chuyện ngưỡng
            if best_p >= PROD_THRESHOLD and best_p - keep_p >= PROD_MARGIN:
                tally[g]["bat_duoc"] += 1
            else:
                tally[g]["dung_nhung_duoi_nguong"] += 1
                missed_conf.append(best_p)

    print("=== LỖI TRONG TẦM, CHIA THEO KẾT CỤC ===\n")
    hdr = f"{'nhóm lỗi':<14}{'tổng':>7}{'bắt được':>10}{'dưới ngưỡng':>13}{'sai nhãn':>10}{'ngoài ứng viên':>16}"
    print(hdr)
    print("-" * len(hdr))
    grand = Counter()
    for g in sorted(total, key=lambda k: -total[k]):
        t = tally[g]
        grand.update(t)
        print(f"{g:<14}{total[g]:>7}{t['bat_duoc']:>10}"
              f"{t['dung_nhung_duoi_nguong']:>13}{t['doan_sai_nhan']:>10}"
              f"{t['ngoai_tap_ung_vien']:>16}")
    print("-" * len(hdr))
    n = sum(total.values())
    print(f"{'CỘNG':<14}{n:>7}{grand['bat_duoc']:>10}"
          f"{grand['dung_nhung_duoi_nguong']:>13}{grand['doan_sai_nhan']:>10}"
          f"{grand['ngoai_tap_ung_vien']:>16}")

    miss = n - grand["bat_duoc"]
    if miss:
        print(f"\n=== {miss} CA BỎ SÓT CHIA VỀ ĐÂU ===")
        a = grand["dung_nhung_duoi_nguong"]
        b = grand["doan_sai_nhan"] + grand["ngoai_tap_ung_vien"]
        print(f"  A. đoán ĐÚNG nhãn, chỉ thiếu tự tin : {a:>5}  ({a / miss:.1%})"
              f"   -> sửa bằng hiệu chỉnh, KHÔNG cần train lại")
        print(f"  B. đoán SAI, hoặc nhãn đúng không có: {b:>5}  ({b / miss:.1%})"
              f"   -> phải train lại hoặc sửa dữ liệu")

    if missed_conf:
        q = np.percentile(missed_conf, [50, 75, 90])
        print(f"\np của nhãn đúng ở {len(missed_conf)} ca 'dưới ngưỡng': "
              f"trung vị {q[0]:.3f}, p75 {q[1]:.3f}, p90 {q[2]:.3f}")
        for th in (0.8, 0.7, 0.6, 0.5):
            k = sum(1 for p in missed_conf if p >= th)
            print(f"  hạ ngưỡng xuống {th:.1f} thì cứu thêm được {k:>4} ca "
                  f"({k / n:.1%} recall)")

    if wrong_pick:
        print("\n=== ĐOÁN SAI HAY GẶP NHẤT (nhãn đúng -> nhãn model chọn) ===")
        for k, v in wrong_pick.most_common(10):
            print(f"  {k:<28} {v}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        "_meta": {"model": str(args.onnx), "cau": len(rows),
                  "threshold": PROD_THRESHOLD, "margin": PROD_MARGIN},
        "theo_nhom": {g: dict(tally[g]) for g in total},
        "tong_theo_nhom": dict(total),
        "doan_sai_hay_gap": wrong_pick.most_common(20),
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nđã lưu -> {args.out}")


if __name__ == "__main__":
    main()
