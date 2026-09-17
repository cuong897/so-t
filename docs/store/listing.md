# Nội dung nộp Chrome Web Store

Chép thẳng từng ô. Phần nào cần bạn tự điền thì ghi rõ `[BẠN ĐIỀN]`.

---

## Thông tin cơ bản

| Ô | Giá trị |
|---|---|
| **Tên** | Soát — kiểm tra chính tả tiếng Việt |
| **Tóm tắt** (132 ký tự) | Sửa lỗi dấu tiếng Việt ngay khi bạn gõ: thiếu dấu, sai dấu, hỏi/ngã. Chạy trên máy bạn, không gửi dữ liệu đi. |
| **Danh mục** | Productivity (Năng suất) |
| **Ngôn ngữ** | Tiếng Việt |
| **Mục đích duy nhất** | Kiểm tra và gợi ý sửa lỗi chính tả tiếng Việt trong các ô nhập liệu trên trang web, xử lý hoàn toàn cục bộ. |
| **URL chính sách riêng tư** | `[BẠN ĐIỀN]` — xem ghi chú "Nơi đăng chính sách" bên dưới |

---

## Mô tả chi tiết

```
Soát bắt lỗi dấu tiếng Việt ngay trong ô bạn đang gõ — trên Facebook, Gmail,
Google Search, WordPress, hay bất kỳ trang nào có ô nhập liệu.

Toàn bộ việc kiểm tra diễn ra trên máy bạn. Không có máy chủ. Không một ký tự
nào bạn gõ rời khỏi trình duyệt.


SOÁT BẮT ĐƯỢC GÌ

• Thiếu dấu hoàn toàn — "co gang" → "cố gắng"
• Sai dấu, đặt nhầm sang thanh khác — "mạnh mẻ" → "mạnh mẽ"
• Hỏi / ngã — "nổ lực" → "nỗ lực", "chia sẽ" → "chia sẻ"
• Phụ âm đầu — ch/tr, s/x, d/gi/r, l/n
• Âm cuối — n/ng, c/t


PHẦN KHÓ NHẤT: KHI CẢ HAI CÁCH VIẾT ĐỀU ĐÚNG

Đây là chỗ từ điển và công cụ kiểm tra chính tả thông thường bó tay hoàn toàn,
vì cả hai dạng đều là từ có thật:

• "hộp sửa tươi" → "hộp sữa tươi"     (sửa và sữa đều là từ đúng)
• "dành chiến thắng" → "giành chiến thắng"
• "đọc chuyện tranh" → "đọc truyện tranh"
• "nổ lực" → "nỗ lực"                 ("nổ" là từ có thật)

Chỉ có thể phân biệt bằng ngữ cảnh cả câu. Soát dùng một mô hình ngôn ngữ
tiếng Việt chạy ngay trong trình duyệt để làm việc đó.


QUYỀN RIÊNG TƯ — KHÔNG PHẢI LỜI HỨA, MÀ LÀ KIẾN TRÚC

Trong toàn bộ mã nguồn của Soát không có một lệnh gọi mạng nào, và extension
không xin quyền truy cập mạng (host_permissions). Mã nguồn mở — kiểm được.

Model nhận diện lỗi được đóng gói sẵn trong extension và chạy bằng
WebAssembly trên máy bạn. Không có lệnh gọi mạng nào, kể cả lúc khởi động.

Không Google Analytics. Không Firebase. Không SDK theo dõi nào.

Soát tự động im lặng ở ô mật khẩu, ô thẻ ngân hàng, ô mã OTP, ô tìm kiếm và
trình soạn thảo mã nguồn.


THỐNG KÊ CỦA RIÊNG BẠN

Bấm vào biểu tượng Soát để xem tuần này bạn hay sai nhóm lỗi nào. Những con số
đó nằm trong trình duyệt của bạn và không đi đâu cả.


NÓI RÕ GIỚI HẠN

• Chưa hỗ trợ Google Docs (Google Docs vẽ chữ bằng canvas, không phải ô nhập
  liệu thông thường nên không extension nào chạm tới được).
• Với văn bản mất dấu HOÀN TOÀN (cả câu không có dấu nào), Soát bắt kém hơn
  hẳn — vì nó dựa vào ngữ cảnh, mà cả câu mất dấu thì ngữ cảnh cũng hỏng.
• Soát nhắm vào lỗi dấu ở mức âm tiết. Nó không sửa ngữ pháp, không sửa lỗi
  thừa/thiếu chữ cái kiểu "tranhh" → "tranh".
• Cần Chrome 105 trở lên.

Soát ưu tiên "thà bỏ sót còn hơn báo sai": ngưỡng được đặt chặt để hạn chế
gạch chân nhầm vào chữ bạn viết đúng.
```

---

## Giải trình quyền (ô "Permission justification")

Đội duyệt đọc đúng phần này. Mỗi ô một đoạn, viết bằng tiếng Anh.

### `storage`

