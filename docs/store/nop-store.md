# Nộp Soát lên Chrome Web Store — từng bước

Làm theo thứ tự. Bước 0 là bước hay bị bỏ nhất và cũng là bước đắt nhất nếu bỏ.

---

## Bước 0 — Thử bản 1.0.0 trên Chrome thật (15 phút)

Bản 1.0.0 vừa đổi `manifest.json` (version, `minimum_chrome_version`,
description). Chưa ai chạy thử bản đã đổi đó trong Chrome. Nộp một gói chưa
chạy thử là cách mất hai tuần chờ duyệt để rồi bị trả về.

```bash
python ml/package_extension.py
```

*(PowerShell 5.1 không hiểu `&&` — chạy từng lệnh một dòng, hoặc nối bằng `;`.
Hai script `ml/*.py` neo đường dẫn theo vị trí file nên đứng ở đâu chạy cũng
được.)*

1. Mở Chrome → gõ `chrome://extensions` vào thanh địa chỉ
2. Bật **Developer mode** (góc trên bên phải)
3. Bấm **Load unpacked** → chọn thư mục `extension/`
   *(chọn thư mục, không phải file zip — zip chỉ dùng để upload lên store)*
4. Kiểm tra ô "Soát" hiện ra, **không có chữ Errors màu đỏ**

Rồi thử thật:

- [ ] Mở một trang bất kỳ có ô nhập liệu (thử `facebook.com`, hoặc mở
      `dev/playground.html`). Gõ: **Mình xin chia sẽ lại một vài kinh nghiệm**
- [ ] Thấy gạch chân đỏ dưới chữ `chia sẽ` → tầng luật chạy
- [ ] Rê chuột vào chữ bị gạch → hiện thẻ gợi ý có nút **Sửa**
- [ ] Bấm **Sửa** → chữ đổi thành `chia sẻ` ngay trong ô
- [ ] Bấm biểu tượng Soát trên thanh công cụ → popup hiện số đếm
- [ ] Vào một trang có ô mật khẩu, gõ vào đó → **không được** gạch chân gì
- [ ] Mở DevTools (F12) tab Console → không có lỗi đỏ từ Soát

**Kiểm tra tầng model có chạy không** (quan trọng — nó hỏng im lặng):

- [ ] Mở DevTools **của chính trang web đang gõ** (F12 → Console). Tầng model
      chạy trong content script nên log của nó ra console của TRANG, không phải
      console của service worker.
- [ ] Nếu thấy `[soát] không nạp được model, chỉ dùng tầng luật` thì model
      KHÔNG chạy — kiểm tra `extension/models/soat.int8.onnx` và
      `extension/vendor/` có đủ file không
- [ ] **Tải lại trang và đợi khoảng 5 giây** trước khi gõ. Model nặng 78 MB
      cộng 14 MB wasm nên mất vài giây mới sẵn sàng; gõ ngay lúc trang vừa mở
      thì tầng model chưa kịp sống.
- [ ] Gõ câu này — đã kiểm chứng là **tầng luật bỏ qua hoàn toàn**:

      > Hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển.

      Nếu `cứ` bị gạch chân và gợi ý `cư` thì model đang chạy. Không thấy gì
      thì chỉ có tầng luật sống, và extension đang thiếu mất tầng đắt nhất.

      *(Đừng dùng `trãi nghiệm` hay `chia sẽ` để thử — tầng luật bắt sẵn hai
      cụm đó, nên thấy gạch chân không chứng minh được model có chạy hay không.
      Tôi đã viết nhầm đúng chỗ này một lần.)*

Chỉ khi mọi ô trên đều tick mới sang bước 1.

---

## Bước 1 — Tạo tài khoản nhà phát triển (5 USD, một lần)

1. Vào https://chrome.google.com/webstore/devconsole
2. Đăng nhập bằng tài khoản Google bạn muốn **gắn vĩnh viễn** với extension.
   Cân nhắc dùng một tài khoản riêng cho việc này — tên hiển thị của tài khoản
   sẽ xuất hiện công khai ở mục "Nhà phát triển" trên trang extension.
3. Chấp nhận điều khoản, trả **phí đăng ký 5 USD** (một lần, không hoàn lại,
   dùng được cho tối đa 20 extension)
