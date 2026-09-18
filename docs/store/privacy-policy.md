# Chính sách quyền riêng tư — Soát

**Cập nhật lần cuối: 18/09/2026**

## Tóm tắt trong một câu

Soát không thu thập, không lưu trữ và không truyền đi bất kỳ nội dung nào bạn
gõ. Toàn bộ việc kiểm tra chính tả diễn ra ngay trong trình duyệt của bạn.

## Chúng tôi thu thập gì

**Không gì cả.** Không có máy chủ nào để gửi dữ liệu tới.

Cụ thể, Soát **không** thu thập:

- Nội dung bạn gõ, kể cả một phần
- Địa chỉ trang web bạn truy cập
- Địa chỉ IP, mã định danh thiết bị, cookie
- Thông tin cá nhân, email, tên
- Dữ liệu dùng cho quảng cáo hay phân tích của bên thứ ba

## Extension lưu gì trên máy bạn

Soát lưu bốn thứ bằng `chrome.storage.local`. Chúng **nằm nguyên trong trình
duyệt của bạn** và không bao giờ rời khỏi máy:

| Lưu gì | Để làm gì |
|---|---|
| Số đếm theo tuần (số lỗi được chỉ ra, số lỗi bạn đã sửa, số lỗi bỏ qua, theo nhóm lỗi) | Vẽ bản tổng kết trong popup. Chỉ là con số — không kèm câu văn, không kèm tên miền, không kèm thời điểm chính xác. Giữ tối đa 8 tuần gần nhất. |
| Danh sách từ bạn chọn "bỏ qua" | Để không gạch chân lại từ đó |
| Danh sách trang bạn tắt Soát | Để tôn trọng lựa chọn của bạn |
| Trạng thái bật/tắt | Để nhớ cài đặt |

Gỡ cài extension là toàn bộ dữ liệu này biến mất cùng nó.

## Model chạy ở đâu

Model nhận diện lỗi (47 MB) được **đóng gói sẵn trong extension** và chạy bằng
WebAssembly ngay trên máy bạn. Không có lệnh gọi mạng nào để tải model, để chấm
câu, hay để làm bất cứ việc gì khác.

Model chạy trong một **trang ẩn của chính extension** (offscreen document) — đó là
lý do extension xin quyền `offscreen`. Trang ẩn này không hiện ra, không truy cập
được trang web nào, và tồn tại vì một lý do kỹ thuật thuần tuý: nếu model được nạp
riêng cho từng tab thì mỗi tab bạn mở sẽ tốn thêm khoảng 280 MB bộ nhớ, kể cả tab
bạn không gõ gì. Nạp một lần cho cả trình duyệt thì con số đó còn khoảng 2 MB mỗi
tab, và tổng cộng khoảng 210 MB cho toàn trình duyệt.

Hệ quả bạn nên biết: văn bản trong ô bạn đang gõ được gửi từ trang sang trang ẩn đó
bằng cơ chế nhắn tin **nội bộ của Chrome giữa các phần của chính extension này**. Nó
không đi qua mạng, không rời khỏi máy bạn, và không trang web nào đọc được. Chúng tôi
nói ra vì "xử lý tại chỗ" phải đúng tới từng chặng, không chỉ đúng ở câu tóm tắt.

## Vì sao extension không thể lén gửi dữ liệu đi

Ba lớp, nói cho đúng từng lớp một:

1. **Không có mã gọi mạng.** Trong toàn bộ extension không có `fetch` hay
   `XMLHttpRequest` nào trỏ ra ngoài — chỉ có các lệnh đọc file nằm sẵn trong gói cài
   (model, từ điển). Mã nguồn mở, kiểm được bằng một lệnh tìm kiếm.
2. **Không xin `host_permissions`.** Nói cho chính xác: điều này khiến Chrome chặn
   extension **đọc** dữ liệu từ máy chủ khác (không có CORS). Nó **không** phải một
   bức tường tuyệt đối — một extension có ác ý vẫn bắn được request đi mà không đọc
   phản hồi. Bức tường thật nằm ở lớp 1 và lớp 3.
3. **Manifest V3 cấm tải mã từ xa.** Extension không thể tự cập nhật hành vi sau khi
   bạn cài; mọi thay đổi đều phải qua một bản mới trên Chrome Web Store.

## Nơi Soát tự động im lặng

Soát chủ động **không đọc** những ô nhập liệu sau, kể cả khi bạn gõ vào đó:

- Ô mật khẩu (kể cả ô đánh dấu `autocomplete="current-password"` / `"new-password"`)
- Ô thẻ ngân hàng và mã bảo mật (`autocomplete="cc-number"`, `"cc-csc"`…, hoặc
  có chữ `card`, `cvv`, `cvc`, `iban`, `swift` trong tên ô)
- Ô mã dùng một lần (`one-time-code`, `otp`, `captcha`)
- Ô tìm kiếm (`type="search"`, hoặc có chữ `search`/`tìm kiếm`/`query` trong tên ô)
- Ô email, điện thoại, số, ngày tháng, URL, tải tệp — mọi `input` không phải
  `type="text"` hay `textarea`
- Trình soạn thảo mã nguồn (CodeMirror, Monaco, Ace, ProseMirror dạng code)
- Bất kỳ ô nào nằm trong phần tử có thuộc tính `data-soat-off`

Danh sách đầy đủ nằm trong mã nguồn tại `extension/src/content/targets.js` —
đọc được, kiểm chứng được.

## Vì sao extension cần quyền chạy trên mọi trang

Một công cụ hỗ trợ viết chỉ có ích khi nó có mặt ở nơi bạn viết — mà bạn viết ở
khắp nơi. Vì vậy content script khớp với mọi trang.

Nhưng hãy để ý phần quan trọng: Soát khớp mọi trang để **đọc ô nhập liệu tại
chỗ**, chứ không phải để gọi mạng tới các trang đó — nó không xin
`host_permissions`. Hai điều đó khác hẳn nhau, và sự khác biệt chính là ranh giới
quyền riêng tư của bạn. Phần "Vì sao extension không thể lén gửi dữ liệu đi" ở trên
nói rõ từng lớp một.

## Bên thứ ba

Không có. Soát không nhúng Google Analytics, Firebase, Sentry, hay bất kỳ SDK
theo dõi nào. Không có mã nào tải từ xa — Manifest V3 cấm điều đó, và chúng tôi
không tìm cách lách.

## Trẻ em

Soát không thu thập dữ liệu từ bất kỳ ai, nên cũng không thu thập dữ liệu từ
trẻ em.

## Thay đổi chính sách

Nếu về sau có thay đổi, phiên bản mới sẽ được đăng tại đây kèm ngày cập nhật.
Nếu có bất kỳ dữ liệu nào bắt đầu rời khỏi máy bạn, điều đó sẽ được nói rõ
**trước** khi xảy ra, và sẽ cần bạn đồng ý.

## Liên hệ

Mọi câu hỏi về quyền riêng tư: mở issue tại kho mã nguồn của dự án.
