"""Tập chấm riêng cho lỗi PHỤ ÂM và ÂM CUỐI — thứ VSEC không đo nổi.

Vì sao phải có file này. `diagnose.py` cho thấy recall lệch rất nặng:

    thanh điệu        682/867 = 78,7%
    phụ âm & âm cuối   28/73  = 38,4%
    riêng d_gi_r        0/8

Nhưng n=8 thì không kết luận được gì, và càng không đo được một thay đổi có
giúp hay không. VSEC thu lỗi từ người **gõ** nên lỗi phụ âm hiếm; sản phẩm này
nhắm người **không biết viết thế nào** (quyết định 14), nơi `dành`/`giành`
và `chuyện`/`truyện` mới là chuyện thường ngày. Hai quần thể khác nhau, nên
VSEC là thước đo sai cho đúng phần làm nên điểm khác biệt của sản phẩm.

Cách dựng, và vì sao không viết tay câu mẫu:

  * Cặp nhầm lẫn khai từ chính TỪ ĐIỂN: âm tiết `a` có thật, áp một nhãn phụ âm
    ra `b` cũng có thật. **Cả hai đều là từ đúng** — đúng lớp bài toán mà từ
    điển bó tay, và chỉ ngữ cảnh mới phân biệt được.
  * Câu lấy từ `data/test.jsonl` — Wikipedia thật, và `dataset.py` chia theo
    băm câu GỐC nên model chưa từng thấy chúng lúc train.
  * Tôi tự viết câu mẫu thì tập chấm sẽ phản ánh giả định của tôi về chỗ model
    sai, chứ không phản ánh tiếng Việt. Đó đúng là cái bẫy quyết định 14 đã
    mắc một lần rồi.

Đo hai con số, và con số thứ hai mới là con số giữ cho phép đo lương thiện:

  A. RECALL   — cho câu đã bị đổi phụ âm, model có sửa lại đúng không
  B. BÁO OAN  — cho ĐÚNG câu gốc chưa đụng vào, model có gạch chân chính từ đó
                không. Không có B thì chỉ cần model báo bừa mọi phụ âm là A đẹp.

Chạy:
    python consonant_eval.py --build          # dựng tập, lưu data/consonant_eval.jsonl
    python consonant_eval.py                  # chấm model đang ship
    python consonant_eval.py --onnx <khac>    # chấm bản khác
"""

from __future__ import annotations
import argparse
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

import gate
import vi
from encoding import encode_words, first_subword_index
from noise import load_lexicon

PROD_THRESHOLD = 0.95      # phải khớp onnxEngine.js
PROD_MARGIN = 0.25

# Chỉ nhãn phụ âm đầu và âm cuối. Thanh điệu đã được VSEC đo đủ.
CONSONANT_TAGS = [
    "L_N", "N_L", "CH_TR", "TR_CH", "S_X", "X_S",
    "D_GI", "GI_D", "D_R", "R_D", "GI_R", "R_GI",
    "N_NG", "NG_N", "C_T", "T_C",
]

GROUP = {
    "L_N": "l/n", "N_L": "l/n",
    "CH_TR": "ch/tr", "TR_CH": "ch/tr",
    "S_X": "s/x", "X_S": "s/x",
    "D_GI": "d/gi/r", "GI_D": "d/gi/r", "D_R": "d/gi/r",
    "R_D": "d/gi/r", "GI_R": "d/gi/r", "R_GI": "d/gi/r",
    "N_NG": "n/ng", "NG_N": "n/ng",
    "C_T": "c/t", "T_C": "c/t",
}


def clean_sentences(path: Path, limit: int) -> list[list[str]]:
    """Câu ĐÚNG dựng lại từ tập test: áp nhãn sửa lên token đã bị làm hỏng."""
    out = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            out.append([w if t == "KEEP" else vi.TAGS[t](w)
                        for w, t in zip(row["tokens"], row["tags"])])
            if limit and len(out) >= limit:
                break
    return out


