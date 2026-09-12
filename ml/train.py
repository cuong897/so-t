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
from functools import partial
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

    def __init__(self, path: Path, tokenizer, max_len: int = 128, limit: int = 0,
                 cache: bool = True):
        self.max_len = max_len
        cache_path = path.with_suffix(f".tok{max_len}{'' if not limit else f'.{limit}'}.npz")

        if cache and cache_path.exists():
            self._load_cache(cache_path)
            return

        with path.open(encoding="utf-8") as f:
            rows = [json.loads(l) for i, l in enumerate(f) if not limit or i < limit]

        # Tokenize MỘT LẦN rồi cất, thay vì tokenize lại mỗi epoch. Với 720k mẫu
        # và 3 epoch thì cách cũ làm 2.16 triệu lượt tokenize, trong đó 1.44
        # triệu là thừa — và đó chính là lý do GPU chỉ chạy 28%.
        flat_ids, flat_labels, offsets = [], [], [0]
        for row in rows:
            ids, word_ids = encode_words(tokenizer, row["tokens"], max_len)
            labels, prev = [], None
            for wid in word_ids:
                if wid is None or wid == prev:
                    labels.append(IGNORE)
                else:
                    labels.append(vi.TAG_INDEX[row["tags"][wid]])
                prev = wid
            flat_ids.extend(ids)
            flat_labels.extend(labels)
            offsets.append(len(flat_ids))

        import numpy as np
        self.ids = np.asarray(flat_ids, dtype=np.int32)
        self.labels = np.asarray(flat_labels, dtype=np.int16)
        self.offsets = np.asarray(offsets, dtype=np.int64)
        if cache:
            np.savez(cache_path, ids=self.ids, labels=self.labels, offsets=self.offsets)

    def _load_cache(self, cache_path: Path) -> None:
        import numpy as np
        z = np.load(cache_path)
        self.ids, self.labels, self.offsets = z["ids"], z["labels"], z["offsets"]

    def __len__(self) -> int:
        return len(self.offsets) - 1

    def __getitem__(self, i: int) -> dict:
        a, b = self.offsets[i], self.offsets[i + 1]
        ids = self.ids[a:b].tolist()
        return {"input_ids": ids,
                "attention_mask": [1] * len(ids),
                "labels": self.labels[a:b].tolist()}


def collate(batch: list[dict], pad_id: int) -> dict:
    """Phải là hàm cấp module, KHÔNG được là lambda trong main().

    Windows tạo worker bằng spawn chứ không fork, nên collate_fn bị pickle sang
    tiến trình con. Lambda cục bộ không pickle được và cả lần train đổ ngay ở
    batch đầu tiên — nhưng chỉ khi num_workers > 0, nên chạy thử với workers=0
    sẽ không bao giờ thấy lỗi này.
    """
    n = max(len(b["input_ids"]) for b in batch)
    out = {"input_ids": [], "attention_mask": [], "labels": []}
    for b in batch:
        pad = n - len(b["input_ids"])
        out["input_ids"].append(b["input_ids"] + [pad_id] * pad)
        out["attention_mask"].append(b["attention_mask"] + [0] * pad)
        out["labels"].append(b["labels"] + [IGNORE] * pad)
    return {k: torch.tensor(v) for k, v in out.items()}


def copy_from_teacher(student, teacher) -> int:
    """Copy embedding, một số tầng, và cả head phân loại từ teacher sang học trò.

    Đây là cách DistilBERT khởi tạo, và là LÝ DO DUY NHẤT để chọn hidden bằng
    teacher. Nếu vẫn khởi tạo ngẫu nhiên thì model to hơn mà chẳng được gì.

    Ba thứ được copy, giá trị giảm dần:
      1. Embedding — 49M tham số đã pretrain, phần đắt nhất
      2. Các tầng encoder, lấy cách đều và LUÔN GIỮ TẦNG CUỐI (tầng gần đầu ra
         nhất mang nhiều thông tin phân loại nhất)
      3. Head phân loại — teacher đã train sẵn trên đúng 23 nhãn này

    Trả về số tầng đã copy.
    """
    s_bert, t_bert = student.roberta, teacher.roberta
    s_bert.embeddings.load_state_dict(t_bert.embeddings.state_dict())

    n_s, n_t = len(s_bert.encoder.layer), len(t_bert.encoder.layer)
    if n_s == 1:
        picks = [n_t - 1]
    else:
        picks = [round(i * (n_t - 1) / (n_s - 1)) for i in range(n_s)]
    for i, j in enumerate(picks):
        s_bert.encoder.layer[i].load_state_dict(t_bert.encoder.layer[j].state_dict())

    student.classifier.load_state_dict(teacher.classifier.state_dict())
    print(f"copy từ teacher: embedding + head + {n_s} tầng {picks}")
    return len(picks)


