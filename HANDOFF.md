# Bàn giao — dự án Soát

Đọc file này trước, rồi `README.md` (tổng quan) và `docs/decisions.md` (38 quyết
định, kèm lý do và mọi lỗi đã mắc). Phiên mới bắt đầu từ **việc số 1: thử bản
offscreen trên Facebook thật**, rồi nộp store.

---

## Sản phẩm là gì

Extension Chrome sửa lỗi **dấu tiếng Việt** ngay trong ô nhập liệu, chạy **hoàn
toàn trên máy người dùng**. Không server, không API, không một ký tự nào rời
khỏi trình duyệt.

Bốn tầng: ① tra từ điển → ② sinh tập ứng viên → ③ model ONNX chấm theo ngữ cảnh
→ ④ ngưỡng và lọc.

Người dùng mục tiêu: người làm content và admin fanpage, sau đó là sinh viên
viết khoá luận.

---

## Trạng thái: MODEL ĐÃ RA KHỎI TRANG — offscreen document, đo xong, CHẠY THẬT trên Facebook

- cây git sạch (số commit: `git rev-list --count HEAD` — ghi con số vào đây thì nó lỗi thời ngay commit sau)
- 63 test JS + 2 bộ kiểm tra Python, tất cả pass (`npm run test:all`)
- **Tầng luật** — xác nhận từ trước: gõ *"chia sẽ một vãi trãi nghiệm"* trên
  Facebook, gạch đúng `chia sẽ→chia sẻ` và `trãi→trải`.
- **Tầng model — xác nhận lần đầu (17–18/09/2026)**, chủ repo dán đoạn thử 494 ký
  tự (việc số 1) vào ô "Tạo bài viết":
  * **có dấu câu** → gạch đúng một chỗ, `cứ→cư` ở câu cuối — sau chỗ bản cắt cụt cũ
    dừng, nên đây là đường **chấm theo câu**. Sáu câu đầu không bị gạch oan.
  * **không dấu câu, viết thường** → gạch `cứ→cư` qua đường lui **F2**.
  * **dán vào là có gạch**, không phải gõ thêm — sau khi sửa lỗi dán (quyết định 36).
- **Quyết định 38 (18/09/2026): tầng model chuyển sang offscreen document** — một bản
  model cho cả trình duyệt, chạy trong Worker, content script chỉ còn tầng luật. Qua
  **tám / tám** điều kiện ghi trước, đo bằng `dev/measure-chrome.mjs --plan 38` trong
  Chrome thật (headless): bộ nhớ mỗi tab **279 MB → 1,8 MB**, 8 tab **2,2 GB → 320 MB**,
  long task trên trang **150 ms → 0**, dán ấm chậm hơn 4–10 ms.
- **Facebook thật, chủ repo xác nhận (18/09/2026):** dán là có gạch đúng `cứ`; nhiều tab
  cùng gõ vẫn đúng; để yên một lúc rồi gõ lại vẫn đúng. **Chưa kiểm:** Shift+Esc để nhìn
  tận mắt một dòng ~300 MB, và bộ gõ tiếng Việt.
- Gói nộp store `dist/soat-1.0.0.zip` đã đóng lại với code hiện tại (58,6 MB nén),
  **chưa nộp**. Trước khi nộp phải **gỡ chế độ đo** (xem việc số 2).

**Hai điều người sau hay vấp khi thử trên Chrome thật:**

1. **Reload extension thôi là chưa đủ — phải F5 cả tab.** Chrome giữ content script
   cũ trong tab đang mở. Một lần thử của phiên này "không có gạch" chỉ vì thế.
2. **Vệt gạch đỏ lượn sóng của Chrome spellcheck trông giống hệt vệt của Soát.** Rê
   chuột lên từ đó: Soát hiện tooltip kèm đề xuất, Chrome thì không.

---

## Phiên vừa rồi làm gì (15–18/09/2026)

Các commit `c57d0ff..HEAD` (`git log --oneline c57d0ff~1..HEAD`). Bắt đầu từ "xem xét kỹ việc sửa
model cắt cụt văn bản"; phần cuối (37, 38) là đo trong Chrome thật rồi đưa model ra khỏi trang.