def build(args) -> None:
    """Khai cặp nhầm lẫn từ từ điển, ghép vào câu thật, cân đều theo lớp."""
    lexicon = load_lexicon(args.lexicon)
    rng = random.Random(args.seed)
    sents = clean_sentences(args.test_data, args.scan)
    print(f"quét {len(sents):,} câu test (model chưa từng thấy)")

    # vị trí ứng viên, gom theo nhãn ĐÚNG mà model sẽ phải đoán
    buckets: dict[str, list] = defaultdict(list)
    for si, words in enumerate(sents):
        if len(words) < 6:
            continue                      # câu quá ngắn thì ngữ cảnh quá mỏng
        for wi, w in enumerate(words):
            if w.lower() not in lexicon:
                continue
            for tag in CONSONANT_TAGS:
                bad = vi.TAGS[tag](w)
                if bad == w or bad.lower() not in lexicon:
                    continue
                # Nhãn model phải đoán là nhãn đưa `bad` TRỞ LẠI `w`.
                fix = vi.tag_between(bad, w, lexicon)
                if fix is None or fix == "KEEP" or fix not in CONSONANT_TAGS:
                    continue
                buckets[fix].append((si, wi, bad, w))

    print(f"\ncặp nhầm lẫn khai được ({len(buckets)} nhãn có mặt):")
    for t in CONSONANT_TAGS:
        print(f"  {t:<8} {len(buckets.get(t, [])):>7,} vị trí")

    # Cân đều: mỗi nhãn tối đa --per-tag ca. Nhãn hiếm lấy hết những gì có.
    cases = []
    for tag, pool in buckets.items():
        rng.shuffle(pool)
        seen_word = Counter()
        for si, wi, bad, good in pool:
            # Không để một từ chiếm hết một nhãn — nếu không thì "đo lớp d/gi/r"
            # hoá ra chỉ là "đo mỗi chữ giành".
            if seen_word[good.lower()] >= args.per_word:
                continue
            seen_word[good.lower()] += 1
            cases.append({
                "tag": tag, "group": GROUP[tag],
                "wrong": bad, "right": good,
                "index": wi, "words": sents[si],
            })
            if seen_word.total() >= args.per_tag:
                break

    rng.shuffle(cases)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        for c in cases:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")

    by_group = Counter(c["group"] for c in cases)
    by_tag = Counter(c["tag"] for c in cases)
    print(f"\ndựng {len(cases):,} ca -> {args.out}")
    print("  theo nhóm : " + ", ".join(f"{k} {v}" for k, v in by_group.most_common()))
    print("  theo nhãn : " + ", ".join(f"{k} {v}" for k, v in by_tag.most_common()))


def decide(sess, tok, words, idx, lexicon, max_len, threshold, margin,
           thresholds=None):
    """Model đề xuất gì tại ĐÚNG vị trí idx? -> (nhãn, p) hoặc (None, p_tốt_nhất)."""
    ids, word_ids = encode_words(tok, words, max_len)
    first = first_subword_index(word_ids, len(words))
    pos = first[idx]
    if pos < 0:
        return None, 0.0
    logits = sess.run(None, {
        "input_ids": np.array([ids], dtype=np.int64),
        "attention_mask": np.ones((1, len(ids)), dtype=np.int64),
    })[0][0]

    token = words[idx]
    allowed = vi.applicable_tags(token, lexicon)
    if len(allowed) <= 1:
        return None, 0.0
    z = logits[pos, [vi.TAG_INDEX[t] for t in allowed]].astype(np.float64)
    tag, best_p = gate.decide(z, allowed, threshold, margin, thresholds)
    return (None if tag == "KEEP" else tag), best_p


