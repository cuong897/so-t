# Chính sách quyền riêng tư — Soát

**Cập nhật lần cuối: 12/09/2026**

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

Model nhận diện lỗi (75 MB) được **đóng gói sẵn trong extension** và chạy bằng
WebAssembly ngay trên máy bạn. Không có lệnh gọi mạng nào để tải model, để chấm
câu, hay để làm bất cứ việc gì khác.

Extension **không xin quyền `host_permissions`**, nghĩa là về mặt kỹ thuật nó
**không thể** gửi dữ liệu tới bất kỳ máy chủ nào — kể cả nếu chúng tôi muốn.
Đây là ràng buộc do chính Chrome thi hành, không phải lời hứa suông.

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
chỗ**, và **không xin `host_permissions`** nên không thể gọi mạng tới bất kỳ
trang nào. Hai điều đó khác hẳn nhau, và sự khác biệt chính là ranh giới quyền
riêng tư của bạn.

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