| quyết định | chuyện gì | kết quả |
|---|---|---|
| 32 | `session.run` **giữ luồng chính** — tài liệu khai "chạy trong Web Worker", không có Worker nào. Và **mọi con số chất lượng là số của câu đứng một mình**, trong khi sản phẩm nhét cả ô nhập liệu vào một cửa sổ | recall 0,7426 khi câu đứng một mình, **0,6202** khi câu nằm cuối cửa sổ — thủ phạm là vị trí |
| 33 | **Chấm theo câu** thay cho cắt cụt, ngưỡng ghi trước | ship cho văn bản có dấu câu: phủ 100%, P 0,9669 · R 0,7457 (trùng `evaluate.py`) |
| 34 | **Đường lui F2** cho văn bản không dấu câu — đợt đo riêng, có **đối chứng A/A** vì ngưỡng đứng hình của 33 đặt sai | ship: R 0,1553 → 0,7202, P 0,9419 → 0,9671 |
| 35 | **Cache theo cửa sổ** khi sửa bài dài | **trượt** ở kiểu sửa *xoá từ* — code nằm sẵn, **tắt** |
| 36 | "Model chậm" hoá ra là **dán vào không soát** — Lexical không bắn sự kiện `input` | sửa bằng `MutationObserver`; xác nhận trên Facebook |
| 37 | Mỗi trang tự nạp model — **đo trong Chrome thật** (`dev/measure-chrome.mjs`), luật ghi trước | **279 MB mỗi tab**, nạp 408 ms, long task 160 ms → luật chọn **offscreen** (18/09) |
| 38 | **Offscreen document**: một bản model cho cả trình duyệt, chạy trong Worker; điều kiện ghi trước | qua **8/8**: mỗi tab 1,8 MB, một lần 305 MB, long task trên trang **0**, dán ấm +4…+10 ms (18/09) |

Kèm theo: `bpe.js`/`encoding.py` không còn chấm một từ bị cắt dở ở mép cửa sổ; byte
NUL thật trong mã nguồn (có từ commit đầu tiên, làm `grep` coi `bpe.js` là file nhị
phân) đã gỡ.

---

## Số liệu chốt

Model đang ship: `student768_v4`, INT8 per-channel, biên 0,25, ngưỡng **theo lớp
nhãn**: thanh điệu **0,95**, phụ âm **0,90** (quyết định 29). Chấm theo câu, đường
lui F2 cho câu dài quá cửa sổ.

| Thước đo | Số | Đo bằng |
|---|---|---|
| **Bài đăng có dấu câu**, qua `check()` | P **0,9669** · R **0,7457** · câu sạch bị gạch 0,98% | `dev/bench-accept.html` |
| **Bài đăng không dấu câu** (F2) | P **0,9671** · R **0,7202** · câu sạch bị gạch 0,87% | `dev/bench-fallback.html` |
| Phạm vi phủ | **100%** mọi cỡ, có hay không dấu câu | nt |
| VSEC giữ kín, câu đứng một mình | P 0,9709 · R 0,7457 · F1 0,8436 | `evaluate.py --held-out --threshold 0.95 --margin 0.25` |
| Lỗi phụ âm (1.796 ca) / riêng `d/gi/r` (596 ca) | recall **48,2%** / **33,9%** | `consonant_eval.py` |
| Báo động giả trên văn bản đúng | 1,35% / 1,05% số câu | `false_alarm.py` |
| Theo CÂU: câu sạch hẳn / sản phẩm KHÔNG ĐỤNG | 39,2% / **49,0%** | `sentence_eval.py` + `dev/sentence-eval.html` |
| Dán → gạch chân, localhost, bài 486 ký tự | **607ms** = 405 debounce + 2 luật + 200 model (3 lượt) | `dev/harness-content.html` |
| Đứng hình, bài 2.000 ký tự có dấu câu | ≤ 82ms (tổng CPU 525–600ms, nhả luồng giữa các câu) | `dev/bench-accept.html` |
| Gói cài | 63,1 MB thô → **40,0 MB nén** | `package_extension.py` |

**Chrome thật, extension thật** (`dev/measure-chrome.mjs`, headless; A = bản trước
offscreen, quyết định 37; O = bản đang ship, quyết định 38):

