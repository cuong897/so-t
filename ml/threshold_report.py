"""Gom kết quả của một đợt quét ngưỡng lại thành MỘT bảng, kèm ngưỡng chấp nhận.

Vì sao cần. Một đợt quét ba mức sinh ra chín file JSON ở ba script khác nhau.
Đọc tay chín file rồi tự ghép là chỗ dễ nhìn nhầm cột, và dễ hơn nữa là chỉ nhìn
cột mình đang mong nó đẹp. File này ghép sẵn và **tự chấm** theo ngưỡng chấp
nhận đã ghi trong `docs/decisions.md`, để câu trả lời "qua hay trượt" không phụ
thuộc vào việc ai đang đọc.

Ngưỡng chấp nhận lấy từ quyết định 29, commit 544c455 — ghi TRƯỚC khi có số.

    python threshold_report.py
"""

from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

# Quyết định 29. Sửa mấy con số này thì cũng phải sửa docs/decisions.md, và
# phải sửa TRƯỚC khi đo, không phải sau khi thấy kết quả.
BAR = {
    "precision": (">=", 0.9500),
    "bao_oan_a": ("<=", 0.0150),
    "bao_oan_b": ("<=", 0.0150),
    "phu_am": (">=", 0.4630),
    "d_gi_r": (">=", 0.3250),
    "sua_sai_dgir": ("<=", 0.0800),
}
LABEL = {
    "precision": "precision VSEC",
    "bao_oan_a": "báo oan wikipedia",
    "bao_oan_b": "báo oan VSEC",
    "phu_am": "recall phụ âm",
    "d_gi_r": "recall d/gi/r",
    "sua_sai_dgir": "sửa sai d/gi/r",
}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def first(out: Path, *names):
    """File kết quả của mốc nền không theo cùng quy ước tên với đợt quét
    (fa_v4_0.95.json chứ không phải fa_v4.json), nên thử lần lượt."""
    for n in names:
        d = load(out / n)
        if d:
            return d
    return None


def collect(out: Path, suffix: str) -> dict:
    ev = first(out, f"eval_v4{suffix}.json")
    co = first(out, f"consonant_v4{suffix}.json")
    fa = first(out, f"fa_v4{suffix}.json",
               "fa_v4_0.95.json" if not suffix else f"fa_v4{suffix}.json")
    if not (ev and co and fa):
        missing = [n for n, v in (("eval", ev), ("consonant", co), ("fa", fa)) if not v]
        raise SystemExit(
            f"thiếu {', '.join(missing)} cho cột {suffix!r}. Dừng hẳn thay vì bỏ "
            "cột đó đi: bỏ lặng một cột làm cột kế tiếp trượt vào vị trí mốc nền, "
            "mà mốc nền thì KHÔNG được chấm theo ngưỡng — tức một mức thật sự QUA "
            "có thể bị báo là không có dấu tích nào. Đã mắc đúng lỗi này một lần.")

    g = co["theo_nhom"].get("d/gi/r", {})
    n_dgir = g.get("sua_dung", 0) + g.get("bo_sot", 0) + g.get("sua_sai", 0)
    rows = {r["nguon"]: r for r in fa["ket_qua"]}
    return {
        "precision": ev["in_scope"]["precision"],
        "recall_vsec": ev["in_scope"]["recall"],
        "f1_vsec": ev["in_scope"]["f1"],
        "tp": ev["in_scope"]["tp"], "fp": ev["in_scope"]["fp"],
        "bao_oan_a": rows["wikipedia_test"]["ty_le_cau"],
        "bao_oan_b": rows["vsec_heldout_dung"]["ty_le_cau"],
        "phu_am": co["recall"],
        "d_gi_r": g.get("sua_dung", 0) / n_dgir if n_dgir else 0.0,
        "sua_sai_dgir": g.get("sua_sai", 0) / n_dgir if n_dgir else 0.0,
    }


def passes(key: str, value: float) -> bool:
    op, bar = BAR[key]
    return value >= bar if op == ">=" else value <= bar


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("out"))
    ap.add_argument("--base-suffix", default="",
                    help="hậu tố của bộ file mốc nền (mặc định: không hậu tố)")
    ap.add_argument("--sweep", nargs="*", default=["_c90", "_c85", "_c80"])
    args = ap.parse_args()

    cols = [("0,95 (đang ship)", args.base_suffix)]
    cols += [(f"phụ âm @0,{s[2:]}", s) for s in args.sweep]
    data = [(name, collect(args.out, sfx)) for name, sfx in cols]
    if len(data) < 2:
        raise SystemExit("cần ít nhất mốc nền và một mức để so")

    w = 18
    print(f"{'thước đo':<20}" + "".join(f"{n:>{w}}" for n, _ in data)
          + f"{'ngưỡng':>14}")
    print("-" * (20 + w * len(data) + 14))

    def line(key, fmt, bar_txt):
        cells = []
        for i, (_, d) in enumerate(data):
            v = fmt(d[key])
            if i and key in BAR:
                v += " ✓" if passes(key, d[key]) else " ✗"
            cells.append(v)
        print(f"{LABEL.get(key, key):<20}"
              + "".join(f"{c:>{w}}" for c in cells) + f"{bar_txt:>14}")

    pct = lambda x: f"{x:.2%}"
    num = lambda x: f"{x:.4f}"
    line("precision", num, ">= 0,9500")
    print(f"{'recall VSEC':<20}"
          + "".join(f"{d['recall_vsec']:>{w}.4f}" for _, d in data) + f"{'—':>14}")
    print(f"{'F1 VSEC':<20}"
          + "".join(f"{d['f1_vsec']:>{w}.4f}" for _, d in data) + f"{'—':>14}")
    line("bao_oan_a", pct, "<= 1,50%")
    line("bao_oan_b", pct, "<= 1,50%")
    line("phu_am", pct, ">= 46,30%")
    line("d_gi_r", pct, ">= 32,50%")
    line("sua_sai_dgir", pct, "<= 8,00%")

    print()
    for name, d in data[1:]:
        fail = [LABEL[k] for k in BAR if not passes(k, d[k])]
        if fail:
            print(f"  {name}: TRƯỢT — {', '.join(fail)}")
        else:
            print(f"  {name}: QUA cả năm điều kiện")

    ok = [(n, d) for n, d in data[1:] if all(passes(k, d[k]) for k in BAR)]
    print()
    if not ok:
        print("  => Không mức nào qua. GIỮ NGUYÊN 0,95 dùng chung.")
    else:
        # Quyết định 29: chọn mức thấp nhất về báo oan, không phải cao nhất về recall.
        # Cộng hai nguồn chứ không lấy max: max hay hoà nhau (cả ba mức đều
        # 1,35% ở nguồn wikipedia) và khi hoà thì min() lặng lẽ lấy phần tử đầu
        # danh sách — tức kết quả đúng vì tình cờ xếp thứ tự, không phải vì luật.
        pick = min(ok, key=lambda t: t[1]["bao_oan_a"] + t[1]["bao_oan_b"])
        print(f"  => {len(ok)} mức qua; chọn {pick[0]} (thấp nhất về báo oan, "
              "theo quyết định 29 — precision quan trọng hơn recall).")


if __name__ == "__main__":
    main()