4. Vào **Account** → điền **địa chỉ email liên hệ** và **xác minh email đó**.
   Google bắt buộc bước này trước khi cho đăng bất cứ thứ gì.

---

## Bước 2 — Đăng chính sách riêng tư lên một URL công khai

Chrome Web Store đòi một URL mà **người duyệt mở được mà không cần đăng nhập**.

Cách rẻ và chắc nhất — GitHub:

1. Đẩy dự án lên một kho GitHub **công khai**
2. Dùng link thẳng tới file:
   `https://github.com/<tên-bạn>/<tên-kho>/blob/main/docs/store/privacy-policy.md`

Cách gọn hơn nếu muốn có trang đẹp — GitHub Pages:

1. Trong kho, vào **Settings → Pages**
2. Source: `Deploy from a branch`, branch `main`, thư mục `/docs`
3. Đợi vài phút, trang sẽ ở
   `https://<tên-bạn>.github.io/<tên-kho>/store/landing.html`
4. URL chính sách là trang đó kèm `#rieng-tu`

> **Đừng dùng link artifact của trang giới thiệu làm URL chính sách.** Nó riêng
> tư mặc định; người duyệt của Google mở sẽ không thấy gì và hồ sơ bị trả về.
> Artifact dùng để khoe và gửi cho người quen, không dùng cho khâu duyệt.

---

## Bước 3 — Tải gói lên

1. Trong devconsole bấm **Items** → **Add new item**
2. Kéo thả `dist/soat-1.0.0.zip` vào
3. Đợi xử lý. Nếu báo lỗi manifest thì sửa rồi chạy lại
   `python ml/package_extension.py` và tải lại

Sau khi tải lên, extension có một **ID cố định không đổi được nữa**. Đổi ID
nghĩa là mất hết lượt cài và đánh giá, nên đừng xoá item rồi tạo lại.

---

## Bước 4 — Tab "Store listing"

Mở [listing.md](listing.md) và chép từng ô. Đối chiếu nhanh:

| Ô trong devconsole | Lấy ở đâu |
|---|---|
| **Title** | `Soát — kiểm tra chính tả tiếng Việt` |
| **Summary** | dòng Tóm tắt trong `listing.md` (109 ký tự, giới hạn 132) |
| **Description** | cả khối trong ``` ``` ở mục "Mô tả chi tiết" |
| **Category** | `Productivity` |
| **Language** | `Vietnamese` |
| **Store icon** | `extension/icons/128.png` |
| **Screenshots** | cả 3 file trong `dist/store/` |

Ảnh đầu tiên là ảnh người ta thấy trước nhất — để `01-gach-chan.png` lên đầu.

Ô **Small promo tile** (440×280) và **Marquee** (1400×560) không bắt buộc. Bỏ
trống cũng đăng được; điền thì được xét vào mục giới thiệu của store.

---

## Bước 5 — Tab "Privacy practices" (tab dễ hỏng nhất)

Đây là tab quyết định hồ sơ trôi hay bị trả về. Đừng điền vội.

**Single purpose** — dán:

```
Kiểm tra và gợi ý sửa lỗi chính tả tiếng Việt trong các ô nhập liệu trên
trang web, xử lý hoàn toàn cục bộ trên máy người dùng.
```

**Permission justification** — devconsole liệt kê từng quyền, mỗi quyền một ô.
Chép từ mục "Giải trình quyền" trong [listing.md](listing.md):

- `storage` → đoạn thứ nhất
- `activeTab` → đoạn thứ hai
- `offscreen` → đoạn thứ ba. Nói đúng lý do đã đo: model nạp riêng từng tab tốn
  ~280 MB mỗi tab và giữ luồng chính của trang ~160 ms; một trang ẩn dùng chung
  cho cả trình duyệt đưa con số đó về dưới 2 MB (quyết định 37 và 38).
- **Host permission / match patterns** → đoạn thứ tư.
  *Lưu ý:* manifest **không** có khoá `host_permissions`, nhưng devconsole vẫn
  hỏi vì content script khớp `<all_urls>`. Chính chỗ này phải nói rõ khác biệt
  giữa "khớp mọi trang để đọc ô nhập liệu tại chỗ" và "có quyền gọi mạng tới
  mọi trang" — Soát chỉ có cái thứ nhất.