def score(args) -> None:
    import onnxruntime as ort
    from transformers import AutoTokenizer

    lexicon = load_lexicon(args.lexicon)
    tok = AutoTokenizer.from_pretrained(args.tokenizer)
    o = ort.SessionOptions()
    o.intra_op_num_threads = 1
    sess = ort.InferenceSession(str(args.onnx), o, providers=["CPUExecutionProvider"])

    # MẶC ĐỊNH là bảng đang ship (phụ âm 0,90). Truyền --consonant-threshold 0.95
    # để dựng lại cấu hình cũ mọi nhãn dùng chung một ngưỡng.
    tbl = gate.thresholds_for(args.threshold, args.consonant_threshold)
    cases = [json.loads(l) for l in args.out.read_text(encoding="utf-8").splitlines()]
    if args.limit:
        cases = cases[: args.limit]
    print(f"model  : {args.onnx}")
    print(f"ngưỡng : p >= {args.threshold}, biên >= {args.margin}")
    print(f"tập    : {len(cases):,} ca, {args.out}\n")

    stat = defaultdict(Counter)
    for n, c in enumerate(cases, 1):
        words = list(c["words"])
        i = c["index"]
        g = c["group"]

        # A. câu ĐÃ hỏng — model có sửa lại đúng không
        words[i] = c["wrong"]
        tag, _ = decide(sess, tok, words, i, lexicon, args.max_len,
                        args.threshold, args.margin, tbl)
        if tag is None:
            stat[g]["bo_sot"] += 1
        elif vi.TAGS[tag](c["wrong"]) == c["right"]:
            stat[g]["sua_dung"] += 1
        else:
            stat[g]["sua_sai"] += 1

        # B. ĐÚNG câu gốc — model có gạch oan chính từ đó không
        words[i] = c["right"]
        tag2, _ = decide(sess, tok, words, i, lexicon, args.max_len,
                         args.threshold, args.margin, tbl)
        if tag2 is not None:
            stat[g]["bao_oan"] += 1

        if n % 200 == 0:
            print(f"  {n:,}/{len(cases):,}…", flush=True)

    print("\n=== LỖI PHỤ ÂM & ÂM CUỐI ===\n")
    hdr = f"{'nhóm':<10}{'ca':>6}{'sửa đúng':>10}{'recall':>9}{'sửa sai':>9}{'báo oan':>9}"
    print(hdr)
    print("-" * len(hdr))
    tot = Counter()
    for g in sorted(stat, key=lambda k: -(stat[k]["sua_dung"] + stat[k]["bo_sot"]
                                          + stat[k]["sua_sai"])):
        s = stat[g]
        n_ = s["sua_dung"] + s["bo_sot"] + s["sua_sai"]
        tot.update(s)
        print(f"{g:<10}{n_:>6}{s['sua_dung']:>10}{s['sua_dung'] / n_:>8.1%}"
              f"{s['sua_sai']:>9}{s['bao_oan']:>9}")
    print("-" * len(hdr))
    n_all = tot["sua_dung"] + tot["bo_sot"] + tot["sua_sai"]
    print(f"{'CỘNG':<10}{n_all:>6}{tot['sua_dung']:>10}"
          f"{tot['sua_dung'] / n_all:>8.1%}{tot['sua_sai']:>9}{tot['bao_oan']:>9}")
    print(f"\nbáo oan trên chính từ viết đúng: {tot['bao_oan']}/{n_all} "
          f"= {tot['bao_oan'] / n_all:.2%}")

    res = Path(args.result)
    res.parent.mkdir(parents=True, exist_ok=True)
    res.write_text(json.dumps({
        "_meta": {"model": str(args.onnx), "threshold": args.threshold,
                  "margin": args.margin, "ca": n_all, "tap": str(args.out),
                  "consonant_threshold": args.consonant_threshold},
        "theo_nhom": {g: dict(stat[g]) for g in stat},
        "cong": dict(tot),
        "recall": tot["sua_dung"] / n_all if n_all else 0.0,
        "ty_le_bao_oan": tot["bao_oan"] / n_all if n_all else 0.0,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"đã lưu -> {res}")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true", help="dựng lại tập chấm")
    ap.add_argument("--onnx", type=Path,
                    default=Path("../extension/models/soat.int8.onnx"))
    ap.add_argument("--tokenizer", type=Path, default=Path("out/student768"))
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--test-data", type=Path, default=Path("data/test.jsonl"))
    ap.add_argument("--out", type=Path, default=Path("data/consonant_eval.jsonl"))
    ap.add_argument("--consonant-threshold", type=float, default=gate.PROD_CONSONANT,
                    help="ngưỡng RIÊNG cho nhãn phụ âm và âm cuối")
    ap.add_argument("--result", default="out/consonant_eval.json")
    ap.add_argument("--scan", type=int, default=20000)
    ap.add_argument("--per-tag", type=int, default=120)
    ap.add_argument("--per-word", type=int, default=3,
                    help="một từ tối đa bao nhiêu ca — chống việc 'đo lớp d/gi/r' "
                         "hoá ra chỉ là 'đo mỗi chữ giành'")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--threshold", type=float, default=PROD_THRESHOLD)
    ap.add_argument("--margin", type=float, default=PROD_MARGIN)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    if args.build:
        build(args)
    else:
        if not args.out.exists():
            raise SystemExit(f"chưa có {args.out} — chạy với --build trước")
        score(args)


if __name__ == "__main__":
    main()
