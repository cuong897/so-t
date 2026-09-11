"""Trích câu tiếng Việt sạch từ Wikipedia tiếng Việt (stream, không tải hết).

Chất lượng corpus quyết định chất lượng model, mà Wikipedia thì đầy bảng biểu,
danh sách, tên nước ngoài và chuỗi số. Câu bẩn lọt vào sẽ dạy model những thứ
không phải tiếng Việt, và tệ hơn: câu VỐN ĐÃ SAI CHÍNH TẢ trong corpus sẽ được
gán nhãn KEEP, dạy model bỏ qua đúng loại lỗi ta muốn bắt.

Vì vậy lọc ở đây nghiêng về phía khắt khe — thà lấy ít câu sạch còn hơn nhiều
câu bẩn.
"""

from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

import vi

SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-ZÀ-Ỹ])")
HAS_DIACRITIC = re.compile(r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]", re.I)
BAD_CHARS = re.compile(r"[<>{}\[\]|=\\/@#*_~^]")


def clean_sentences(text: str, min_tok: int, max_tok: int):
    for raw in SENT_SPLIT.split(text.replace("\n", " ")):
        s = vi.normalize(" ".join(raw.split()))
        if not s or len(s) < 20:
            continue
        if BAD_CHARS.search(s):
            continue

        toks = vi.tokenize(s)
        if not (min_tok <= len(toks) <= max_tok):
            continue

        words = [t for t, _, _ in toks]
        # Phải đủ "tiếng Việt": ít nhất 60% âm tiết có dấu phụ.
        n_diac = sum(1 for w in words if HAS_DIACRITIC.search(w))
        if n_diac / len(words) < 0.60:
            continue
        # Âm tiết tiếng Việt không dài quá 7 ký tự ("nghiêng"). Dài hơn là
        # tên nước ngoài hoặc từ dính liền.
        if sum(1 for w in words if len(w) > 7) / len(words) > 0.12:
            continue
        # Quá nhiều chữ số -> bảng biểu, niên biểu.
        if sum(c.isdigit() for c in s) / len(s) > 0.08:
            continue
        yield s


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("data/corpus.txt"))
    ap.add_argument("--target", type=int, default=400_000, help="số câu cần lấy")
    ap.add_argument("--min-tok", type=int, default=6)
    ap.add_argument("--max-tok", type=int, default=48)
    args = ap.parse_args()

    from datasets import load_dataset

    ds = load_dataset("wikimedia/wikipedia", "20231101.vi", split="train", streaming=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)

    seen: set[int] = set()
    kept = n_articles = 0
    with args.out.open("w", encoding="utf-8", newline="\n") as f:
        for row in ds:
            n_articles += 1
            for s in clean_sentences(row["text"], args.min_tok, args.max_tok):
                h = hash(s)
                if h in seen:
                    continue
                seen.add(h)
                f.write(s + "\n")
                kept += 1
                if kept >= args.target:
                    break
            if kept >= args.target:
                break
            if n_articles % 2000 == 0:
                print(f"  {n_articles:,} bài -> {kept:,} câu", flush=True)

    print(f"\nxong: {kept:,} câu từ {n_articles:,} bài -> {args.out}")
    print(f"kích thước: {args.out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