| Thước đo | A | **O (đang ship)** |
|---|---|---|
| Bộ nhớ thêm **mỗi tab** — kể cả tab không gõ gì | 279 MB | **1,8 MB** |
| Bộ nhớ với 8 tab | +2,2 GB | **+320 MB** |
| Bộ nhớ một lần cho cả trình duyệt | — | **209 MB** sau khi cắt vocab (trước đó 305 MB; JS heap 8 MB, phần còn lại là bộ nhớ wasm của onnxruntime, không co lại) |
| Nạp model | 408 ms **mỗi tab** | **336–354 ms một lần** (trước khi cắt vocab: 424–478 ms) |
| Long task trên trang lúc mở | 150 ms | **0** |
| Long task trên trang lúc chấm | 53–135 ms | **0** |
| Dán 494 ký tự → gạch chân | 616 ms lạnh · 422 ms cache ấm | 642 ms lạnh (gồm dựng offscreen + nạp model) · 426 ms cache ấm |

**Bốn lưu ý khi đọc bảng:**

1. **`R 0,7457` là recall trên phần lỗi biểu diễn được** (54,5% lỗi VSEC). Tỷ lệ lỗi
   thật sự được sửa là **40,8%**. Người đọc CV sẽ hiểu 0,7457 là "sửa 74,6% lỗi".
2. **`evaluate.py` mặc định chấm argmax không ngưỡng** — năng lực thô, không phải thứ
   người dùng thấy. Phải truyền `--threshold 0.95 --margin 0.25`.
3. **Báo oan máy đếm là chặn trên.** Đọc tay 54 ca của bản cũ thì 26% hoá ra là lỗi
   thật trong văn bản "sạch"; phần đọc tay chưa làm lại cho v4.
4. **Một lượt `session.run` dao động gấp đôi trên cùng một văn bản** (48–94ms). So hai
   cấu hình thì so p50/p90 **đo cùng lượt**, có đối chứng A/A; chênh dưới ~25% ở p50
   là không phân biệt được (quyết định 34).

---

## VIỆC TIẾP THEO — theo thứ tự ưu tiên

### 1. Hai chỗ trên Facebook CHƯA ai nhìn tận mắt

Bản offscreen **đã chạy thật trên Facebook** (18/09): dán là có gạch đúng `cứ`, nhiều tab
cùng gõ vẫn đúng, để yên một lúc rồi gõ lại vẫn đúng. Còn hai chỗ chưa kiểm, và cả hai đều
chỉ tốn vài phút:

| còn thiếu | vì sao đáng làm |
|---|---|
| **Shift+Esc** — Task Manager của Chrome | Nhìn tận mắt: **hai** dòng của Soát (service worker ~20 MB, trang offscreen ~310 MB), không phải mỗi tab một dòng ~300 MB. Đợi một phút sau khi gõ rồi hãy đọc — phút đầu nó hiện ~390 MB, vì bộ đệm 78 MB tải model chưa được thu hồi (quyết định 38). Ảnh chụp đáng đưa vào blog/CV. |
| **Bộ gõ tiếng Việt** (Unikey/EVKey) | Chưa thử lần nào, ở bất kỳ bản nào. Bộ gõ sửa chữ ngay trong lúc gõ; nó và `MutationObserver` có thể đá nhau. Người dùng mục tiêu ai cũng dùng bộ gõ. |

Cách kiểm còn lại (dán, nhiều tab, để yên lâu) giữ ở đây cho lần sửa tầng model sau:

| kiểm gì | vì sao |
|---|---|
| **dán** rồi gõ thêm, sửa, xoá | đường người dùng thật đi; Lexical không bắn `input` (quyết định 36) |
| mở 3–4 tab Facebook/Gmail cùng lúc, gõ ở nhiều tab | một phiên onnxruntime dùng chung, có hàng đợi — đã đo trên trang thử, chưa đo ở trang thật |
| để yên 5 phút rồi gõ lại | service worker bị tắt sau 30 giây rảnh; offscreen phải còn sống. Đã đo 45 giây (quyết định 38) và **5 phút** trên Lexical thật — đều còn sống, cache còn ấm. Trên Facebook thì chưa |
| Shift+Esc (Task Manager của Chrome) | phải thấy **một** dòng của Soát giữ ~300 MB, không phải mỗi tab một dòng |
| gõ tiếng Việt bằng bộ gõ (Unikey/EVKey) | chưa bao giờ kiểm; bộ gõ và `MutationObserver` có thể đá nhau |

