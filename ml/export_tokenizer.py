"""Xuất tokenizer và từ điển âm tiết sang định dạng bpe.js đọc được.

PhoBERT ship `vocab.txt` (fairseq dict) + `bpe.codes` (subword-nmt merges), KHÔNG
có `tokenizer.json`. Phía trình duyệt cần một file JSON duy nhất, nên phải tự
chuyển đổi.

Không tự tính lại id theo quy tắc offset của fairseq — lấy thẳng từ
`tok.get_vocab()`. Tự tính lại là mời gọi sai lệch âm thầm, mà sai id thì model
vẫn chạy, chỉ là đọc nhầm embedding và cho kết quả vô nghĩa.

Cuối script có kiểm tra parity: mã hoá cùng một tập từ bằng tokenizer Python và
bằng chính logic BPE mà bpe.js dùng, rồi so từng id.
"""

from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path


def read_merges(bpe_codes: Path) -> list[list[str]]:
    """bpe.codes kiểu subword-nmt: mỗi dòng 'a b <count>'."""
    merges = []
    with bpe_codes.open(encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) >= 2 and not line.startswith("#version"):
                merges.append([parts[0], parts[1]])
    return merges


BOUNDARY = "</w>"


def bpe_encode_js_style(word: str, ranks: dict[str, int], cont: str) -> list[str]:
    """Bản Python của thuật toán trong bpe.js — chỉ để đối chiếu, không chạy thật.

    PhoBERT theo quy ước subword-nmt: subword CÒN TIẾP gắn hậu tố '@@', subword
    cuối từ không đánh dấu. '</w>' chỉ là dấu ranh giới nội bộ lúc gộp.
    """
    symbols = list(word)
    if not symbols:
        return []
    symbols[-1] += BOUNDARY
    while True:
        best_rank, best_i = None, -1
        for i in range(len(symbols) - 1):
            r = ranks.get(symbols[i] + " " + symbols[i + 1])
            if r is not None and (best_rank is None or r < best_rank):
                best_rank, best_i = r, i
        if best_i == -1:
            break
        symbols[best_i: best_i + 2] = [symbols[best_i] + symbols[best_i + 1]]
    return [s[: -len(BOUNDARY)] if i == len(symbols) - 1 else s + cont
            for i, s in enumerate(symbols)]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="vinai/phobert-base-v2",
                    help="tên HF hoặc thư mục model đã train (đã lưu tokenizer)")
    ap.add_argument("--lexicon", type=Path, default=Path("data/lexicon.tsv"))
    ap.add_argument("--out", type=Path, default=Path("../extension/models"))
    args = ap.parse_args()

    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(args.model)
    args.out.mkdir(parents=True, exist_ok=True)

    # Lưu ra thư mục tạm để chắc chắn có bpe.codes kể cả khi nạp từ HF hub.
    tmp = Path("out/_tok"); tmp.mkdir(parents=True, exist_ok=True)
    tok.save_pretrained(tmp)

    vocab = tok.get_vocab()
    merges = read_merges(tmp / "bpe.codes")
    cont = "@@"   # hậu tố đánh dấu subword còn tiếp

    spec = {
        "model": {
            "type": "BPE",
            "vocab": vocab,
            "merges": merges,
            "unk_token": tok.unk_token,
            "continuing_subword_suffix": cont,
        },
        "added_tokens": [
            {"content": tok.bos_token, "id": tok.bos_token_id},
            {"content": tok.eos_token, "id": tok.eos_token_id},
            {"content": tok.pad_token, "id": tok.pad_token_id},
            {"content": tok.unk_token, "id": tok.unk_token_id},
        ],
    }

    tj = args.out / "tokenizer.json"
    tj.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    print(f"tokenizer -> {tj}  ({tj.stat().st_size / 1e6:.1f} MB, "
          f"{len(vocab):,} token, {len(merges):,} merge)")

    # --- từ điển âm tiết cho tầng lọc ứng viên ---
    if args.lexicon.exists():
        words = [l.split("\t")[0] for l in
                 args.lexicon.read_text(encoding="utf-8").splitlines() if l.strip()]
        lj = args.out / "lexicon.json"
        lj.write_text(json.dumps(words, ensure_ascii=False), encoding="utf-8")
        print(f"từ điển   -> {lj}  ({len(words):,} âm tiết, "
              f"{lj.stat().st_size / 1e3:.0f} KB)")
    else:
        print(f"CẢNH BÁO: không thấy {args.lexicon} — chạy dataset.py trước, "
              f"thiếu từ điển thì tầng lọc ứng viên mất tác dụng")

    # --- parity: logic của bpe.js phải cho ra đúng id như tokenizer Python ---
    ranks = {" ".join(m): i for i, m in enumerate(merges)}
    sample = ["nổ", "lực", "chia", "sẻ", "trải", "nghiệm", "nghiêng", "Wikipedia",
              "giành", "chuyện", "truyện", "nguyễn", "khuỷu", "xyzzyx", "COVID"]
    bad = 0
    for w in sample:
        want = tok.tokenize(w)
        got = bpe_encode_js_style(w, ranks, cont)
        if want != got:
            bad += 1
            print(f"  LỆCH {w}: python={want}  js={got}")
    print(f"\nparity bpe.js vs tokenizer Python: "
          f"{len(sample) - bad}/{len(sample)} khớp"
          + ("" if bad == 0 else "  <-- PHẢI SỬA TRƯỚC KHI SHIP"))


if __name__ == "__main__":
    main()
