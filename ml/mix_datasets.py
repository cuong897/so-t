"""Trộn nhiều tập train đã sinh thành một tập, và ghi lại ĐÚNG tỷ lệ thu được.

Vì sao cần file này. Bản v3 đang ship được trộn **bằng tay** trong shell, không
để lại dấu vết nào: không biết mỗi pool lấy bao nhiêu dòng, seed nào, nên không
dựng lại được tập đã train. Một con số không dựng lại được thì không phải phép
đo.

Và có một cái bẫy riêng của bài này: **trọng số lớp trong `noise.py` là CHẶN
TRÊN, không phải thứ đặt là được.** `noise.py` bốc lớp lỗi trước rồi mới bốc
token trong lớp đó, nhưng chỉ bốc trong những lớp CÓ MẶT ở câu đang xét. Lớp
`d/gi/r` đòi âm tiết bắt đầu bằng d/gi/r mà đổi phụ âm ra vẫn là từ thật — điều
kiện hiếm — nên cấu hình 20,2% chỉ ra 11,07% thực tế. Vậy nên script này luôn
in phân bố **đo được** chứ không nhắc lại phân bố đã cấu hình.

    python mix_datasets.py --pool data:298000 --pool data_cons:61000 \
        --pool data_dgir:41000 --out data_ft_dgir --seed 13
"""

from __future__ import annotations
import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

CONSONANT_TAGS = frozenset({
    "L_N", "N_L", "CH_TR", "TR_CH", "S_X", "X_S",
    "D_GI", "GI_D", "D_R", "R_D", "GI_R", "R_GI",
    "N_NG", "NG_N", "C_T", "T_C",
})
DGIR_TAGS = frozenset({"D_GI", "GI_D", "D_R", "R_D", "GI_R", "R_GI"})


def parse_pool(spec: str) -> tuple[Path, int]:
    if ":" not in spec:
        raise SystemExit(f"--pool phải có dạng <thư mục>:<số dòng>, nhận được {spec!r}")
    path, _, n = spec.rpartition(":")
    return Path(path), int(n)


def sample(path: Path, n: int, rng: random.Random) -> list[str]:
    """Lấy n dòng ngẫu nhiên không lặp. Đọc cả file — tập lớn nhất 337MB, vừa RAM."""
    lines = path.read_text(encoding="utf-8").splitlines()
    if n > len(lines):
        raise SystemExit(f"{path} chỉ có {len(lines):,} dòng, xin {n:,}")
    rng.shuffle(lines)
    return lines[:n]


def describe(lines: list[str], label: str) -> dict:
    c = Counter()
    for line in lines:
        c.update(t for t in json.loads(line)["tags"] if t != "KEEP")
    tot = sum(c.values()) or 1
    cons = sum(v for k, v in c.items() if k in CONSONANT_TAGS)
    dgir = sum(v for k, v in c.items() if k in DGIR_TAGS)
    print(f"{label:<22}{len(lines):>9,}{tot:>10,}{cons / tot:>12.2%}{dgir / tot:>10.2%}")
    return {
        "dong": len(lines), "loi": tot,
        "phu_am": cons / tot, "d_gi_r": dgir / tot,
        "theo_nhan": {k: v for k, v in c.most_common()},
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", action="append", required=True,
                    help="<thư mục>:<số dòng> — lặp lại cho từng pool")
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--split", default="train", help="file nào trong pool được trộn")
    ap.add_argument("--dev-from", default="data",
                    help="dev/test/lexicon sao chép từ pool nào. PHẢI là pool gốc: "
                         "đổi thước đo giữa hai lần train thì hai con số không so "
                         "được với nhau.")
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()

    pools = [parse_pool(p) for p in args.pool]
    rng = random.Random(args.seed)
    args.out.mkdir(parents=True, exist_ok=True)

    hdr = f"{'pool':<22}{'dòng':>9}{'lỗi tiêm':>10}{'phụ âm':>12}{'d/gi/r':>10}"
    print(hdr)
    print("-" * len(hdr))

    mixed: list[str] = []
    report = {"pool": {}, "seed": args.seed}
    for path, n in pools:
        src = path / f"{args.split}.jsonl"
        if not src.exists():
            raise SystemExit(f"không có {src}")
        got = sample(src, n, rng)
        report["pool"][str(path)] = describe(got, str(path))
        mixed.extend(got)

    rng.shuffle(mixed)
    print("-" * len(hdr))
    report["tong"] = describe(mixed, "TRỘN XONG")

    dst = args.out / f"{args.split}.jsonl"
    dst.write_text("\n".join(mixed) + "\n", encoding="utf-8", newline="\n")
    print(f"\n-> {dst}")

    # dev/test/lexicon lấy nguyên từ pool gốc: thước đo phải cố định giữa các bản.
    base = Path(args.dev_from)
    for name in ("dev.jsonl", "test.jsonl", "lexicon.tsv"):
        src = base / name
        if src.exists():
            (args.out / name).write_bytes(src.read_bytes())
            print(f"-> {args.out / name}  (chép từ {src})")

    rep = args.out / "mix_report.json"
    rep.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"-> {rep}")


if __name__ == "__main__":
    main()
