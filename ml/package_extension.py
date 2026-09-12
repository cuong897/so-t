"""Đóng gói extension thành .zip để nộp Chrome Web Store.

Không dùng `zip -r extension/` thẳng tay, vì hai lý do đã suýt mắc:

  1. `models/_parity_cases.json` là fixture của test parity BPE, nặng 100KB và
     chẳng có việc gì trong máy người dùng. `soat.report.json` cũng vậy — nó là
     báo cáo của export_onnx.py, còn lúc chạy thì index.js chỉ đọc soat.meta.json.
  2. Thiếu `vendor/` hoặc `models/` thì extension vẫn cài được và vẫn chạy —
     chỉ là tầng model im lặng biến mất, tầng luật gánh hết. Không có lỗi nào
     bật ra. Nên phải kiểm TRƯỚC KHI đóng gói, không phải sau khi người dùng cài.

Chạy:
    python package_extension.py
    python package_extension.py --out dist/soat-1.0.0.zip
"""

from __future__ import annotations
import argparse
import json
import sys
import zipfile
from pathlib import Path

# Thừa trong bản gửi người dùng — chỉ phục vụ test hoặc báo cáo lúc build.
EXCLUDE_NAMES = {"_parity_cases.json", "soat.report.json", ".DS_Store", "Thumbs.db"}
EXCLUDE_SUFFIX = {".map", ".pyc"}

# Thiếu bất kỳ file nào ở đây là sản phẩm hỏng một cách IM LẶNG.
REQUIRED = [
    "manifest.json",
    "src/content/index.js",
    "src/engine/ruleEngine.js",
    "src/engine/onnxEngine.js",
    "src/engine/bpe.js",
    "src/background.js",
    "src/popup/popup.html",
    "icons/16.png", "icons/48.png", "icons/128.png",
    "models/soat.int8.onnx",
    "models/soat.meta.json",
    "models/tokenizer.json",
    "models/lexicon.json",
    "vendor/ort.wasm.bundle.min.mjs",
    "vendor/ort-wasm-simd-threaded.wasm",
]


def keep(p: Path) -> bool:
    return p.name not in EXCLUDE_NAMES and p.suffix not in EXCLUDE_SUFFIX


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=Path("../extension"))
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    src = args.src.resolve()
    manifest = json.loads((src / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    out = args.out or Path(f"../dist/soat-{version}.zip")
    out = out.resolve()

    missing = [r for r in REQUIRED if not (src / r).exists()]
    if missing:
        print("THIẾU FILE — đóng gói vậy thì extension hỏng IM LẶNG:")
        for m in missing:
            print(f"  - {m}")
        if any(m.startswith("vendor/") for m in missing):
            print("\n  vendor/ tải bằng:  bash ml/fetch_vendor.sh")
        if any(m.startswith("models/") for m in missing):
            print("\n  models/ sinh bằng: cd ml && python export_tokenizer.py && "
                  "python export_onnx.py --model out/student768 "
                  "--out ../extension/models --name soat")
        raise SystemExit(1)

    files = sorted(p for p in src.rglob("*") if p.is_file() and keep(p))
    skipped = sorted(p for p in src.rglob("*") if p.is_file() and not keep(p))

    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            z.write(f, f.relative_to(src).as_posix())

    raw = sum(f.stat().st_size for f in files)
    print(f"đã đóng gói -> {out}")
    print(f"  {len(files)} file, {raw / 1e6:.1f} MB thô -> {out.stat().st_size / 1e6:.1f} MB nén")
    if skipped:
        print("  bỏ ra: " + ", ".join(p.name for p in skipped))

    print("\nphần nặng nhất:")
    for f in sorted(files, key=lambda x: -x.stat().st_size)[:4]:
        print(f"  {f.stat().st_size / 1e6:7.1f} MB  {f.relative_to(src).as_posix()}")

    print(f"\nname       : {manifest['name']}")
    print(f"version    : {version}")
    print(f"permissions: {', '.join(manifest['permissions'])}")
    print("\nNỘP TAY: https://chrome.google.com/webstore/devconsole "
          "(cần tài khoản nhà phát triển, phí 5$ một lần)")


if __name__ == "__main__":
    main()
