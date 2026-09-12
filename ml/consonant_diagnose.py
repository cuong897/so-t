"""Vì SAO lớp phụ âm bỏ sót — thiếu tự tin, đoán sai, hay bị nhãn thanh điệu ăn?

`consonant_eval.py` trả lời "bao nhiêu". File này trả lời "vì sao", và câu trả
lời quyết định hướng sửa:

  * **sót vì thiếu tự tin** — nhãn đúng đã dẫn đầu, chỉ chưa đủ p. Hạ ngưỡng
    hoặc thêm dữ liệu là cứu được.
  * **sót vì đoán sai** — nhãn đúng gần như p = 0. Ngưỡng không cứu nổi, phải
    học.
  * **sửa sai** — model có bắn, mà bắn nhầm nhãn. Đây là lỗi PRECISION, tức thứ
    người dùng nhìn thấy và là thứ đáng lo nhất (quyết định 8).

Và câu hỏi then chốt cho ô thứ ba: bắn nhầm sang nhãn **phụ âm khác** hay sang
nhãn **thanh điệu**? Hai chuyện hoàn toàn khác nhau. Nhầm phụ âm là model không
phân biệt được `d` với `r`. Nhầm sang thanh điệu là model bỏ hẳn hướng phụ âm mà
với tay sang lớp phổ biến hơn — một vấn đề TIÊN NGHIỆM của đầu ra, sinh ra bởi
việc lớp thanh điệu chiếm 91% lỗi thật, và phải sửa bằng tỷ lệ dữ liệu chứ không
bằng ngưỡng.

Chạy:
    python consonant_diagnose.py --tokenizer out/student768_v3/best
    python consonant_diagnose.py --group all          # cả 6 nhóm phụ âm
    python consonant_diagnose.py --dump 8             # xem ca sửa sai cụ thể
"""

from __future__ import annotations
import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

import vi
from consonant_eval import CONSONANT_TAGS, GROUP, PROD_MARGIN, PROD_THRESHOLD
from encoding import encode_words, first_subword_index
from noise import load_lexicon

OUTCOMES = ["sua_dung", "sot_thieu_tu_tin", "sot_doan_sai", "sua_sai"]


