"""Mã hoá danh sách âm tiết thành id, có giữ ánh xạ ngược về từng từ.

PhoBERT KHÔNG có tokenizer bản fast (`use_fast=True` âm thầm trả về bản
Python), nên `encoding.word_ids()` của HuggingFace không dùng được. Phải tự
tách từng từ rồi ghép lại.

Việc tự làm hoá ra lại tốt hơn: nó khớp chính xác với `bpe.js` phía trình
duyệt, vốn cũng tách theo từng từ. Nếu để HuggingFace nối cả câu bằng dấu cách
rồi tách lại thì ranh giới subword có thể khác — và sai lệch đó âm thầm phá
việc căn nhãn giữa lúc train và lúc chạy.
"""

from __future__ import annotations


def encode_words(tok, words: list[str], max_len: int = 96):
    """-> (ids, word_ids) với word_ids[i] là chỉ số từ, hoặc None cho token đặc biệt.

    Từ nào không vừa TRỌN trong max_len thì bỏ cả từ, kể cả mọi từ sau nó —
    không bao giờ để lọt một mảnh cụt như `nguy@@` rồi chấm nhãn trên mảnh đó
    (quyết định 32). Bản JS: BpeTokenizer.encodeWords, phải đổi cùng lúc.

    Lưu ý cho train.py: cache `.tok<max_len>.npz` đặt tên theo max_len chứ không
    theo phiên bản hàm này. Cache sinh TRƯỚC lần sửa này vẫn chứa mảnh cụt ở
    những câu dài quá cửa sổ — xoá cache nếu train lại.
    """
    ids = [tok.bos_token_id]
    word_ids: list[int | None] = [None]

    for w, word in enumerate(words):
        pieces = tok.tokenize(word) or [tok.unk_token]
        if len(ids) + len(pieces) > max_len - 1:
            break
        for p in pieces:
            ids.append(tok.convert_tokens_to_ids(p))
            word_ids.append(w)

    ids.append(tok.eos_token_id)
    word_ids.append(None)
    return ids, word_ids


def first_subword_index(word_ids: list[int | None], n_words: int) -> list[int]:
    """Vị trí subword ĐẦU TIÊN của mỗi từ; -1 nếu từ bị cắt vì vượt max_len.

    Nhãn chỉ gán ở subword đầu tiên, nên lúc suy luận cũng phải đọc logit đúng
    ở đó — nếu lệch thì model vẫn chạy, chỉ là đọc nhầm vị trí và kém đi.
    """
    out = [-1] * n_words
    for i, wid in enumerate(word_ids):
        if wid is not None and out[wid] == -1:
            out[wid] = i
    return out
