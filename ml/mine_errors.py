"""Rút phân bố lỗi THẬT từ dữ liệu người gán nhãn.

Vì sao cần: `noise.py` đang dùng trọng số lớp do tôi ƯỚC LƯỢNG. Kết quả đo được
cho thấy cái giá của việc đó — F1 trên dev tự sinh 0.929, nhưng trên lỗi người
thật chỉ 0.732. Hai mươi điểm bốc hơi vì nhiễu nhân tạo không giống đời thật.

CÁI BẪY PHẢI TRÁNH: rút phân bố từ VSEC rồi đem chấm trên chính VSEC là tự lừa
mình — số sẽ đẹp lên mà không có nghĩa gì. Script này vì vậy chia VSEC làm đôi
theo một hàm băm tất định:

    nửa MINE  -> chỉ dùng để rút phân bố
    nửa EVAL  -> không bao giờ được nhìn tới ở đây; evaluate.py --held-out
                 dùng đúng nửa này

Chia theo CÂU và tất định (băm nội dung câu), nên chạy lại bao nhiêu lần cũng
ra cùng một cách chia, không cần lưu danh sách.

Đầu ra:
    data/propensity.json     {từ: hệ số nhân} — từ nào hay bị viết sai
    data/class_weights.json  {lớp lỗi: tỷ trọng} — đo được, không phải đoán
"""

from __future__ import annotations
import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

import vi

PUNCT = ".,!?;:\"'()[]{}<>«»…-–—"

#: hệ số làm mượt — từ chỉ gặp vài lần không được phép có xu hướng cực đoan
SMOOTHING = 3.0

#: chặn trên/dưới, tránh một từ hiếm chi phối toàn bộ việc sinh nhiễu.
#: Đặt 8.0 thì hơn chục từ đụng trần cùng lúc và mất hết thứ hạng giữa chúng —
#: "nỗ" sai 19/36 lần (×25 trước khi chặn) bị xếp ngang với từ sai ×9.
CLAMP = (0.2, 20.0)


def split_of(sentence: str) -> str:
    """'mine' hoặc 'eval' — tất định theo nội dung câu, không theo thứ tự file."""
    h = hashlib.sha256(sentence.encode("utf-8")).digest()[0]
    return "mine" if h < 128 else "eval"


def load_vsec(path: Path):
    with path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            pairs = []
            for a in row["annotations"]:
                w = vi.normalize(a["current_syllable"]).strip(PUNCT)
                if not w:
                    continue
                if a["is_correct"] or not a["alternative_syllables"]:
                    c = w
                else:
                    c = vi.normalize(a["alternative_syllables"][0]).strip(PUNCT) or w
                pairs.append((w, c))
            if pairs:
                yield row["text"], pairs


def class_of(correct: str, wrong: str, tag: str) -> str:
    """Cùng cách phân lớp với noise.py — hai bên phải khớp, nếu không trọng số
    đo được ở đây sẽ bị áp vào một định nghĩa lớp khác."""
    if not tag.startswith("TONE_"):
        return tag
    t_c, t_w = vi.get_tone(correct), vi.get_tone(wrong)
    o = t_c[0] if t_c else None
    b = t_w[0] if t_w else None
    if o in (vi.HOI, vi.NGA) and b in (vi.HOI, vi.NGA):
        return "hoi_nga"
    if b == vi.NGANG and o != vi.NGANG:
        return "missing"
    return "other_tone"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--vsec", type=Path, default=Path("data/raw/VSEC.jsonl"))
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--out", type=Path, default=Path("data"))
    args = ap.parse_args()

    from noise import load_lexicon
    lexicon = load_lexicon(args.lexicon) or None

    seen = Counter()      # từ đúng xuất hiện bao nhiêu lần (dù viết đúng hay sai)
    wrong = Counter()     # trong đó bị viết sai bao nhiêu lần
    classes = Counter()
    n_mine = n_eval = n_oos = 0

    for text, pairs in load_vsec(args.vsec):
        if split_of(text) != "mine":
            n_eval += 1
            continue
        n_mine += 1
        for w, c in pairs:
            seen[c.lower()] += 1
            if w == c:
                continue
            tag = vi.tag_between(w, c, lexicon)
            if not tag or tag == "KEEP":
                n_oos += 1          # ngoài tầm bộ nhãn, không tính vào trọng số
                continue
            wrong[c.lower()] += 1
            classes[class_of(c, w, tag)] += 1

    print(f"VSEC: {n_mine:,} câu nửa MINE  |  {n_eval:,} câu nửa EVAL (giữ kín)")
    print(f"lỗi trong tầm: {sum(classes.values()):,}  |  ngoài tầm: {n_oos:,}")

    # --- trọng số lớp, đo được ---
    total = sum(classes.values())
    class_weights = {k: round(v / total, 4) for k, v in classes.most_common()}
    (args.out / "class_weights.json").write_text(
        json.dumps(class_weights, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n=== trọng số lớp: ĐO ĐƯỢC so với ĐANG ĐOÁN ===")
    from noise import CONSONANT_WEIGHTS, TONE_PAIR_WEIGHTS
    guess = dict(TONE_PAIR_WEIGHTS)
    guess.update(CONSONANT_WEIGHTS)
    gtot = sum(guess.values())
    for k, v in list(class_weights.items())[:10]:
        g = guess.get(k, 0.0) / gtot
        flag = "  <-- lệch nhiều" if abs(v - g) > 0.10 else ""
        print(f"  {k:<12} đo {v:6.1%}   đoán {g:6.1%}{flag}")

    # --- xu hướng theo từng từ ---
    base = sum(wrong.values()) / max(sum(seen.values()), 1)
    propensity = {}
    for word, n in seen.items():
        if n < 2:
            continue
        rate = (wrong[word] + SMOOTHING * base) / (n + SMOOTHING)
        p = rate / base if base else 1.0
        p = max(CLAMP[0], min(CLAMP[1], p))
        if abs(p - 1.0) > 0.05:
            propensity[word] = round(p, 3)

    (args.out / "propensity.json").write_text(
        json.dumps(propensity, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\ntỷ lệ sai nền: {base:.2%}")
    print(f"bảng xu hướng: {len(propensity):,} từ -> {args.out / 'propensity.json'}")
    top = sorted(propensity.items(), key=lambda kv: -kv[1])[:12]
    print("\nnhững từ hay bị viết sai nhất (hệ số nhân):")
    for w, p in top:
        print(f"  {w:<14} ×{p:<6} ({wrong[w]}/{seen[w]} lần)")

    print("\nLƯU Ý: chỉ nửa MINE được dùng ở đây. Khi báo cáo kết quả sau khi "
          "train lại, PHẢI chấm trên nửa EVAL (evaluate.py --held-out), nếu "
          "không thì con số chỉ phản ánh việc đã nhìn trộm đáp án.")


if __name__ == "__main__":
    main()