**Are you using remote code?** → chọn **No, I am not using remote code**

> Model ONNX 78 MB là **dữ liệu**, không phải mã. Nó nằm sẵn trong gói cài,
> không tải từ đâu về. Nếu chọn nhầm "Yes" thì hồ sơ bị xét ở mức khắt khe hơn
> hẳn mà chẳng vì lý do gì.

**Data usage** — tick **không** cho toàn bộ 9 mục (danh sách đầy đủ trong
`listing.md`), rồi tick **cả ba** lời chứng thực ở cuối.

Nếu người duyệt hỏi vặn về mục *Website content*: extension có **đọc** văn bản
trong ô nhập liệu để kiểm tra, nhưng không **thu thập** — Chrome định nghĩa
"collect" là truyền ra khỏi máy người dùng. Xử lý tại chỗ rồi bỏ thì không phải
thu thập. Bằng chứng: trong mã không có lệnh gọi mạng nào, không xin
`host_permissions`, và Manifest V3 cấm tải mã từ xa.

**Privacy policy URL** → dán URL từ bước 2.

---

## Bước 6 — Tab "Distribution"

- **Visibility**: `Public` — ai cũng tìm và cài được
  *(chọn `Unlisted` nếu muốn thử với vài người quen trước; chỉ ai có link mới
  cài được, và đổi sang Public lúc nào cũng được)*
- **Distribution countries**: chọn tất cả, hoặc ít nhất Việt Nam
- **Pricing**: Free

---

## Bước 7 — Bấm Submit for review

Bấm **Submit for review** ở góc trên bên phải.

Chuyện xảy ra tiếp:

- Trạng thái chuyển sang **Pending review**
- Extension thường **không được** duyệt trong vài giờ. Loại xin `<all_urls>`
  hay bị xét kỹ hơn — tính bằng vài ngày tới vài tuần
- Nếu bị từ chối, Google gửi email nêu mã vi phạm. Sửa rồi nộp lại được, không
  giới hạn số lần
- Khi được duyệt, extension lên store và bắt đầu có lượt cài

---

## Hay bị từ chối vì gì

| Lý do | Cách né |
|---|---|
| Quyền xin rộng hơn mức cần | Đã né sẵn: không xin `host_permissions`, chỉ `storage` + `activeTab` |
| Khai báo dữ liệu không khớp hành vi thật | Tick đúng như bước 5. Khai "không thu thập" mà code có gửi đi là bị gỡ vĩnh viễn |
| Mô tả nhồi từ khoá | Mô tả trong `listing.md` viết bằng câu thường, không nhồi |
| Ảnh chụp không phản ánh sản phẩm thật | Đã né: ảnh chụp từ engine thật, không phải mockup |
| Thiếu chính sách riêng tư hoặc URL chết | Bước 2. Mở lại URL ở chế độ ẩn danh để chắc chắn xem được khi chưa đăng nhập |
| Single purpose mơ hồ | Dùng đúng câu ở bước 5 |

---

## Sau khi lên store

Con số đáng theo dõi nhất **không** phải lượt cài, mà là **tỷ lệ chấp nhận gợi
ý** — popup đã đếm sẵn `shown` và `accepted`. Tỷ lệ đó chính là precision ngoài
đời thật của sản phẩm, thứ mà mọi phép đo offline trong dự án này chỉ đang ước
lượng.

Nó nằm trong máy người dùng nên bạn không tự lấy được. Cách lấy: nhờ vài người
dùng thật mở popup rồi chụp màn hình gửi lại. Mươi người là đã đủ biết con số
thật lệch bao nhiêu so với 0,9556 đo trên VSEC.

Hai thứ cần xem tiếp, theo thứ tự:

1. **Tỷ lệ gỡ cài trong 7 ngày đầu.** Cao bất thường thì nghi báo động giả
   trước, đừng nghi dung lượng — đọc lại quyết định 23.
2. **Dung lượng.** Gói nén 49,8 MB. Nếu số liệu store cho thấy nhiều người bỏ
   dở lúc cài thì quay lại hai hướng đã đo trong HANDOFF: cắt vocab hoặc tải
   model lúc chạy.
