"""Dựng dữ liệu huấn luyện từ corpus tiếng Việt sạch.

Đầu vào : file text, mỗi dòng một câu đã sạch (báo chí, Wikipedia).
Đầu ra  : JSONL {"tokens": [...], "tags": [...]} — token đã bị làm hỏng và
          nhãn sửa tương ứng cho từng token.

Quan trọng: CHIA TRAIN/DEV/TEST TRƯỚC KHI NHÌN DỮ LIỆU, và chia theo CÂU GỐC
chứ không theo mẫu đã sinh. Nếu cùng một câu gốc xuất hiện ở cả train lẫn test
dưới hai dạng hỏng khác nhau thì điểm test sẽ đẹp một cách giả tạo.
"""

from __future__ import annotations
import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

import vi
from noise import NoiseGenerator, load_lexicon, load_propensity, load_class_weights

MIN_TOKENS = 5
MAX_TOKENS = 64


def build_lexicon(corpus: Path, min_count: int = 20) -> Counter:
    """Từ điển âm tiết = âm tiết xuất hiện đủ nhiều trong corpus lớn.

    Định nghĩa thực nghiệm này đáng tin hơn mọi danh sách chép tay, và tự cập
    nhật khi corpus đổi. Nó cũng là thứ chặn model đề xuất ra chuỗi không phải
    từ ở lúc chạy.
    """
    counts = Counter()
    with corpus.open(encoding="utf-8") as f:
        for line in f:
            for tok, _, _ in vi.tokenize(vi.normalize(line)):
                counts[tok.lower()] += 1
    return Counter({w: c for w, c in counts.items() if c >= min_count})


def iter_sentences(corpus: Path):
    with corpus.open(encoding="utf-8") as f:
        for line in f:
            line = vi.normalize(line.strip())
            if not line:
                continue
            spans = vi.tokenize(line)
            if MIN_TOKENS <= len(spans) <= MAX_TOKENS:
                yield [t for t, _, _ in spans]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True, type=Path)
    ap.add_argument("--out", default=Path("data"), type=Path)
    ap.add_argument("--variants", type=int, default=2,
                    help="số bản hỏng sinh ra cho mỗi câu gốc")
    ap.add_argument("--error-rate", type=float, default=0.04)
    ap.add_argument("--propensity", type=Path, default=Path("data/propensity.json"))
    ap.add_argument("--class-weights", type=Path,
                    default=Path("data/class_weights.json"))
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)

    print("dựng từ điển âm tiết từ corpus…")
    lex_counts = build_lexicon(args.corpus)
    lex_path = args.out / "lexicon.tsv"
    with lex_path.open("w", encoding="utf-8", newline="\n") as f:
        for w, c in lex_counts.most_common():
            f.write(f"{w}\t{c}\n")
    print(f"  {len(lex_counts):,} âm tiết -> {lex_path}")

    lexicon = set(lex_counts)
    propensity = load_propensity(args.propensity)
    class_weights = load_class_weights(args.class_weights)
    if class_weights:
        print(f"trọng số lớp: ĐO ĐƯỢC từ {args.class_weights} "
              f"({len(class_weights)} lớp)")
    else:
        print("trọng số lớp: ĐANG ĐOÁN — chạy mine_errors.py trước khi train bản chính")
    print(f"bảng xu hướng lỗi: {len(propensity):,} từ"
          + ("" if propensity else "  (TRỐNG — đang dùng đều-trong-lớp, xem README)"))

    rng = random.Random(args.seed)
    gen = NoiseGenerator(lexicon=lexicon, propensity=propensity,
                         class_weights=class_weights,
                         error_rate=args.error_rate, seed=args.seed)

    # Chia theo CÂU GỐC, trước khi sinh biến thể.
    splits = {"train": [], "dev": [], "test": []}
    for tokens in iter_sentences(args.corpus):
        r = rng.random()
        key = "train" if r < 0.90 else ("dev" if r < 0.95 else "test")
        splits[key].append(tokens)

    stats = Counter()
    for name, sentences in splits.items():
        path = args.out / f"{name}.jsonl"
        n = 0
        with path.open("w", encoding="utf-8", newline="\n") as f:
            for tokens in sentences:
                # Dev/test chỉ cần một biến thể — nhiều biến thể của cùng một
                # câu làm số đo nhiễu chứ không làm nó chính xác hơn.
                for _ in range(args.variants if name == "train" else 1):
                    broken, tags = gen.corrupt_tokens(tokens)
                    f.write(json.dumps({"tokens": broken, "tags": tags},
                                       ensure_ascii=False) + "\n")
                    n += 1
                    stats.update(t for t in tags if t != "KEEP")
        print(f"{name:<6} {len(sentences):>8,} câu -> {n:>8,} mẫu  {path}")

    total = sum(stats.values())
    print(f"\ntổng lỗi tiêm: {total:,}")
    for tag, c in stats.most_common():
        print(f"  {tag:<10} {c:>8,}  {c / total:6.1%}")


if __name__ == "__main__":
    main()