Chế độ đo vẫn tắt mặc định — bật như hướng dẫn ở việc số 2 nếu cần số.

Đã thử được tới đâu mà không cần tài khoản: `node dev/lexical-check.mjs` chạy gói store
thật trên `playground.lexical.dev` (cùng Lexical Facebook dùng) — dán 494 ký tự, 0 sự kiện
`input`, gạch đúng `cứ` sau 579 ms và vệt gạch sống qua lần Lexical dựng lại DOM. Còn thiếu
đúng những thứ chỉ Facebook mới có: trang nặng, React của họ, bộ gõ tiếng Việt, và extension
cài như người dùng chứ không nạp qua CDP.

Nếu hỏng thì triệu chứng gần như chắc chắn là **im lặng** (tầng luật vẫn gạch, tầng model
biến mất). Chỗ đọc đầu tiên: `chrome://extensions` → Soát → "service worker" → Console, và
`soatLog` trên trang.

#### Đoạn thử — dùng lại sau mỗi thay đổi tầng model

Tầng luật **cố ý** không bắt `cứ trú`; model bắt `cứ→cư` ở 99,9%. Lỗi nằm ở câu cuối,
sau chỗ bản cắt cụt cũ dừng (494 ký tự, 114 subword):

> Tuần trước nhóm mình đã tổ chức một buổi gặp mặt nhỏ ở quán cà phê gần trường. Mọi người đến khá đông và ai cũng mang theo một món quà nhỏ để trao đổi với nhau. Sau đó cả nhóm cùng nhau đi dạo quanh hồ và chụp rất nhiều ảnh kỷ niệm. Buổi tối chúng mình ăn lẩu và nói chuyện về những dự định trong năm tới. Có bạn muốn học thêm tiếng Anh, có bạn định xin việc ở một công ty lớn. Mình thì vẫn đang phân vân giữa việc học tiếp và đi làm ngay. Hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển.

Bản không dấu câu (đường lui F2):

> tuần trước nhóm mình đã tổ chức một buổi gặp mặt nhỏ ở quán cà phê gần trường mọi người đến khá đông và ai cũng mang theo một món quà nhỏ để trao đổi với nhau sau đó cả nhóm cùng nhau đi dạo quanh hồ và chụp rất nhiều ảnh kỷ niệm buổi tối chúng mình ăn lẩu và nói chuyện về những dự định trong năm tới có bạn muốn học thêm tiếng anh có bạn định xin việc ở một công ty lớn mình thì vẫn đang phân vân giữa việc học tiếp và đi làm ngay hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển

**Dán**, đừng gõ: dán là đường người dùng thật đi, và là đường từng hỏng (quyết định 36).
Cả hai đoạn đều phải có đúng một gạch, dưới `cứ`.

**Đừng dùng `dành được phần quà` để kiểm** — model xếp nó ở p = 0,835, dưới ngưỡng phụ
âm 0,90, nên im lặng *đúng thiết kế*.

### 2. ~~Xoá blob 311MB khỏi lịch sử git~~ — XONG (quyết định 40)

`.git` **627 MB → 2,6 MB**, cây HEAD giống hệt, vẫn 88 commit, test xanh. Việc nộp store
không còn bị chặn bởi giới hạn 100 MB của GitHub.

Ba thứ cần biết nếu phải làm lại chuyện tương tự:

* **Tag không phải backup** — `-- --all` viết lại cả tag. Lưới an toàn là bản chép nguyên
  thư mục `.git` (`D:/soat-git-backup-2026-09-18`, còn nguyên; xoá khi đã yên tâm, cùng
  `D:/soat-thu-loc` và `D:/soat-thu-loc2` — tổng ~637 MB).
