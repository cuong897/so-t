#!/usr/bin/env bash
# Tải onnxruntime-web vào extension/vendor/.
#
# MV3 CẤM nạp code từ xa, nên runtime bắt buộc phải đóng gói kèm extension.
# Dùng bản wasm-only: 73KB js + 24KB glue + 14MB wasm. Bản WebGPU cần
# .jsep.wasm nặng 27MB — gấp đôi dung lượng để đổi lấy tốc độ mà phần lớn máy
# người dùng không tận dụng được.
set -euo pipefail
VERSION="${1:-1.29.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "tải onnxruntime-web@$VERSION…"
cd "$TMP"
npm init -y >/dev/null 2>&1
npm install --no-audit --no-fund --silent "onnxruntime-web@$VERSION"

DIST="$TMP/node_modules/onnxruntime-web/dist"
mkdir -p "$ROOT/extension/vendor"
cp "$DIST/ort.wasm.bundle.min.mjs" \
   "$DIST/ort-wasm-simd-threaded.mjs" \
   "$DIST/ort-wasm-simd-threaded.wasm" \
   "$ROOT/extension/vendor/"

echo "xong:"
ls -la "$ROOT/extension/vendor/"
