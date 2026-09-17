"""Kiểm tra encode_words không bao giờ để lọt một từ bị cắt dở.

Bản song song của test cuối trong test/bpe.test.mjs — hai bên khẳng định ĐÚNG
CÙNG một mảng word_ids cho cùng một cấu trúc subword. Dùng tokenizer giả để test
chạy được mà không cần file model: thứ đang được kiểm là logic cắt, không phải
bảng từ vựng.

Chạy:  python test_encoding.py
"""

from __future__ import annotations
import sys

from encoding import encode_words, first_subword_index


class FakeTok:
    """'nguyễn' là hai subword như PhoBERT thật, mọi từ khác là một."""
    bos_token_id = 0
    eos_token_id = 2
    unk_token = "<unk>"

    def tokenize(self, word):
        return ["nguy@@", "ễn"] if word == "nguyễn" else [word]

    def convert_tokens_to_ids(self, piece):
        return 100 + len(piece)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    tok = FakeTok()
    words = ["nghiêng"] * 6 + ["nguyễn", "sau", "đó"]
    bad = []

    # JS dùng -1 cho token đặc biệt, Python dùng None — quy về một dạng để so.
    def norm(xs):
        return [-1 if x is None else x for x in xs]

    ids, wids = encode_words(tok, words, 9)
    if norm(wids) != [-1, 0, 1, 2, 3, 4, 5, -1]:
        bad.append(f"maxLen 9: word_ids = {norm(wids)}")
    if first_subword_index(wids, len(words))[6] != -1:
        bad.append("maxLen 9: 'nguyễn' vẫn được chấm dù chỉ vào được một mảnh")
    if len(ids) > 9 or ids[-1] != tok.eos_token_id:
        bad.append(f"maxLen 9: ids dài {len(ids)}, cuối {ids[-1]}")

    _, wids = encode_words(tok, words, 10)
    if norm(wids) != [-1, 0, 1, 2, 3, 4, 5, 6, 6, -1]:
        bad.append(f"maxLen 10 (vừa khít): word_ids = {norm(wids)}")

    for b in bad:
        print("FAIL", b)
    if not bad:
        print("ok   không để lọt từ cắt dở, vừa khít thì nhận trọn")
    print(f"\n{len(bad)} lỗi")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