def distribution(sess, tok, words, idx, lexicon, max_len):
    """Phân bố xác suất trên đúng tập nhãn KHẢ DỤNG tại vị trí idx."""
    ids, word_ids = encode_words(tok, words, max_len)
    pos = first_subword_index(word_ids, len(words))[idx]
    if pos < 0:
        return None
    logits = sess.run(None, {
        "input_ids": np.array([ids], dtype=np.int64),
        "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
    })[0][0]
    allowed = vi.applicable_tags(words[idx], lexicon)
    if len(allowed) <= 1:
        return None
    z = logits[pos, [vi.TAG_INDEX[t] for t in allowed]].astype(np.float64)
    e = np.exp(z - z.max())
    return allowed, e / e.sum()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", type=Path,
                    default=Path("../extension/models/soat.int8.onnx"))
    ap.add_argument("--tokenizer", type=Path, default=Path("out/student768/best"))
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--cases", type=Path, default=Path("data/consonant_eval.jsonl"))
    ap.add_argument("--group", default="d/gi/r", help="nhóm cần soi, hoặc 'all'")
    ap.add_argument("--result", default="")
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--threshold", type=float, default=PROD_THRESHOLD)
    ap.add_argument("--margin", type=float, default=PROD_MARGIN)
    ap.add_argument("--dump", type=int, default=0, help="in bao nhiêu ca sửa sai")
    args = ap.parse_args()

    import onnxruntime as ort
    from transformers import AutoTokenizer

    lexicon = load_lexicon(args.lexicon)
    tok = AutoTokenizer.from_pretrained(args.tokenizer)
    o = ort.SessionOptions()
    o.intra_op_num_threads = 1
    sess = ort.InferenceSession(str(args.onnx), o, providers=["CPUExecutionProvider"])

    cases = [json.loads(l) for l in args.cases.read_text(encoding="utf-8").splitlines()]
    if args.group != "all":
        cases = [c for c in cases if c["group"] == args.group]
    if not cases:
        raise SystemExit(f"không có ca nào thuộc nhóm {args.group!r}")
    print(f"model  : {args.onnx}")
    print(f"ngưỡng : p >= {args.threshold}, biên >= {args.margin}")
    print(f"nhóm   : {args.group} — {len(cases):,} ca\n")

    per_tag: dict[str, Counter] = defaultdict(Counter)
    wrong_to = Counter()
    p_shy: list[float] = []       # p của nhãn đúng khi nó dẫn đầu mà chưa đủ ngưỡng
    p_blind: list[float] = []     # p của nhãn đúng khi model đoán sang nhãn khác
    examples = []

    for n, c in enumerate(cases, 1):
        words = list(c["words"])
        i = c["index"]
        words[i] = c["wrong"]
        r = distribution(sess, tok, words, i, lexicon, args.max_len)
        t = c["tag"]
        if r is None:
            per_tag[t]["khong_cham"] += 1
            continue
        allowed, p = r
        keep_p = float(p[allowed.index("KEEP")]) if "KEEP" in allowed else 0.0
        right = [a for a in allowed
                 if a != "KEEP" and vi.TAGS[a](c["wrong"]) == c["right"]]
        cand = [(float(p[j]), a) for j, a in enumerate(allowed) if a != "KEEP"]
        best_p, best = max(cand)
        p_right = max((float(p[allowed.index(a)]) for a in right), default=0.0)
        fires = best_p >= args.threshold and best_p - keep_p >= args.margin

        if best in right:
            if fires:
                per_tag[t]["sua_dung"] += 1
            else:
                per_tag[t]["sot_thieu_tu_tin"] += 1
                p_shy.append(best_p)
        elif fires:
            per_tag[t]["sua_sai"] += 1
            wrong_to[best] += 1
            if len(examples) < args.dump:
                examples.append((c, best, best_p, p_right, keep_p))
        else:
            per_tag[t]["sot_doan_sai"] += 1
            p_blind.append(p_right)
        if n % 200 == 0:
            print(f"  {n:,}/{len(cases):,}…", flush=True)

    hdr = (f"{'nhãn':<8}{'ca':>5}{'sửa đúng':>11}{'sót: thiếu tự tin':>20}"
           f"{'sót: đoán sai':>16}{'SỬA SAI':>10}")
    print("\n" + hdr)
    print("-" * len(hdr))
    tot = Counter()
    for t in sorted(per_tag, key=lambda k: -sum(per_tag[k].values())):
        s = per_tag[t]
        tot.update(s)
        print(f"{t:<8}{sum(s.values()):>5}" + "".join(f"{s[k]:>{w}}" for k, w in
              zip(OUTCOMES, (11, 20, 16, 10))))
    print("-" * len(hdr))
    n_all = sum(tot.values())
    print(f"{'CỘNG':<8}{n_all:>5}" + "".join(f"{tot[k]:>{w}}" for k, w in
          zip(OUTCOMES, (11, 20, 16, 10))))
    print()
    for k in OUTCOMES:
        print(f"  {k:<20}{tot[k]:>5}  {tot[k] / n_all:>6.1%}")

    if p_shy:
        a = np.array(p_shy)
        print(f"\nsót mà nhãn đúng ĐÃ dẫn đầu (n={len(a)}): p trung vị {np.median(a):.3f}"
              f" — p>=0,90: {int((a >= 0.90).sum())} ca, p>=0,80: {int((a >= 0.80).sum())} ca")
        print("  (số ca p>=0,90 là phần hạ ngưỡng xuống 0,90 sẽ cứu được — "
              "phần còn lại phải học, không phải chỉnh ngưỡng)")
    if p_blind:
        b = np.array(p_blind)
        print(f"sót mà model đoán sang nhãn khác (n={len(b)}): p của nhãn ĐÚNG "
              f"trung vị {np.median(b):.4f}, p90 {np.quantile(b, 0.9):.3f}")

    # Ô quan trọng nhất: bắn nhầm sang PHỤ ÂM khác, hay sang THANH ĐIỆU?
    if wrong_to:
        cons = sum(v for k, v in wrong_to.items() if k in CONSONANT_TAGS)
        tone = sum(wrong_to.values()) - cons
        print(f"\n{sum(wrong_to.values())} ca SỬA SAI bắn sang:")
        print(f"  nhãn thanh điệu : {tone:>4}  {tone / sum(wrong_to.values()):>6.1%}"
              "   <- tiên nghiệm của đầu ra, sửa bằng tỷ lệ dữ liệu")
        print(f"  nhãn phụ âm khác: {cons:>4}  {cons / sum(wrong_to.values()):>6.1%}"
              "   <- thật sự không phân biệt được phụ âm")
        print("  chi tiết: " + ", ".join(f"{k} {v}" for k, v in wrong_to.most_common()))

    for c, best, bp, pr, kp in examples:
        w = list(c["words"])
        w[c["index"]] = c["wrong"]
        print(f"\n  {' '.join(w)}")
        print(f"    {c['wrong']} -> đúng {c['right']} ({c['tag']}) | model chọn "
              f"{best} p={bp:.3f}, p_đúng={pr:.3f}, p_keep={kp:.3f}")

    if args.result:
        res = Path(args.result)
        res.parent.mkdir(parents=True, exist_ok=True)
        cons = sum(v for k, v in wrong_to.items() if k in CONSONANT_TAGS)
        res.write_text(json.dumps({
            "_meta": {"model": str(args.onnx), "nhom": args.group,
                      "threshold": args.threshold, "margin": args.margin,
                      "ca": n_all},
            "theo_nhan": {t: dict(per_tag[t]) for t in per_tag},
            "cong": dict(tot),
            "sua_sai_sang_thanh_dieu": sum(wrong_to.values()) - cons,
            "sua_sai_sang_phu_am_khac": cons,
            "sot_thieu_tu_tin_p90": int((np.array(p_shy) >= 0.90).sum()) if p_shy else 0,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nđã lưu -> {res}")


if __name__ == "__main__":
    main()
