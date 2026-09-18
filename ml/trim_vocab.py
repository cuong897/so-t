"""Cắt vocab: bỏ token chưa bao giờ xuất hiện trong tập train (quyết định 41).

Vocab chỉ đi vào model qua ĐÚNG MỘT phép Gather trên ma trận embedding —
`word_embeddings.weight [64001, 768]`, chiếm 46,9 MB trong 74,2 MB initializer của bản
INT8 đang ship. Nên đây là phẫu thuật, KHÔNG phải train lại: cắt dòng, đánh số lại id,
xuất lại ONNX bằng đúng pipeline cũ.

PhoBERT đánh id = 4 + thứ tự dòng trong `vocab.txt` (fairseq dict): `<s>`=0, `<pad>`=1,
`</s>`=2, `<unk>`=3, rồi tới các dòng của vocab.txt, `<mask>` cuối cùng. Giữ nguyên quy
ước đó nghĩa là `<pad>`=1 không đổi — quan trọng, vì RoBERTa tính position id từ
padding_idx.

SAI ID LÀ LỖI HOÀN TOÀN IM LẶNG: model vẫn chạy, chỉ đọc nhầm embedding. Nên script tự
kiểm ba thứ trước khi ghi, và `export_tokenizer.py` sinh `tokenizer.json` từ chính
tokenizer mới này chứ không tự tính lại id.

Chạy:
    cd ml
    python trim_vocab.py                      # mặc định: giữ token gặp >= 1 lần
    python trim_vocab.py --min-count 5 --out out/student768_v4_trim5
"""

from __future__ import annotations
import argparse
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

import numpy as np

SPECIALS = ["<s>", "<pad>", "</s>", "<unk>"]