```
Stores the user's own settings and counters entirely on their device via
chrome.storage.local: the on/off state, the list of words the user chose to
ignore, the list of sites where they turned the extension off, and weekly
counts of how many suggestions were shown and accepted (numbers only — no
text content, no URLs, no timestamps). Nothing is ever transmitted: the
extension contains no network calls at all, and requests no host permissions.
```

### `activeTab`

```
Used only when the user clicks the extension's toolbar icon. The popup sends a
single message to the active tab to apply the on/off toggle the user just
changed. No page content is read or collected through this permission.
```

### `offscreen`

```
The spell-checking model (an ONNX file bundled in the package) runs in a single
offscreen document shared by the whole browser, inside a Web Worker it creates.
This is purely a resource decision, measured rather than assumed: loading the
model separately in every tab costs about 280 MB of memory per tab and blocks
each page's main thread for ~160 ms while the inference session is created,
even on pages the user never types in. With one shared offscreen document, the
per-tab cost drops to under 2 MB and pages are never blocked. The offscreen
document has no UI, no access to any web page, and makes no network requests;
the text of the focused input field is passed to it over the extension's own
internal message channel and never leaves the device.
```

### Content script khớp `<all_urls>`

```
A writing assistant is only useful where the user actually writes, which is
across arbitrary sites (social networks, webmail, CMS editors, forums). The
content script reads the text of the input field the user is focused on,
checks it locally, and draws an underline. The text never leaves the browser.

The extension contains no network calls anywhere in its code and requests no
host permissions. It also deliberately ignores password fields, payment-card
fields, one-time-code fields, search boxes and code editors (see
src/content/targets.js).
```

### `web_accessible_resources`

```
Manifest V3 does not allow content scripts to be declared as ES modules, so
the content script loads its rule-engine modules via dynamic import() from
chrome.runtime.getURL(), which requires those files to be web-accessible. Only
those small script files are listed. The model and the WebAssembly runtime are
deliberately NOT web-accessible: they are loaded by the extension's own
offscreen document, which does not need that declaration, and keeping them out
of the list means a web page cannot fetch them to detect that the user has this
extension installed. All of these are static assets shipped inside the
extension package; none of them execute remote code.
```

---

## Công bố việc sử dụng dữ liệu (ô "Data usage")

Tick **không** cho toàn bộ các mục thu thập dữ liệu:

- [ ] Personally identifiable information — KHÔNG
- [ ] Health information — KHÔNG
- [ ] Financial and payment information — KHÔNG
- [ ] Authentication information — KHÔNG
- [ ] Personal communications — KHÔNG
- [ ] Location — KHÔNG
- [ ] Web history — KHÔNG
- [ ] User activity — KHÔNG
- [ ] Website content — KHÔNG

Và tick cả ba lời chứng thực:

- [x] Không bán dữ liệu người dùng cho bên thứ ba
- [x] Không dùng/chuyển dữ liệu cho mục đích ngoài chức năng chính
- [x] Không dùng/chuyển dữ liệu để xác định mức độ tín nhiệm hay cho vay

**Lưu ý về ô "Website content":** extension có *đọc* văn bản trong ô nhập liệu
để kiểm tra, nhưng không **thu thập** (collect) — Chrome định nghĩa "collect"
là truyền ra khỏi máy người dùng. Xử lý tại chỗ rồi bỏ thì không phải thu thập.
Nếu đội duyệt hỏi, trả lời đúng ý này và chỉ vào việc trong mã không có lệnh
gọi mạng nào, extension không xin `host_permissions`, và Manifest V3 cấm tải mã
từ xa.

---

## Nơi đăng chính sách riêng tư

Chrome Web Store đòi một **URL công khai**. Hai cách rẻ nhất:

1. **GitHub Pages / README** — đẩy `docs/store/privacy-policy.md` lên kho công
   khai rồi dùng link thẳng tới file. Đủ điều kiện.
2. **Landing page** — nếu dùng trang giới thiệu đã dựng kèm, đăng chính sách
   thành một mục trên đó và trỏ vào anchor.

---

## Ảnh chụp màn hình

Bắt buộc ít nhất 1 ảnh, kích thước **1280×800** hoặc **640×400** (PNG/JPEG).
Sinh bằng:

```bash
cd ml && python make_screenshots.py
```

Ảnh ra ở `dist/store/`.

---

## Những việc CHỈ BẠN LÀM ĐƯỢC

Tôi không tạo tài khoản, không trả phí và không bấm nộp thay bạn được.

1. Tạo tài khoản nhà phát triển tại
   https://chrome.google.com/webstore/devconsole — **phí 5$ một lần**
2. Đăng `privacy-policy.md` lên một URL công khai
3. Tải `dist/soat-1.0.0.zip` lên, dán nội dung từ file này vào các ô
4. Bấm "Submit for review" — duyệt thường mất vài ngày tới vài tuần; extension
   xin `<all_urls>` nên nhiều khả năng bị xét kỹ hơn mức trung bình