* **Mọi hash commit đã đổi.** Tài liệu ở đây trích hash làm bằng chứng ("ngưỡng ghi ở
  commit X trước khi viết code"), nên đã dựng lại ánh xạ cũ→mới từ bản backup (88/88 khớp)
  và sửa 28 chỗ trong 7 file. Hash trong các phiên chat cũ thì không còn tra được.
* Thao tác đóng sẵn ở **`dev/xoa-blob.sh`**, có kiểm chứng trước và sau.

### 3. Nộp Chrome Web Store

Làm theo **[docs/store/nop-store.md](docs/store/nop-store.md)** — 8 bước, cần tài
khoản của chủ repo. **Trước bước 1: gỡ chế độ đo khỏi `content/index.js`**, chạy lại
`python ml/package_extension.py`, rồi thử lại đoạn thử ở việc số 1.

| Thứ | Ở đâu |
|---|---|
| Gói cài | `dist/soat-1.0.0.zip` (58,6 MB) |
| 3 ảnh 1280×800 | `dist/store/*.png` |
| Nội dung từng ô devconsole | `docs/store/listing.md` (đã có ô `offscreen`) |
| Chính sách riêng tư | `docs/store/privacy-policy.md` |

Hồ sơ store **đã cập nhật** cho quyền `offscreen` (ô giải trình quyền trong
`listing.md`, mục "Model chạy ở đâu" trong `privacy-policy.md`, thứ tự các ô trong
`nop-store.md`).

Cùng lúc đã sửa một câu **sai kỹ thuật** nằm ở cả ba file: *"không xin `host_permissions`
nghĩa là về mặt kỹ thuật không thể gửi dữ liệu đi đâu"*. Không đúng — thiếu
`host_permissions` chỉ chặn **đọc** phản hồi cross-origin thiếu CORS; request vẫn gửi
được. Lời hứa đúng, và vẫn đủ mạnh: trong mã không có lệnh gọi mạng nào, MV3 cấm tải mã
từ xa, mã nguồn mở nên kiểm được.

### 4. Sửa bài dài không dấu câu — một lỗi bộ nhớ và một hướng tối ưu

1. ~~Lỗi bộ nhớ cache theo câu~~ — **XONG** (quyết định 39): trần theo **số dòng logit**,
   16.384 dòng ≈ 4,1 MB, thay cho trần 400 mục ≈ 135 MB ở ca xấu nhất. Qua cả ba điều kiện
   ghi trước, 240/240 phiên bản giống hệt, và **không tốn thêm một lượt model nào** (x1,000)
   — vì ở bài dài không dấu câu, cache theo câu vốn đã gần như không bao giờ trúng.
2. **Ứng viên `F2c`: cửa sổ cắt theo nội dung + cache cửa sổ.** Cache cửa sổ với F2
   trượt vì F2 chỉ tự khớp lại khi **số từ** không đổi — xoá một từ giữa bài 6.000 ký tự
   phải chạy lại 17,2/42,8 cửa sổ; cắt theo nội dung chỉ 2,5/58,4 (quyết định 35). Code
   cache nằm sẵn, tắt. Cửa sổ khác F2 nên issue khác F2: đo lại **cả chất lượng**, và chi
   phí sửa cho **đủ năm kiểu**: thêm cuối, thay, đổi dấu, xoá, chèn.
3. ~~`ort.env.wasm.proxy = true`~~ — không cần: việc số 1 chọn offscreen, suy luận ra
   khỏi luồng của trang.

Chỉ đáng làm nếu sửa giữa bài dài viết liền là ca người dùng thật gặp. Đọc việc số 1
trước.

### 5. Lớp d/gi/r vẫn còn hai phần ba ca bị bỏ sót

33,9% (v4, ngưỡng phụ âm 0,90). Khoảng 212 ca có nhãn đúng dẫn đầu nhưng dưới p = 0,90
— **phải học**, hạ ngưỡng thêm thì trượt luật chọn (quyết định 29: 0,80 cho F1 cao hơn
nhưng luật ghi trước ưu tiên precision). Sửa bằng cue đã bác: thêm `phần`+`quà` cho
`giành` thì gạch oan `chị dành phần quà cho em` (quyết định 26). Train thêm thì nhớ v4
đã lấy 30 ca của các nhóm phụ âm khác (`l/n` 45,4% → 39,6%) để được 64 ca cho d/gi/r.

### 6. ~~Giảm dung lượng~~ — XONG phần vocab (quyết định 41)

Cắt vocab **không cần train lại**: vocab chỉ vào model qua một phép `Gather`, nên bỏ 40.867
token chưa bao giờ xuất hiện trong tập train là cắt dòng embedding + đánh số lại id.

| | trước | sau |
|---|---|---|
| model int8 | 78,5 MB | **47,2 MB** |
| gói nén | 58,6 MB | **40,0 MB** |
| bộ nhớ một lần trong Chrome | 305 MB | **209 MB** |
| nạp model | 424–478 ms | **336–354 ms** |
| precision / recall VSEC | 0,9709 / 0,7457 | **0,9709 / 0,7447** |

Qua bảy điều kiện ghi trước. Cái giá thật: **một** lỗi bị bỏ sót thêm và **một** câu đúng bị
gạch oan thêm, trên 2.000 câu.

**Còn lại của việc số 6, nếu muốn đi tiếp:**

* **Cắt sâu hơn thì đắt nhanh.** Đo trước: ngưỡng ≥20 lần chỉ tiết kiệm thêm 7,7 MB nhưng
  đẩy số câu dính `<unk>` trên văn bản chưa thấy từ 0,43% lên **12,78%**. Đừng đi đường đó
  nếu không đo lại đủ bốn phép đo chất lượng.
* **Phần còn lại không phải vocab:** 47,2 MB model giờ gần như toàn bộ là 12 lớp encoder.
  Muốn nhỏ nữa thì phải cắt lớp hoặc hạ chiều — tức train lại thật, và phải đo lại từ đầu.
* **14 MB wasm của onnxruntime** giờ chiếm 35% gói cài. Bản `ort.wasm.bundle.min.mjs` đã là
  bản nhẹ nhất có sẵn; muốn nhỏ hơn phải tự build onnxruntime với ít toán tử hơn.

---

## Bố cục

```
extension/          MV3, không cần build
  src/engine/       vi.js (âm tiết + 23 nhãn), rules.js, ruleEngine.js,
                    bpe.js (BPE tự viết), onnxEngine.js (tầng 3: chấm theo câu,
                    đường lui F2, cache cửa sổ có sẵn nhưng TẮT)
  src/content/      index.js (điểm vào; CHỈ tầng luật + gửi văn bản sang offscreen;
                    MutationObserver cho ô contenteditable; CHẾ ĐỘ ĐO tắt mặc định —
                    gỡ trước khi nộp store),
                    targets.js (lọc ô), highlighter.js, replace.js, tooltip.js
  src/offscreen/    offscreen.html + offscreen.js (trang ẩn, cầu nối message),
                    worker.js (OnnxEngine — MỘT bản cho cả trình duyệt),
                    checkService.js (hàng đợi một phiên, huỷ lượt cũ theo ô)
  src/background.js service worker: đếm thống kê + dựng offscreen và chuyển tiếp
                    lượt chấm (content script KHÔNG nói thẳng với offscreen)
  models/           artifact sinh ra, KHÔNG commit
  vendor/           onnxruntime-web 14MB, tải bằng ml/fetch_vendor.sh
ml/                 vi.py, noise.py, mine_errors.py, build_corpus.py, dataset.py,
                    train.py, export_onnx.py, export_tokenizer.py, encoding.py
  evaluate.py, false_alarm.py, consonant_eval.py, consonant_diagnose.py,
  diagnose.py, sentence_eval.py   — mọi script CHẤM CÂU ĐỨNG MỘT MÌNH
  gate.py           PHÉP QUYẾT ĐỊNH phía Python — đổi ngưỡng thì sửa ở đây và ở
                    onnxEngine.js, không chỗ nào khác
  trim_vocab.py     cắt vocab (quyết định 41) — CHÉP CẢ train_meta.json, thiếu nó
                    thì export_onnx.py đoán max_len sai và sản phẩm mất gạch im lặng
  threshold_report.py, mix_datasets.py, package_extension.py, make_screenshots.py
  test_evaluate.py, test_encoding.py
dev/                playground.html, onnx-test.html, shots.html (ảnh store)
  measure-chrome.mjs    quyết định 37 — lái chrome.exe thật (headless) qua CDP pipe,
                    nạp gói store, đo nạp/đứng hình/RAM mỗi tab/dán, tự chấm
  lexical-check.mjs     quyết định 38 — gói store thật trên playground.lexical.dev:
                    dán kiểu Lexical, kiểm gạch `cứ` sống qua lần dựng lại DOM
  bench-cachecap.mjs    quyết định 39 — trần cache theo số dòng, session giả, chạy
                    bằng node, không cần model
  harness-content.html  nạp NGUYÊN content/index.js với chrome.* giả lập — kiểm
                    đường dán; tab ẩn thì phải bắn focusin bằng tay
  bench-accept.html     quyết định 33 — chất lượng qua check(), phủ, đứng hình
  bench-fallback.html   quyết định 34 — đường lui, đối chứng A/A
  bench-editcache.html  quyết định 35 — cache cửa sổ
  bench-context.html    cùng câu, đứng một mình và nằm trong cửa sổ
  bench-blocking.html   model có giữ luồng chính không — MessageChannel, không rAF
  bench-model.html, bench-chunking.html, bench-batch.html, bench-rules.html,
  sentence-eval.html
  baseline/         onnxEngine cắt cụt cũ, để đo so cùng lượt
test/               bpe, vi, gate (parity với Python), manifest, ruleEngine,
                    chunking, windowcache (session giả nhạy ngữ cảnh)
docs/decisions.md   37 quyết định
docs/blog.html      bài viết về quá trình và các lần sai
docs/store/         hồ sơ nộp Chrome Web Store
```

### Checkpoint trong `ml/out/`

| Thư mục | Là gì |
|---|---|
| `teacher` | PhoBERT 134M, F1 0,8924 |
| `student768` | bản 768 gốc (v1) |
| **`student768_v4/best`** | **đang ship** — fine-tune nhắm riêng d/gi/r |
| `student768_v3/best`, `student768_v2/best` | giữ để đối chiếu |

`extension/models/soat.int8.onnx` là **copy nguyên** `out/v4_onnx/v4.int8.onnx`.

---

## Lệnh hay dùng

```bash
npm run test:all
npm run dev                              # http://localhost:8777 cho các trang dev/
python ml/package_extension.py

cd ml
python evaluate.py --onnx ../extension/models/soat.int8.onnx \
  --tokenizer out/student768_v4/best --held-out --limit 1500 \
  --threshold 0.95 --margin 0.25 --result out/eval_v4.json
python false_alarm.py --onnx ../extension/models/soat.int8.onnx \
  --tokenizer out/student768_v4/best --limit 2000
python consonant_eval.py --onnx ../extension/models/soat.int8.onnx \
  --tokenizer out/student768_v4/best
```

Dựng lại tập train của v4: xem quyết định 27. `--seed 13` là **bắt buộc** — `dataset.py`
dùng nó để chia train/dev/test; đổi seed là câu test có thể lọt sang train.

**PowerShell 5.1 không có `&&`** — chạy từng lệnh một dòng.

---

## Mười lăm điều dễ vấp — đều đã mắc ít nhất một lần

1. **Luôn dùng `--held-out` khi chấm.** Chấm trên cả VSEC là tự lừa mình.
2. **Benchmark tự sinh nói dối, và nói dối nhiều hơn cho model tệ hơn.** Chỉ tin VSEC
   giữ kín.
3. **`vi.js` và `vi.py` phải cho kết quả giống hệt.** Có test parity.
4. **Cache trình duyệt phục vụ lại cả file `.onnx`**, và **tab đang mở giữ content
   script cũ**. Kết quả giống bản cũ thì Reload extension **và F5** trước khi nghi logic.
5. **`evaluate.py` mặc định là argmax KHÔNG ngưỡng.** Truyền `--threshold 0.95 --margin
   0.25`. Chính chỗ này làm "INT8 gần như miễn phí" sai 9 lần (quyết định 25).
6. **Precision quan trọng hơn recall.** Gạch nhầm một lần là người dùng gỡ cài.
7. **Localhost KHÔNG tương đương extension.** `web_accessible_resources` chỉ áp dụng với
   `chrome-extension://`; thiếu `vendor/*` làm tầng model chết im lặng hai tuần.
8. **Thử bằng câu mà tầng luật CỐ Ý không bắt** — đoạn thử ở việc số 1.
9. **Trọng số lớp trong `noise.py` là chặn trên.** Đọc phân bố đo được, không đọc cấu hình.
10. **Tài liệu repo này đã nhiều lần khai đã làm một việc mà code nói ngược lại** — lần
    gần nhất: "chạy trong Web Worker". Kiểm bằng artifact (`git show --stat`, grep, đo)
    rồi hãy tin.
11. **Sai ở tầng ĐỌC số nguy hiểm y như sai ở tầng ĐO.** Công cụ đọc số phải dừng hẳn khi
    thiếu dữ liệu, và phải **đếm** thứ nó không khớp được thay vì lặng lẽ bỏ đi.
12. **`async` không có nghĩa là không chặn.** Đo nhịp đập bằng MessageChannel — không
    dùng rAF, vì tab ẩn thì rAF không chạy.
13. **Đo đúng ĐƠN VỊ mà sản phẩm đưa vào model**, và **mốc cùng lượt** cho đại lượng
    nhiễu. Mọi script chấm câu đứng một mình suốt từ v1 tới v4 (quyết định 32); ngưỡng
    đứng hình của 33 bị chính bản cũ trượt.
14. **"Chậm" do người dùng báo là triệu chứng, không phải số đo** — và **đừng tin sự kiện
    `input`** với trình soạn thảo tự quản DOM. Lexical dán mà không bắn `input`; hai giả
    thuyết "chậm" đầu tiên đều sai, và một cái suýt kéo theo cả một kiến trúc (quyết định
    36). Mọi trang thử đưa chữ vào bằng gõ hoặc gán `value`; người dùng thật **dán**.
15. **Đếm byte NUL trước khi commit.** Chuỗi thoát NUL gõ trong tham số lệnh gọi công cụ
    bị giải mã thành byte thật — đã lặp lại bốn lần; git từ chối commit message chứa NUL
    nhưng **không** từ chối file chứa NUL. Muốn có dấu gạch ngược thì dựng bằng `chr(92)`:

    ```bash
    git ls-files | python -c "import sys,pathlib; print([f for f in sys.stdin.read().split() if pathlib.Path(f).suffix in ('.js','.mjs','.py','.md','.html','.json') and bytes([0]) in pathlib.Path(f).read_bytes()])"
    ```

---

## Thứ đáng giữ khi viết CV và blog

Bài blog đã viết ở `docs/blog.html`. Luận điểm:

> Mười mấy lần làm hỏng dự án này, không lần nào do tính sai. Lần nào cũng là đo một con
> số **hoàn toàn đúng** — của một đường dẫn mà sản phẩm không đi qua.

| Tôi đo | Sản phẩm thật thì |
|---|---|
| Dev tự sinh | gặp lỗi người thật mắc |
| argmax, không ngưỡng | đòi p ≥ 0,95 và biên 0,25 |
| `http://localhost` | chạy qua `chrome-extension://` |
| Kích thước thô | người dùng tải bản nén |
| Câu có sẵn lỗi | phần lớn thời gian người ta viết đúng |
| Từng câu đứng một mình | đưa cả ô nhập liệu vào một cửa sổ |
| `await`, "chạy trong Worker" | giữ luồng chính của trang |
| Gõ chữ vào ô thử | người dùng **dán**, và Lexical không bắn `input` |

Cách rẻ nhất phát hiện khoảng cách đó: **cài sản phẩm vào máy mình rồi dùng như người
dùng**. Lỗi dán của quyết định 36 lộ ra trong mười phút thử thật, sau khi mọi trang đo
trên localhost đều xanh.

Khi báo cáo hiệu năng, **luôn kèm đánh đổi**. Và **ghi ngưỡng chấp nhận TRƯỚC khi có
số**, commit nó, để thứ tự có lịch sử git làm chứng. Giá trị của nó hiện rõ nhất khi nó
chặn một lựa chọn trông tốt hơn: cache cửa sổ (quyết định 35) giống hệt F2 ở mọi issue
và rẻ hơn 25–50 lần ở hai kiểu sửa — nhưng trượt ở kiểu thứ ba, và chính lần trượt đó
lộ ra phép đếm thiết kế đã bỏ sót kiểu sửa người dùng hay làm nhất.
