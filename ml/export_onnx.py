"""Xuất ONNX + lượng tử hoá INT8, và ĐO ĐẠC TỬ TẾ.

Script này cố tình in ra đúng bộ số sẽ dùng để viết vào CV — nhưng kèm cả cái
ĐÁNH ĐỔI, vì đó mới là phần phân biệt người đã ship với người chạy notebook:

    "Quantize INT8: 135MB -> 34MB, p95 340ms -> 62ms, F1 0.940 -> 0.928.
     Chấp nhận mất 1.2 điểm F1 vì dưới 100ms là ngưỡng người dùng cảm nhận
     được, còn 1.2 điểm F1 thì không."

Ai cũng khoe được phần "nhanh hơn". Nói được mình mất gì và vì sao đổi thế là
đúng mới là thứ đáng giá.

Lưu ý khi đo: ĐO TRÊN MÁY YẾU, không đo trên máy bạn. Người dùng là sinh viên
với laptop i5 đời cũ. Và đo p95 chứ không đo trung bình — trung bình che mất
đúng những lần giật lag khiến người ta gỡ cài.
"""

from __future__ import annotations
import argparse
import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np
import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer

import vi

OPSET = 14


def total_size_mb(onnx_path: Path) -> float:
    """Kích thước THẬT, tính cả file trọng số ngoài.

    torch.onnx.export bản mới tách tensor lớn ra `<tên>.onnx.data`, nên file
    .onnx còn lại chỉ là phần vỏ vài trăm KB. Đo mỗi phần vỏ sẽ cho ra kết
    luận ngược hẳn sự thật — bản đầu của script này báo "INT8 to hơn fp32".
    """
    size = onnx_path.stat().st_size
    for sibling in onnx_path.parent.glob(onnx_path.name + ".data*"):
        size += sibling.stat().st_size
    return size / 1e6


def assert_self_contained(onnx_path: Path) -> None:
    """Model đem ship BẮT BUỘC phải tự chứa — không tham chiếu file ngoài.

    Thiếu file .data thì onnxruntime báo lỗi lúc nạp, mà lỗi đó chỉ xuất hiện
    trên máy người dùng chứ không xuất hiện lúc build.
    """
    import onnx

    model = onnx.load(str(onnx_path), load_external_data=False)
    external = [t.name for t in model.graph.initializer
                if t.HasField("data_location")
                and t.data_location == onnx.TensorProto.EXTERNAL]
    if external:
        raise SystemExit(
            f"{onnx_path.name} còn tham chiếu {len(external)} tensor ngoài "
            f"(vd {external[0]}) — không đem ship được.")


def export(model_dir: Path, out_path: Path, max_len: int) -> None:
    model = AutoModelForTokenClassification.from_pretrained(model_dir)
    model.eval()

    dummy = {
        "input_ids": torch.ones(1, max_len, dtype=torch.long),
        "attention_mask": torch.ones(1, max_len, dtype=torch.long),
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        (dummy["input_ids"], dummy["attention_mask"]),
        str(out_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch", 1: "seq"},
        },
        opset_version=OPSET,
        do_constant_folding=True,
    )
    print(f"ONNX fp32 -> {out_path}  ({total_size_mb(out_path):.1f} MB "
          f"kể cả file trọng số ngoài)")


def quantize(src: Path, dst: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)
    assert_self_contained(dst)
    print(f"ONNX int8 -> {dst}  ({total_size_mb(dst):.1f} MB, tự chứa)")


def bench(onnx_path: Path, tokenizer, n: int = 60, max_len: int = 64) -> dict:
    """Đo p50/p95 trên một câu dài trung bình, một luồng — giống hệt trong
    Web Worker của trình duyệt, không phải batch trên GPU."""
    import onnxruntime as ort

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    sess = ort.InferenceSession(str(onnx_path), opts, providers=["CPUExecutionProvider"])

    sentence = ("Cả nhóm đã nổ lực rất nhiều , mình xin chia sẽ lại một vài "
                "trãi nghiệm để mọi người dành được kết quả tốt hơn .").split()
    enc = tokenizer(sentence, is_split_into_words=True, truncation=True,
                    max_length=max_len, return_tensors="np")
    feed = {
        "input_ids": enc["input_ids"].astype(np.int64),
        "attention_mask": enc["attention_mask"].astype(np.int64),
    }

    for _ in range(10):                      # làm nóng
        sess.run(None, feed)

    times = []
    for _ in range(n):
        t0 = time.perf_counter()
        sess.run(None, feed)
        times.append((time.perf_counter() - t0) * 1000)

    times.sort()
    return {
        "p50_ms": round(statistics.median(times), 1),
        "p95_ms": round(times[int(len(times) * 0.95) - 1], 1),
        "tokens": int(feed["input_ids"].shape[1]),
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", type=Path, required=True, help="thư mục model đã train")
    ap.add_argument("--out", type=Path, default=Path("../extension/models"))
    ap.add_argument("--name", default="soat")
    ap.add_argument("--max-len", type=int, default=None,
                    help="mặc định đọc từ train_meta.json của model")
    ap.add_argument("--skip-bench", action="store_true")
    args = ap.parse_args()

    # max_len phải khớp lúc train, nếu không model chạy trên chuỗi nó chưa
    # từng thấy — vẫn ra kết quả, chỉ là kém đi ở phần đuôi và không báo gì.
    meta_path = args.model / "train_meta.json"
    if args.max_len is None:
        if meta_path.exists():
            args.max_len = json.loads(meta_path.read_text(encoding="utf-8"))["max_len"]
            print(f"max_len {args.max_len} (đọc từ train_meta.json)")
        else:
            args.max_len = 128
            print(f"max_len {args.max_len} (mặc định — không thấy train_meta.json, "
                  f"kiểm tra lại xem có khớp lúc train không)")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    fp32 = args.out / f"{args.name}.fp32.onnx"
    int8 = args.out / f"{args.name}.int8.onnx"

    export(args.model, fp32, args.max_len)
    quantize(fp32, int8)

    report = {
        "tags": vi.TAG_NAMES,
        "size_fp32_mb": round(total_size_mb(fp32), 1),
        "size_int8_mb": round(total_size_mb(int8), 1),
    }
    report["size_ratio"] = round(report["size_fp32_mb"] / report["size_int8_mb"], 1)

    if not args.skip_bench:
        report["bench_fp32"] = bench(fp32, tokenizer)
        report["bench_int8"] = bench(int8, tokenizer)

    # Metadata đi kèm model để phía JS biết bộ nhãn và max_len, không phải
    # hardcode ở hai nơi rồi lệch nhau.
    (args.out / f"{args.name}.meta.json").write_text(
        json.dumps({"tags": vi.TAG_NAMES, "max_len": args.max_len},
                   ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n=== số liệu để viết vào CV ===")
    print(f"kích thước : {report['size_fp32_mb']} MB -> {report['size_int8_mb']} MB "
          f"(nhẹ hơn {report['size_ratio']}×)")
    if "bench_int8" in report:
        f, q = report["bench_fp32"], report["bench_int8"]
        print(f"độ trễ p50 : {f['p50_ms']} ms -> {q['p50_ms']} ms")
        print(f"độ trễ p95 : {f['p95_ms']} ms -> {q['p95_ms']} ms  "
              f"({q['tokens']} subword, 1 luồng CPU)")
    print("\nCÒN THIẾU: chạy evaluate.py trên cùng tập test cho cả hai bản để "
          "điền nốt phần F1 mất bao nhiêu. Không có con số đó thì báo cáo này "
          "mới kể một nửa câu chuyện.")

    (args.out / f"{args.name}.report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
