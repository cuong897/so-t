"""Đo thật bốn chính sách cổng cho token PHI TỪ — trên cùng một lượt chạy model.

`oov_headroom.py` cho trần trên bằng cách đếm từ điển. File này chạy model thật
và áp bốn luật quyết định lên CÙNG một bộ logit, nên bốn cột so được với nhau
mà không tốn bốn lần suy luận.

Bốn chính sách:

  P0  hiện tại      — p >= 0,95 và p - KEEP >= 0,25, áp cho mọi token
  P1  phi từ bỏ KEEP — token không có trong từ điển thì KEEP là phương án SAI
                       chắc chắn; bỏ nó khỏi softmax, chuẩn hoá lại phần còn
                       lại, rồi vẫn đòi p >= 0,95
  P2  P1 + bỏ qua chữ hoa giữa câu — tên riêng là nguồn gạch oan chính của P1
  P3  phi từ hạ ngưỡng — giữ KEEP trong softmax nhưng chỉ đòi p >= 0,80,
                       không đòi biên

Đo hai đầu, và đầu thứ hai mới giữ cho phép đo lương thiện:

  VSEC giữ kín, trong tầm  -> P/R/F1
  văn bản ĐÚNG             -> bao nhiêu phần trăm câu bị gạch oan

**Chưa phải bản để ship.** Luật quyết định hiện nằm ở BỐN chỗ (onnxEngine.js,
evaluate.py, false_alarm.py, consonant_eval.py). File này cài đặt nó lần thứ
năm, cố ý, để bốn chính sách dùng chung đúng một đường trong phạm vi thí nghiệm.
Muốn ship thì phải gộp về một chỗ trước, nếu không thì phép đo và sản phẩm lại
tách nhau ra — đúng cái bẫy số 3 của dự án.

    python oov_gate_eval.py --limit 1500 --clean-limit 2000
"""

from __future__ import annotations
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

import vi
from encoding import encode_words, first_subword_index
from evaluate import load_vsec
from noise import load_lexicon

OOV_SWEEP = [0.80, 0.85, 0.90, 0.93]
POLICIES = ["P0", "P1", "P2"] + [f"T{t:.2f}" for t in OOV_SWEEP]


def decide(p: np.ndarray, allowed: list[str], token: str, in_lex: bool,
           first_word: bool, policy: str,
           threshold: float, margin: float, oov_threshold: float) -> str:
    """Trả về nhãn chọn, hoặc 'KEEP'. p đã là softmax trên đúng `allowed`."""
    keep_p = float(p[allowed.index("KEEP")]) if "KEEP" in allowed else 0.0
    best, best_p = None, 0.0
    for j, t in enumerate(allowed):
        if t != "KEEP" and p[j] > best_p:
            best, best_p = t, float(p[j])
    if best is None:
        return "KEEP"

    if policy == "P0" or in_lex:
        return best if best_p >= threshold and best_p - keep_p >= margin else "KEEP"

    if policy == "P2" and not first_word and token[:1].isupper():
        # Tên riêng: từ điển không có chúng, nên "phi từ" ở đây không có nghĩa
        # là viết sai. Đây là nguồn gạch oan chính của P1.
        return best if best_p >= threshold and best_p - keep_p >= margin else "KEEP"

    if policy in ("P1", "P2"):
        # KEEP là phương án sai chắc chắn -> bỏ khỏi softmax, chuẩn hoá lại.
        denom = 1.0 - keep_p
        renorm = best_p / denom if denom > 1e-9 else 1.0
        return best if renorm >= threshold else "KEEP"

    # T<x>: giữ KEEP nhưng hạ ngưỡng riêng cho phi từ, bỏ điều kiện biên.
    return best if best_p >= float(policy[1:]) else "KEEP"


