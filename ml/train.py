"""Huấn luyện bộ sửa lỗi chính tả dưới dạng PHÂN LOẠI NHÃN BIẾN ĐỔI.

Quyết định kiến trúc quan trọng nhất của dự án, và là thứ đáng nói nhất khi
phỏng vấn:

    Model KHÔNG dự đoán từ. Nó dự đoán một nhãn trong ~20 nhãn cố định
    (KEEP, HOI_NGA, CH_TR, S_X, ...), mỗi nhãn là một phép biến đổi chuỗi
    xác định.

Hệ quả:
  * Không gian đầu ra là 20 thay vì 75.000 âm tiết -> head bé, model nhẹ,
    softmax rẻ. Đây là lý do chạy được trong trình duyệt.
  * Tổng quát hoá sang từ chưa từng gặp lúc train, vì nhãn nói về phép biến
    đổi chứ không về từ cụ thể.
  * VỀ MẶT CẤU TRÚC KHÔNG THỂ BỊA. Một seq2seq mạnh hơn nhưng chậm gấp mười
    và thỉnh thoảng sinh ra từ không tồn tại. Với sản phẩm cần precision > 95%
    thì đó là đánh đổi sai.

Lúc suy luận, dự đoán còn bị chặn thêm một lần nữa: chỉ những nhãn nằm trong
applicable_tags(token, lexicon) mới được phép thắng.

Chạy:
    # 1. giáo viên
    python train.py --data data --out out/teacher --model vinai/phobert-base-v2
    # 2. học trò (distil) — đây mới là model đưa lên trình duyệt
    python train.py --data data --out out/student --teacher out/teacher --layers 4 --hidden 384
"""

from __future__ import annotations
import argparse
import json
import sys
import time
from pathlib import Path

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset
from transformers import AutoConfig, AutoModelForTokenClassification, AutoTokenizer

import vi
from noise import load_lexicon
from encoding import encode_words, first_subword_index

IGNORE = -100


class TagDataset(Dataset):
    """Đọc JSONL {"tokens": [...], "tags": [...]} và căn nhãn theo subword.

    PhoBERT dùng BPE nên một âm tiết có thể tách thành nhiều subword. Ta chỉ
    gán nhãn cho subword ĐẦU TIÊN của mỗi âm tiết; phần còn lại là IGNORE.
    Lúc suy luận cũng đọc logit ở đúng vị trí đó.
    """

    def __init__(self, path: Path, tokenizer, max_len: int = 128, limit: int = 0):
        with path.open(encoding="utf-8") as f:
            self.rows = [json.loads(l) for i, l in enumerate(f) if not limit or i < limit]
        self.tok = tokenizer
        self.max_len = max_len

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, i: int) -> dict:
        row = self.rows[i]
        ids, word_ids = encode_words(self.tok, row["tokens"], self.max_len)

        labels, prev = [], None
        for wid in word_ids:
            if wid is None or wid == prev:
                labels.append(IGNORE)
            else:
                labels.append(vi.TAG_INDEX[row["tags"][wid]])
            prev = wid

        return {"input_ids": ids, "attention_mask": [1] * len(ids), "labels": labels}


def collate(batch: list[dict], pad_id: int) -> dict:
    n = max(len(b["input_ids"]) for b in batch)
    out = {"input_ids": [], "attention_mask": [], "labels": []}
    for b in batch:
        pad = n - len(b["input_ids"])
        out["input_ids"].append(b["input_ids"] + [pad_id] * pad)
        out["attention_mask"].append(b["attention_mask"] + [0] * pad)
        out["labels"].append(b["labels"] + [IGNORE] * pad)
    return {k: torch.tensor(v) for k, v in out.items()}