def dem_token(npz: Path) -> Counter:
    """Đếm id xuất hiện trong tập train ĐÃ TOKENIZE — cùng thứ model thật sự nhìn thấy."""
    z = np.load(npz)
    return Counter(z["ids"].tolist())


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, default=here / "out/student768_v4/best")
    ap.add_argument("--tokenizer", type=Path, default=here / "out/_tok",
                    help="thư mục có vocab.txt + bpe.codes gốc")
    ap.add_argument("--counts", type=Path, default=here / "data_ft_dgir/train.tok96.npz",
                    help="tập train ĐÃ tokenize của bản đang ship")
    ap.add_argument("--min-count", type=int, default=1,
                    help="giữ token xuất hiện ít nhất chừng này lần (quyết định 41: 1)")
    ap.add_argument("--out", type=Path, default=here / "out/student768_v4_trim")
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(args.tokenizer)
    vocab = tok.get_vocab()                      # token -> id cũ
    nguoc = {i: t for t, i in vocab.items()}     # id cũ -> token
    print(f"vocab gốc: {len(vocab):,} token")

    dem = dem_token(args.counts)
    print(f"tập train: {sum(dem.values()):,} vị trí, {len(dem):,} token khác nhau")

    # --- chọn token giữ lại ---------------------------------------------------
    # Thứ tự PHẢI khớp thứ tự dòng trong vocab.txt: id cũ tăng dần.
    dong_cu = args.tokenizer.joinpath("vocab.txt").read_text(encoding="utf-8").splitlines()
    giu_dong = []          # các dòng vocab.txt được giữ, đúng thứ tự cũ
    giu_id_cu = [vocab[s] for s in SPECIALS]    # 0,1,2,3
    for i, line in enumerate(dong_cu):
        token = line.split(" ")[0]
        id_cu = i + len(SPECIALS)
        if dem.get(id_cu, 0) >= args.min_count:
            giu_dong.append(line)
            giu_id_cu.append(id_cu)
    mask_id = vocab["<mask>"]
    giu_id_cu.append(mask_id)                   # <mask> luôn nằm cuối

    n_moi = len(giu_id_cu)
    print(f"giữ lại:  {n_moi:,} token  (bỏ {len(vocab) - n_moi:,})")
    print(f"embedding: {len(vocab) * 768 / 2**20:.1f} MB -> {n_moi * 768 / 2**20:.1f} MB (int8)")

    # --- kiểm TRƯỚC khi ghi ---------------------------------------------------
    assert giu_id_cu[:4] == [0, 1, 2, 3], f"token đặc biệt lệch id: {giu_id_cu[:4]}"
    assert len(set(giu_id_cu)) == len(giu_id_cu), "id trùng trong danh sách giữ"
    assert giu_id_cu == sorted(giu_id_cu), "danh sách giữ không tăng dần — id mới sẽ lệch"
    # Mọi token model từng thấy lúc train phải còn (với --min-count 1).
    if args.min_count == 1:
        thieu = [i for i in dem if i not in set(giu_id_cu)]
        assert not thieu, f"{len(thieu)} token có trong tập train mà bị bỏ: {thieu[:5]}"

    # --- thư mục tokenizer mới ------------------------------------------------
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "vocab.txt").write_text("\n".join(giu_dong) + "\n", encoding="utf-8")
    shutil.copy(args.tokenizer / "bpe.codes", args.out / "bpe.codes")
    # HAI file ghim CỨNG id của <mask> (64000 ở bản gốc): added_tokens.json và khoá
    # added_tokens_decoder trong tokenizer_config.json. Chép nguyên là tokenizer mới vẫn
    # trả id cũ, nằm NGOÀI ma trận embedding đã cắt — không lỗi nào bật ra cho tới khi
    # ai đó dùng <mask>.
    (args.out / "added_tokens.json").write_text(
        json.dumps({"<mask>": n_moi - 1}, ensure_ascii=False), encoding="utf-8")
    cfg = json.loads((args.tokenizer / "tokenizer_config.json").read_text(encoding="utf-8"))
    decoder = cfg.get("added_tokens_decoder", {})
    cu_mask = [k for k, v in decoder.items() if v.get("content") == "<mask>"]
    for k in cu_mask:
        decoder[str(n_moi - 1)] = decoder.pop(k)
    (args.out / "tokenizer_config.json").write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")

    tok_moi = AutoTokenizer.from_pretrained(args.out)
    vocab_moi = tok_moi.get_vocab()
    assert len(vocab_moi) == n_moi, f"tokenizer mới có {len(vocab_moi)} token, mong đợi {n_moi}"
    for s in SPECIALS + ["<mask>"]:
        moi = tok_moi.convert_tokens_to_ids(s)
        mong = giu_id_cu.index(vocab[s])
        assert moi == mong, f"{s}: tokenizer mới cho id {moi}, mong đợi {mong}"

    # Ánh xạ id cũ -> mới, và kiểm bằng chính tokenizer mới trên vài từ thật.
    cu_sang_moi = {cu: moi for moi, cu in enumerate(giu_id_cu)}
    for w in ["nguyễn", "chia", "sẻ", "trải", "nghiệm", "cứ", "trú", "giành", "truyện"]:
        for p in tok.tokenize(w):
            id_cu = tok.convert_tokens_to_ids(p)
            mong = cu_sang_moi.get(id_cu, cu_sang_moi[vocab["<unk>"]])
            thuc = tok_moi.convert_tokens_to_ids(p)
            assert thuc == mong, f"{w}/{p}: tokenizer mới {thuc}, ánh xạ {mong}"

    # --- cắt embedding --------------------------------------------------------
    model = AutoModelForTokenClassification.from_pretrained(args.model)
    emb = model.get_input_embeddings()
    w_cu = emb.weight.data
    assert w_cu.shape[0] == len(vocab), f"embedding {tuple(w_cu.shape)} không khớp vocab"
    chi_so = torch.tensor(giu_id_cu, dtype=torch.long)
    w_moi = w_cu.index_select(0, chi_so).clone()

    model.resize_token_embeddings(n_moi)
    model.get_input_embeddings().weight.data.copy_(w_moi)
    model.config.vocab_size = n_moi
    # padding_idx phải theo id mới của <pad> — với quy ước trên nó vẫn là 1.
    model.get_input_embeddings().padding_idx = cu_sang_moi[vocab["<pad>"]]

    # Từng dòng giữ lại phải giống hệt dòng cũ — kiểm mẫu ngẫu nhiên có hạt cố định.
    rng = np.random.default_rng(13)
    for i in rng.integers(0, n_moi, size=200):
        i = int(i)
        assert torch.equal(model.get_input_embeddings().weight.data[i], w_cu[giu_id_cu[i]]), \
            f"dòng embedding {i} không khớp dòng cũ {giu_id_cu[i]}"

    model.save_pretrained(args.out)
    # tags.json VÀ train_meta.json: export_onnx.py đọc max_len từ train_meta.json, và
    # thiếu nó thì nó lặng lẽ rơi về mặc định 128 thay vì 96 của bản train. Hậu quả đi
    # thẳng ra sản phẩm: `soat.meta.json` báo maxLen 128, cửa sổ F2 không còn chia, cả
    # đoạn không dấu câu vào một cửa sổ, từ ở cuối nằm quá sâu và model im lặng
    # (quyết định 32). Đo được: mất gạch ở 6/15 lần dán.
    for f in ("tags.json", "train_meta.json"):
        src = args.model / f
        if not src.exists():
            raise SystemExit(f"thiếu {src} — export_onnx.py sẽ đoán sai max_len")
        (args.out / f).write_bytes(src.read_bytes())
    (args.out / "vocab_map.json").write_text(json.dumps({
        "min_count": args.min_count,
        "vocab_cu": len(vocab),
        "vocab_moi": n_moi,
        "id_cu_theo_id_moi": giu_id_cu,
    }), encoding="utf-8")

    print(f"\nđã ghi -> {args.out}")
    print(f"  vocab_size: {len(vocab):,} -> {n_moi:,}")
    print("  bước sau:")
    print(f"    python export_onnx.py --model {args.out} --out ../extension/models --name soat")
    print(f"    python export_tokenizer.py --model {args.out} --lexicon data/lexicon.tsv")


if __name__ == "__main__":
    main()
