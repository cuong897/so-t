"""Chụp ảnh 1280×800 cho Chrome Web Store bằng Chrome headless.

Vì sao chụp từ trang chạy engine THẬT chứ không vẽ mockup: ảnh chụp là lời hứa
với người sắp cài. Vẽ lại gạch chân bằng CSS thì ảnh có thể đẹp hơn sản phẩm,
và người cài xong sẽ thấy khác — đó là cách nhanh nhất để ăn review 1 sao.
`dev/shots.html` nạp đúng ruleEngine.js, highlighter.js và tooltip.js mà
extension dùng, nên những gì thấy trong ảnh là những gì máy thật vẽ ra. Tầng model
không nạp trong ảnh (78MB, quá hạn chờ), nhưng trong extension thật tầng luật
cũng là tầng vẽ trước và vẽ ngay — nên ảnh đúng với khoảnh khắc người dùng thấy.

Ảnh 3 còn tự kiểm tra: nó hỏi `targets.isEligible()` xem ô mật khẩu / thẻ /
tìm kiếm có bị đọc không. Nếu một ngày nào đó danh sách loại trừ hỏng thì ảnh
in ra chữ "LỖI" thay vì âm thầm quảng cáo một thứ không còn đúng — và script
này dừng lại, không xuất ảnh.

Chạy:
    cd ml && python make_screenshots.py
"""

from __future__ import annotations
import argparse
import http.server
import json
import re
import shutil
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]

SHOTS = [
    ("1", "01-gach-chan.png", "Bắt lỗi ngay trong ô đang gõ"),
    ("2", "02-thong-ke.png", "Popup tổng kết tuần"),
    ("3", "03-rieng-tu.png", "Im lặng ở ô nhạy cảm"),
]

# chrome.* không tồn tại ngoài extension, nên popup.js sẽ ném lỗi ngay dòng
# đầu. Thay bằng bản giả CHỈ trả về số liệu minh hoạ — giao diện vẫn là
# popup.html thật, không phải bản vẽ lại.
CHROME_STUB = """<script>
window.chrome = {
  storage: { local: {
    get: async () => ({
      enabled: true,
      stats: { [weekKeyDemo()]: {
        shown: 37, accepted: 29, ignored: 3,
        byTag: { 'thieu-dau': 14, 'sai-dau': 11, 'hoi-nga': 7, 'ch-tr': 3, 's-x': 2 },
      } },
    }),
    set: async () => {},
  } },
  tabs: { query: async () => [], sendMessage: async () => {} },
};
function weekKeyDemo() {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((date - ys) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}
</script>
"""


def find_chrome() -> str:
    for c in CHROME_CANDIDATES:
        if Path(c).exists():
            return c
    found = shutil.which("chrome") or shutil.which("google-chrome") or shutil.which("chromium")
    if found:
        return found
    raise SystemExit("không tìm thấy Chrome — cài Chrome hoặc sửa CHROME_CANDIDATES")


def build_popup_demo(root: Path) -> Path:
    """Sinh dev/popup-demo.html TỪ popup.html thật, chỉ thay phần chrome.* giả.

    Sinh ra thay vì chép tay, để popup trong ảnh không bao giờ lệch với popup
    người dùng thấy.
    """
    src = (root / "extension/src/popup/popup.html").read_text(encoding="utf-8")
    out = root / "dev/popup-demo.html"

    html = src.replace(
        '<script src="popup.js" type="module"></script>',
        CHROME_STUB + '<script src="../extension/src/popup/popup.js" type="module"></script>',
    )
    assert CHROME_STUB in html, "không chèn được bản chrome giả — popup.html đã đổi?"
    # popup.html rộng 300px; phóng lên cho ảnh store đọc được.
    html = html.replace("width: 300px;", "width: 340px;")
    out.write_text(html, encoding="utf-8")
    return out


def serve(root: Path, port: int):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(root), **kw)

        def log_message(self, *a):
            pass

    httpd = socketserver.TCPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def capture(chrome: str, url: str, out: Path, profile: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--window-size=1280,800",
        # Trang phải chạy xong engine rồi mới chụp. Thiếu cờ này thì chụp
        # trúng lúc chưa vẽ gạch chân — ảnh trắng trơn mà không báo gì.
        "--virtual-time-budget=6000",
        f"--user-data-dir={profile}",
        f"--screenshot={out}",
        url,
    ], check=True, capture_output=True, timeout=120)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    # Neo theo vị trí của file này, không theo thư mục đang đứng.
    here = Path(__file__).resolve().parent
    ap.add_argument("--root", type=Path, default=here.parent)
    ap.add_argument("--out", type=Path, default=here.parent / "dist" / "store")
    ap.add_argument("--port", type=int, default=8799)
    args = ap.parse_args()

    root = args.root.resolve()
    out_dir = args.out.resolve()
    chrome = find_chrome()
    print(f"chrome: {chrome}")

    build_popup_demo(root)
    httpd = serve(root, args.port)
    profile = out_dir / "_chrome-profile"
    try:
        for shot, name, label in SHOTS:
            url = f"http://127.0.0.1:{args.port}/dev/shots.html?shot={shot}"
            dest = out_dir / name
            capture(chrome, url, dest, profile)
            size = dest.stat().st_size if dest.exists() else 0
            if not size:
                raise SystemExit(f"không chụp được {name}")
            print(f"  {name}  {size / 1024:6.0f} KB  — {label}")
    finally:
        httpd.shutdown()
        shutil.rmtree(profile, ignore_errors=True)

    try:
        import struct

        for _, name, _ in SHOTS:
            b = (out_dir / name).read_bytes()[16:24]
            w, h = struct.unpack(">II", b)
            ok = (w, h) in {(1280, 800), (640, 400)}
            print(f"  {name}: {w}×{h} " + ("(hợp lệ)" if ok
                  else "<-- SAI KÍCH THƯỚC, store chỉ nhận 1280×800 hoặc 640×400"))
    except Exception as e:                                  # noqa: BLE001
        print(f"  (không đọc được kích thước PNG: {e})")

    print(f"\nảnh ở: {out_dir}")
    print("Chrome Web Store cần ít nhất 1 ảnh; nộp cả 3 thì trang giới thiệu đầy đặn hơn.")


if __name__ == "__main__":
    main()