def build_model(args, n_labels: int):
    """Giáo viên: nạp nguyên PhoBERT. Học trò: cắt bớt tầng, thu nhỏ hidden."""
    config = AutoConfig.from_pretrained(args.model, num_labels=n_labels)
    if args.layers:
        config.num_hidden_layers = args.layers
    if args.hidden:
        config.hidden_size = args.hidden
        config.intermediate_size = args.hidden * 4
        # num_attention_heads phải chia hết hidden_size
        config.num_attention_heads = max(1, args.hidden // 64)

    if args.layers or args.hidden:
        # Học trò khởi tạo ngẫu nhiên rồi học từ giáo viên — nạp trọng số gốc
        # vào một cấu hình khác shape sẽ hỏng.
        return AutoModelForTokenClassification.from_config(config)
    return AutoModelForTokenClassification.from_pretrained(args.model, config=config)


@torch.no_grad()
def evaluate(model, loader, device, lexicon, id2tag) -> dict:
    """Số đo theo GÓC NHÌN SẢN PHẨM, không phải accuracy theo token.

    Accuracy token vô nghĩa ở đây: 97% token là KEEP nên đoán bừa KEEP đã được
    97%. Cái đáng đo là: trong những chỗ model dám báo lỗi, bao nhiêu phần trăm
    đúng (precision), và nó bắt được bao nhiêu phần lỗi thật (recall).
    """
    model.eval()
    tp = fp = fn = 0
    for batch in loader:
        batch = {k: v.to(device) for k, v in batch.items()}
        with torch.autocast("cuda", dtype=torch.bfloat16, enabled=(device == "cuda")):
            logits = model(input_ids=batch["input_ids"],
                           attention_mask=batch["attention_mask"]).logits
        pred = logits.argmax(-1)
        mask = batch["labels"] != IGNORE
        gold = batch["labels"][mask]
        got = pred[mask]

        keep = vi.TAG_INDEX["KEEP"]
        tp += int(((got == gold) & (gold != keep)).sum())
        fp += int(((got != keep) & (got != gold)).sum())
        fn += int(((gold != keep) & (got != gold)).sum())

    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return {"precision": prec, "recall": rec, "f1": f1, "tp": tp, "fp": fp, "fn": fn}


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, default=Path("data"))
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--model", default="vinai/phobert-base-v2")
    ap.add_argument("--teacher", type=Path, default=None,
                    help="thư mục giáo viên — bật chế độ distil")
    ap.add_argument("--layers", type=int, default=None, help="số tầng của học trò")
    ap.add_argument("--hidden", type=int, default=None, help="hidden size của học trò")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=None,
                    help="mặc định tự chọn: 3e-5 khi fine-tune model đã "
                         "pretrain, 3e-4 khi học trò khởi tạo ngẫu nhiên")
    ap.add_argument("--max-len", type=int, default=96)
    ap.add_argument("--limit", type=int, default=0, help="chỉ dùng N mẫu train đầu")
    ap.add_argument("--amp", action="store_true", default=True,
                    help="mixed precision — nhanh gần gấp đôi trên GPU RTX")
    ap.add_argument("--alpha", type=float, default=0.7,
                    help="tỷ trọng loss distil so với loss nhãn cứng")
    ap.add_argument("--temperature", type=float, default=2.0)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"thiết bị: {device}")
    if device == "cuda":
        print(f"  {torch.cuda.get_device_name(0)}")

    tok = AutoTokenizer.from_pretrained(args.model)
    lexicon = load_lexicon(args.data / "lexicon.tsv")
    id2tag = {i: t for t, i in vi.TAG_INDEX.items()}

    train_ds = TagDataset(args.data / "train.jsonl", tok, args.max_len, args.limit)
    dev_ds = TagDataset(args.data / "dev.jsonl", tok, args.max_len, 4000)
    fn = lambda b: collate(b, tok.pad_token_id)
    train_dl = DataLoader(train_ds, batch_size=args.batch, shuffle=True, collate_fn=fn,
                          num_workers=0, pin_memory=(device == "cuda"))
    dev_dl = DataLoader(dev_ds, batch_size=args.batch * 2, collate_fn=fn)
    print(f"train {len(train_ds):,} mẫu | dev {len(dev_ds):,} mẫu | {len(vi.TAG_NAMES)} nhãn")

    model = build_model(args, len(vi.TAG_NAMES)).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    from_scratch = bool(args.layers or args.hidden)

    # Bảng embedding chiếm phần lớn học trò và KHÔNG nhỏ đi theo số tầng —
    # nó tỷ lệ với vocab (64k) nhân hidden. Cắt tầng gần như không giảm được
    # kích thước file; muốn nhỏ thì phải giảm hidden.
    emb = model.get_input_embeddings().weight.numel()
    print(f"tham số: {n_params / 1e6:.1f}M  "
          f"(embedding {emb / 1e6:.1f}M = {emb / n_params:.0%})")

    # Học trò dựng bằng from_config nên khởi tạo NGẪU NHIÊN, tức là train từ
    # đầu chứ không phải fine-tune. 3e-5 là mức cho fine-tune; để nguyên nó ở
    # đây thì model gần như không học được gì mà vẫn ngốn đủ số giờ GPU, và
    # loss vẫn giảm đủ đẹp để không ai nghi ngờ.
    if args.lr is None:
        args.lr = 3e-4 if from_scratch else 3e-5
        print(f"learning rate: {args.lr:g} "
              f"({'khởi tạo ngẫu nhiên' if from_scratch else 'fine-tune'}, tự chọn)")
    else:
        print(f"learning rate: {args.lr:g} (do người dùng đặt)")
        if from_scratch and args.lr < 1e-4:
            print("  CẢNH BÁO: học trò khởi tạo ngẫu nhiên mà lr < 1e-4 "
                  "thì thường không hội tụ kịp.")

    teacher = None
    if args.teacher:
        teacher = AutoModelForTokenClassification.from_pretrained(args.teacher).to(device)
        teacher.eval()
        for p in teacher.parameters():
            p.requires_grad = False
        print(f"distil từ {args.teacher}")

    # bfloat16 không cần GradScaler và ổn định hơn fp16 trên Ampere/Ada.
    use_amp = args.amp and device == "cuda" and torch.cuda.is_bf16_supported()
    print(f"mixed precision (bf16): {use_amp}")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    steps = len(train_dl) * args.epochs
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps)

    for epoch in range(args.epochs):
        model.train()
        t0, running = time.time(), 0.0
        for step, batch in enumerate(train_dl):
            batch = {k: v.to(device, non_blocking=True) for k, v in batch.items()}
            with torch.autocast("cuda", dtype=torch.bfloat16, enabled=use_amp):
                out = model(**batch)
            loss = out.loss

            if teacher is not None:
                with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16, enabled=use_amp):
                    t_logits = teacher(input_ids=batch["input_ids"],
                                       attention_mask=batch["attention_mask"]).logits
                mask = batch["labels"] != IGNORE
                T = args.temperature
                kd = F.kl_div(
                    F.log_softmax(out.logits[mask].float() / T, dim=-1),
                    F.softmax(t_logits[mask].float() / T, dim=-1),
                    reduction="batchmean",
                ) * (T * T)
                loss = args.alpha * kd + (1 - args.alpha) * out.loss

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            opt.zero_grad()

            running += loss.detach().item()
            if step % 200 == 0 and step:
                print(f"  epoch {epoch} step {step}/{len(train_dl)} "
                      f"loss {running / 200:.4f}")
                running = 0.0

        m = evaluate(model, dev_dl, device, lexicon, id2tag)
        args.out.mkdir(parents=True, exist_ok=True)
        model.save_pretrained(args.out)
        tok.save_pretrained(args.out)
        print(f"epoch {epoch} ({time.time() - t0:.0f}s)  "
              f"P {m['precision']:.4f}  R {m['recall']:.4f}  F1 {m['f1']:.4f}  "
              f"(tp {m['tp']} fp {m['fp']} fn {m['fn']})")

    args.out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(args.out)
    tok.save_pretrained(args.out)
    (args.out / "tags.json").write_text(
        json.dumps(vi.TAG_NAMES, ensure_ascii=False, indent=2), encoding="utf-8")

    # Ghi lại cấu hình đã train để export_onnx.py không phải đoán. Model chưa
    # bao giờ thấy chuỗi dài hơn max_len này; xuất ONNX với giá trị lớn hơn thì
    # nó vẫn chạy nhưng kém đi ở phần đuôi, và không có gì báo cho biết.
    (args.out / "train_meta.json").write_text(json.dumps({
        "max_len": args.max_len,
        "tags": vi.TAG_NAMES,
        "epochs": args.epochs,
        "lr": args.lr,
        "batch": args.batch,
        "from_scratch": from_scratch,
        "teacher": str(args.teacher) if args.teacher else None,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"đã lưu -> {args.out}  ({n_params / 1e6:.1f}M tham số)")


if __name__ == "__main__":
    main()