def build_model(args, n_labels: int, teacher=None):
    """Giáo viên: nạp nguyên PhoBERT. Học trò: cắt tầng, có thể thu nhỏ hidden."""
    config = AutoConfig.from_pretrained(args.model, num_labels=n_labels)
    if args.layers:
        config.num_hidden_layers = args.layers
    if args.hidden:
        config.hidden_size = args.hidden
        config.intermediate_size = args.hidden * 4
        # num_attention_heads phải chia hết hidden_size
        config.num_attention_heads = max(1, args.hidden // 64)

    if not (args.layers or args.hidden):
        return AutoModelForTokenClassification.from_pretrained(args.model, config=config)

    student = AutoModelForTokenClassification.from_config(config)

    # Chỉ copy được khi hidden khớp. Lệch shape thì học trò phải học từ đầu —
    # đó chính là cái giá 11 điểm F1 của bản hidden 384.
    if teacher is not None and config.hidden_size == teacher.config.hidden_size:
        copy_from_teacher(student, teacher)
        student._warm_started = True
    else:
        if teacher is not None:
            print(f"KHÔNG copy được: hidden học trò {config.hidden_size} "
                  f"khác teacher {teacher.config.hidden_size} — học từ đầu")
        student._warm_started = False
    return student


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


def save_checkpoint(out: Path, model, tok, meta: dict) -> None:
    """Ghi một checkpoint ĐỦ để nạp lại: trọng số, tokenizer, bảng nhãn, cấu hình.

    Phải đủ, không được thiếu train_meta.json: export_onnx.py đọc max_len từ
    đó, thiếu thì nó đoán, và đoán sai thì model chạy kém ở phần đuôi câu mà
    không có gì báo cho biết.
    """
    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out)
    tok.save_pretrained(out)
    (out / "tags.json").write_text(
        json.dumps(vi.TAG_NAMES, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "train_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    # line_buffering: chạy nền và pipe stdout thì Python đệm KHỐI, nên suốt cả
    # buổi train không có một dòng nào chạm đĩa — nhìn y như treo. Buổi train
    # dài hàng giờ mà không xem được tiến độ là mất luôn khả năng biết nó hỏng
    # từ lúc nào.
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
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
    ap.add_argument("--workers", type=int, default=4,
                    help="luồng nạp dữ liệu. 0 nếu gặp trục trặc trên Windows")
    ap.add_argument("--resume", type=Path, default=None,
                    help="thư mục checkpoint để train tiếp ĐÚNG NGHĨA — nạp lại "
                         "cả optimizer, scheduler và số epoch đã chạy")
    ap.add_argument("--no-cache", action="store_true",
                    help="không dùng cache token đã mã hoá")
    ap.add_argument("--amp", action="store_true", default=True,
                    help="mixed precision — nhanh gần gấp đôi trên GPU RTX")
    ap.add_argument("--alpha", type=float, default=0.7,
                    help="tỷ trọng loss distil so với loss nhãn cứng")
    ap.add_argument("--temperature", type=float, default=2.0)
    ap.add_argument("--select", choices=["f1", "precision", "none"], default="f1",
                    help="giữ thêm bản epoch tốt nhất trên dev theo số đo này "
                         "vào <out>/best. 'none' = chỉ giữ epoch cuối như cũ")
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"thiết bị: {device}")
    if device == "cuda":
        print(f"  {torch.cuda.get_device_name(0)}")

    tok = AutoTokenizer.from_pretrained(args.model)
    lexicon = load_lexicon(args.data / "lexicon.tsv")
    id2tag = {i: t for t, i in vi.TAG_INDEX.items()}

    train_ds = TagDataset(args.data / "train.jsonl", tok, args.max_len,
                          args.limit, cache=not args.no_cache)
    dev_ds = TagDataset(args.data / "dev.jsonl", tok, args.max_len, 4000,
                        cache=not args.no_cache)
    fn = partial(collate, pad_id=tok.pad_token_id)
    train_dl = DataLoader(
        train_ds, batch_size=args.batch, shuffle=True, collate_fn=fn,
        num_workers=args.workers, pin_memory=(device == "cuda"),
        persistent_workers=args.workers > 0,
        prefetch_factor=4 if args.workers > 0 else None,
    )
    dev_dl = DataLoader(dev_ds, batch_size=args.batch * 2, collate_fn=fn)
    print(f"train {len(train_ds):,} mẫu | dev {len(dev_ds):,} mẫu | {len(vi.TAG_NAMES)} nhãn")

    # Teacher phải nạp TRƯỚC model, vì học trò có thể khởi tạo từ trọng số của
    # nó khi hidden khớp — đó là khác biệt giữa "nhỏ và ngu" với "nhỏ và khá".
    teacher = None
    if args.teacher:
        teacher = AutoModelForTokenClassification.from_pretrained(args.teacher).to(device)
        teacher.eval()
        for p in teacher.parameters():
            p.requires_grad = False
        print(f"distil từ {args.teacher}")

    if args.resume:
        model = AutoModelForTokenClassification.from_pretrained(args.resume).to(device)
        warm = True
    else:
        model = build_model(args, len(vi.TAG_NAMES), teacher).to(device)
        warm = getattr(model, "_warm_started", False)
    n_params = sum(p.numel() for p in model.parameters())
    from_scratch = bool(args.layers or args.hidden) and not warm

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
        if from_scratch:
            args.lr, mode = 3e-4, "khởi tạo ngẫu nhiên"
        elif warm:
            # Học trò đã mang trọng số teacher. 3e-4 sẽ phá hỏng chúng ngay
            # những bước đầu — đúng thứ vừa bỏ công copy sang.
            args.lr, mode = 1e-4, "copy từ teacher"
        else:
            args.lr, mode = 3e-5, "fine-tune"
        print(f"learning rate: {args.lr:g} ({mode}, tự chọn)")
    else:
        print(f"learning rate: {args.lr:g} (do người dùng đặt)")
        if from_scratch and args.lr < 1e-4:
            print("  CẢNH BÁO: học trò khởi tạo ngẫu nhiên mà lr < 1e-4 "
                  "thì thường không hội tụ kịp.")

    # bfloat16 không cần GradScaler và ổn định hơn fp16 trên Ampere/Ada.
    use_amp = args.amp and device == "cuda" and torch.cuda.is_bf16_supported()
    print(f"mixed precision (bf16): {use_amp}")

    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    steps = len(train_dl) * args.epochs
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps)

    # --- resume ĐÚNG NGHĨA -------------------------------------------------
    # Chỉ nạp lại trọng số là "warm start", không phải resume: optimizer mất
    # hết momentum và OneCycleLR khởi động lại từ đầu, nên kết quả khác hẳn
    # train liền mạch. Muốn resume thật thì phải cất cả ba thứ.
    start_epoch = 0
    if args.resume:
        state = torch.load(args.resume / "trainer_state.pt", map_location=device,
                           weights_only=False)
        opt.load_state_dict(state["optimizer"])
        sched.load_state_dict(state["scheduler"])
        start_epoch = state["epoch"] + 1
        if state.get("total_steps") != steps:
            print(f"  CẢNH BÁO: lịch LR lúc trước dựng cho {state.get('total_steps')} "
                  f"step, lần này {steps}. Đổi epochs/batch giữa chừng thì lịch "
                  f"không còn khớp.")
        print(f"resume từ {args.resume}, chạy tiếp từ epoch {start_epoch}")

    # Cấu hình đã train, dựng sẵn để MỌI checkpoint ghi ra đều tự mô tả được —
    # kể cả bản <out>/best, vốn là bản sẽ đem đi xuất ONNX.
    meta = {
        "max_len": args.max_len,
        "tags": vi.TAG_NAMES,
        "epochs": args.epochs,
        "lr": args.lr,
        "batch": args.batch,
        "from_scratch": from_scratch,
        "warm_started": warm,
        "teacher": str(args.teacher) if args.teacher else None,
    }

    # Mỗi epoch trước đây ghi đè lên epoch trước, nên bản giữ lại luôn là bản
    # CUỐI chứ không phải bản TỐT NHẤT. Với sản phẩm ưu tiên precision thì hai
    # thứ đó không trùng nhau: epoch cuối có thể mạnh dạn hơn và báo sai nhiều
    # hơn. Giữ epoch cuối ở <out> (để --resume còn khớp với trainer_state.pt)
    # và giữ bản tốt nhất ở <out>/best.
    history: list[dict] = []
    best = {"epoch": -1, "score": -1.0, "metrics": None}

    for epoch in range(start_epoch, args.epochs):
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
        save_checkpoint(args.out, model, tok, meta)
        torch.save({"optimizer": opt.state_dict(),
                    "scheduler": sched.state_dict(),
                    "epoch": epoch,
                    "total_steps": steps},
                   args.out / "trainer_state.pt")
        print(f"epoch {epoch} ({time.time() - t0:.0f}s)  "
              f"P {m['precision']:.4f}  R {m['recall']:.4f}  F1 {m['f1']:.4f}  "
              f"(tp {m['tp']} fp {m['fp']} fn {m['fn']})")

        history.append({"epoch": epoch, **m})
        # >= chứ không phải >: hoà điểm thì chọn epoch SAU, vì nó trùng với
        # bản nằm ở <out> và đã được train nhiều hơn. Dùng > thì một model
        # chưa học được gì (mọi epoch đều 0) sẽ báo "epoch 0 là tốt nhất".
        if args.select != "none" and m[args.select] >= best["score"]:
            best = {"epoch": epoch, "score": m[args.select], "metrics": m}
            save_checkpoint(args.out / "best", model, tok, meta)
            (args.out / "best" / "best.json").write_text(json.dumps({
                "epoch": epoch,
                "select": args.select,
                "dev": m,
                "canh_bao": "Số đo này lấy trên dev TỰ SINH. Dev tự sinh đã ba "
                            "lần nói dối trong dự án này, và nói dối nhiều hơn "
                            "cho model tệ hơn. Trước khi ship phải chấm lại "
                            "bằng evaluate.py --held-out.",
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  -> tốt nhất tới giờ theo {args.select}, đã cất vào {args.out / 'best'}")

    save_checkpoint(args.out, model, tok, meta)
    if history:
        (args.out / "epochs.json").write_text(json.dumps({
            "select": args.select,
            "best_epoch": best["epoch"],
            "history": history,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"đã lưu -> {args.out}  ({n_params / 1e6:.1f}M tham số)")

    if best["epoch"] >= 0:
        m = best["metrics"]
        print(f"epoch tốt nhất trên dev theo {args.select}: epoch {best['epoch']}  "
              f"P {m['precision']:.4f}  R {m['recall']:.4f}  F1 {m['f1']:.4f}")
        if best["epoch"] != args.epochs - 1:
            print(f"  epoch cuối KHÔNG phải epoch tốt nhất — bản đáng ship nằm ở "
                  f"{args.out / 'best'}, còn {args.out} là epoch cuối.")
        # Dev tự sinh luôn khớp với chính phân bố đã sinh ra nó, nên nó nịnh.
        # Chênh lệch nhỏ trên dev không đủ để chọn; phải chấm trên lỗi người thật.
        print("  Đây là số trên dev TỰ SINH — chỉ dùng để xếp hạng sơ bộ. "
              "Chốt bằng:")
        print(f"    python evaluate.py --model {args.out / 'best'} --held-out --limit 1500")


if __name__ == "__main__":
    main()