def probs(sess, tok, words, lexicon, max_len):
    """Một lượt chạy model -> [(w, allowed, p)] cho mọi từ có ứng viên."""
    ids, word_ids = encode_words(tok, words, max_len)
    first = first_subword_index(word_ids, len(words))
    logits = sess.run(None, {
        "input_ids": np.array([ids], dtype=np.int64),
        "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
    })[0][0]
    out = []
    for w, token in enumerate(words):
        pos = first[w]
        if pos < 0:
            continue
        allowed = vi.applicable_tags(token, lexicon)
        if len(allowed) <= 1:
            continue
        z = logits[pos, [vi.TAG_INDEX[t] for t in allowed]].astype(np.float64)
        e = np.exp(z - z.max())
        out.append((w, allowed, e / e.sum()))
    return out


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", type=Path,
                    default=Path("../extension/models/soat.int8.onnx"))
    ap.add_argument("--tokenizer", type=Path, default=Path("out/student768_v4/best"))
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--vsec", type=Path, default=Path("data/raw/VSEC.jsonl"))
    ap.add_argument("--test-data", type=Path, default=Path("data/test.jsonl"))
    ap.add_argument("--limit", type=int, default=1500)
    ap.add_argument("--clean-limit", type=int, default=2000)
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--threshold", type=float, default=0.95)
    ap.add_argument("--margin", type=float, default=0.25)
    ap.add_argument("--oov-threshold", type=float, default=0.80)
    ap.add_argument("--result", default="out/oov_gate_eval.json")
    args = ap.parse_args()

    import onnxruntime as ort
    from transformers import AutoTokenizer

    lexicon = load_lexicon(args.lexicon)
    tokzr = AutoTokenizer.from_pretrained(args.tokenizer)
    o = ort.SessionOptions()
    o.intra_op_num_threads = 1
    sess = ort.InferenceSession(str(args.onnx), o, providers=["CPUExecutionProvider"])
    print(f"model : {args.onnx}\nngưỡng: {args.threshold}/{args.margin}, "
          f"phi từ P3 dùng {args.oov_threshold}\n")

    # --- VSEC giữ kín, khối trong tầm ---------------------------------------
    rows = load_vsec(args.vsec, split="eval")[: args.limit]
    stat = {k: Counter() for k in POLICIES}
    for n, r in enumerate(rows, 1):
        words, gold = r["wrong"], r["right"]
        want = {}
        for i, (w, c) in enumerate(zip(words, gold)):
            if w == c:
                continue
            t = vi.tag_between(w, c, lexicon)
            if t and t != "KEEP":
                want[i] = c                       # chỉ tính lỗi trong tầm bộ nhãn
        got = probs(sess, tokzr, words, lexicon, args.max_len)
        for pol in POLICIES:
            fixed = {}
            for w, allowed, p in got:
                tag = decide(p, allowed, words[w], words[w].lower() in lexicon,
                             w == 0, pol, args.threshold, args.margin,
                             args.oov_threshold)
                if tag != "KEEP":
                    fixed[w] = vi.TAGS[tag](words[w])
            for i, c in want.items():
                if fixed.get(i) == c:
                    stat[pol]["tp"] += 1
                else:
                    stat[pol]["fn"] += 1
            for i, s in fixed.items():
                if want.get(i) != s:
                    stat[pol]["fp"] += 1
        if n % 300 == 0:
            print(f"  VSEC {n:,}/{len(rows):,}…", flush=True)

    # --- văn bản ĐÚNG -------------------------------------------------------
    alarm = {k: Counter() for k in POLICIES}
    examples = {k: [] for k in POLICIES}
    with args.test_data.open(encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if n > args.clean_limit:
                break
            row = json.loads(line)
            words = [w if t == "KEEP" else vi.TAGS[t](w)
                     for w, t in zip(row["tokens"], row["tags"])]
            got = probs(sess, tokzr, words, lexicon, args.max_len)
            for pol in POLICIES:
                hits = 0
                for w, allowed, p in got:
                    tag = decide(p, allowed, words[w], words[w].lower() in lexicon,
                                 w == 0, pol, args.threshold, args.margin,
                                 args.oov_threshold)
                    if tag != "KEEP":
                        hits += 1
                        if len(examples[pol]) < 14:
                            examples[pol].append(f"{words[w]}→{vi.TAGS[tag](words[w])}")
                alarm[pol]["lan"] += hits
                if hits:
                    alarm[pol]["cau"] += 1
            if n % 300 == 0:
                print(f"  sạch {n:,}/{args.clean_limit:,}…", flush=True)

    # --- bảng ---------------------------------------------------------------
    name = {"P0": "P0 hiện tại", "P1": "P1 phi từ bỏ KEEP",
            "P2": "P2 = P1 + bỏ qua chữ hoa"}
    for t in OOV_SWEEP:
        name[f"T{t:.2f}"] = f"phi từ @{t:.2f}"
    hdr = (f"{'chính sách':<26}{'P':>8}{'R':>8}{'F1':>8}"
           f"{'tp':>6}{'fp':>5}{'fn':>6}{'báo oan':>10}")
    print("\n" + hdr)
    print("-" * len(hdr))
    out = {}
    for pol in POLICIES:
        s = stat[pol]
        pr = s["tp"] / (s["tp"] + s["fp"]) if s["tp"] + s["fp"] else 0.0
        rc = s["tp"] / (s["tp"] + s["fn"]) if s["tp"] + s["fn"] else 0.0
        f1 = 2 * pr * rc / (pr + rc) if pr + rc else 0.0
        fa = alarm[pol]["cau"] / args.clean_limit
        print(f"{name[pol]:<26}{pr:>8.4f}{rc:>8.4f}{f1:>8.4f}"
              f"{s['tp']:>6}{s['fp']:>5}{s['fn']:>6}{fa:>9.2%}")
        out[pol] = {"precision": pr, "recall": rc, "f1": f1, **dict(s),
                    "bao_oan_cau": alarm[pol]["cau"],
                    "bao_oan_lan": alarm[pol]["lan"],
                    "ty_le_bao_oan": fa}
    print("-" * len(hdr))
    for pol in POLICIES[1:]:
        print(f"\n{name[pol]} gạch thêm ở văn bản đúng: "
              + ", ".join(examples[pol][:10]))

    res = Path(args.result)
    res.parent.mkdir(parents=True, exist_ok=True)
    res.write_text(json.dumps({
        "_meta": {"model": str(args.onnx), "vsec_cau": len(rows),
                  "cau_sach": args.clean_limit, "threshold": args.threshold,
                  "margin": args.margin, "oov_threshold": args.oov_threshold},
        "chinh_sach": out,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nđã lưu -> {res}")


if __name__ == "__main__":
    main()
