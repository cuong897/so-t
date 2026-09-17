# Bàn giao — dự án Soát

Đọc file này trước, rồi `README.md` (tổng quan) và `docs/decisions.md` (35 quyết
định, kèm lý do và mọi lỗi đã mắc).

---

## Phiên vừa rồi làm gì (15–17/09/2026)

Mười một commit, `ea8c174..` commit bàn giao này. Bắt đầu từ yêu cầu "xem xét kỹ việc
sửa model cắt cụt văn bản" (việc số 4 cũ), và nó mở ra ba chuyện lớn hơn:

**Tầng model giữ luồng chính của trang** (`ea8c174`). `onnxEngine.js` khai "chạy
trong Web Worker"; không có Worker nào, và `ort.env.wasm.proxy` không bật. Quyết
định 31 dựa vào chính lời khai đó để nói cái giá của việc chia đoạn "dễ chịu".
Ba chỗ khai sai, đã sửa cả ba. Bẫy số 10, lần thứ tư.

**Mọi con số chất lượng là số của câu đứng một mình** (`18900d4`, quyết định 32).
Cả bốn script đo chấm từng câu một; sản phẩm thì nhét cả ô nhập liệu vào một cửa
sổ. Cùng câu, cùng model: recall 0,7426 khi đứng một mình, 0,6202 khi nằm cuối
cửa sổ. Thủ phạm chính là **vị trí** trong cửa sổ, không phải có câu bên cạnh.

**Chấm theo câu thay cho cắt cụt** (`1464863` ngưỡng ghi trước → `6cd2a6e` sửa
bpe cắt giữa từ → `afb0774` cài đặt, quyết định 33). Trên văn bản **có dấu câu**:
qua cả bảy điều kiện áp dụng, phủ 100% mọi cỡ, recall 0,7457 trùng đúng số của
`evaluate.py`. Trên văn bản **không dấu câu**: không đường lui nào qua đủ, nên
theo luật ghi trước lúc đó **vẫn cắt cụt**.

Một điều kiện ghi trước hoá ra đặt sai — đứng hình "≤ 100ms, lâu nhất trong 3
lần" — vì chính bản cũ cũng trượt nó khi đo cùng lượt. Không lách: mở **đợt đo
riêng** (`35fbf45`, quyết định 34) với p50/p90 trên 40 văn bản, mốc cùng lượt, và
một **đối chứng A/A** để thước đo tự nói được "tôi không đủ phân giải". Đối chứng
qua, cả F2 lẫn F2s qua, luật chọn ra **F2** — văn bản không dấu câu giờ cũng được
đọc hết: recall 0,1553 → 0,7202, precision 0,9419 → 0,9671.

Và một chuyện nhỏ nhưng dai (`73fc3c1`): byte NUL thật nằm trong mã nguồn từ
commit đầu tiên, làm `grep` coi `bpe.js` là file nhị phân. Nó lặp lại ba lần
trong phiên này vì chuỗi thoát bị giải mã ngay trong tham số lệnh gọi công cụ.

**Cache theo cửa sổ — thử và trượt** (`c5e374f`, quyết định 35). Giống hệt F2 ở mọi
issue, rẻ hơn 25–50 lần khi gõ thêm hay thay một từ, nhưng xoá một từ giữa bài vẫn
chạy lại nửa bài. Phép đếm lúc thiết kế đã bỏ sót đúng kiểu sửa đó. Code nằm sẵn,
tắt; việc số 4 ghi hướng tiếp.

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

## Trạng thái: CẢ HAI TẦNG ĐÃ CHẠY TRONG CHROME THẬT — nhưng tầng model đến chậm

- 69 commit, cây git sạch
- 63 test JS + 2 bộ kiểm tra Python, tất cả pass (`npm run test:all`)
- **ĐÃ XÁC NHẬN CHẠY TRONG CHROME THẬT với tầng luật.** Chủ repo gõ trên
  Facebook câu *"mình xin chia sẽ một vãi trãi nghiệm cho mọi ngươi"* và thấy
  gạch chân đúng hai chỗ — khớp chính xác với `chia sẽ→chia sẻ` và
  `trãi→trải` mà tầng luật sinh ra. `targets.js`, `highlighter.js` và ô soạn
  Lexical của Facebook đều hoạt động.
- **ĐÃ XÁC NHẬN TẦNG MODEL CHẠY TRONG CHROME THẬT** (17/09/2026), lần đầu tiên kể
  từ khi dự án bắt đầu. Chủ repo dán đoạn thử 494 ký tự của việc số 1 vào ô "Tạo bài
  viết" của Facebook:
  * **có dấu câu** → gạch đúng một chỗ, dưới `cứ` ở câu cuối — sau chỗ bản cắt cụt
    cũ dừng, nên đây là đường chấm theo câu (`afb0774`). Sáu câu đầu không bị gạch.
  * **không dấu câu, viết thường** → lần đầu **không** có gạch. Chạy lại đúng đoạn đó
    trên localhost: code hiện tại bắt `cứ→cư` 100%, còn ép về đường lui `none` cũ thì
    ra rỗng — khớp ảnh. Sau khi Reload extension **và F5 tab Facebook** thì có đề xuất.
    Chrome giữ content script cũ trong tab đang mở; Reload extension thôi là chưa đủ.
  * **Nhưng đề xuất "mất một lúc mới hiện"** — chưa đo là bao lâu. Nghi phạm chính:
    mỗi trang tự nạp lại model 78MB + wasm 14MB (xem việc số 1).
- Gói nộp store **đã đóng lại với code chấm theo câu** (58,6 MB nén), **chưa nộp**

### Số liệu chốt

Model đang ship: `student768_v4`, INT8 per-channel, biên 0,25, ngưỡng **theo
lớp nhãn**: thanh điệu **0,95**, phụ âm **0,90** (`onnxEngine.js`, quyết định 29).

| Thước đo | Số | Đo bằng |
|---|---|---|
| VSEC giữ kín, trong tầm | P **0,9709** · R 0,7457 · F1 0,8436 | `evaluate.py --held-out --threshold 0.95 --margin 0.25` |
| Lỗi phụ âm (1.796 ca) | recall **48,2%** | `consonant_eval.py` |
| riêng lớp `d/gi/r` (596 ca) | recall **33,9%** | `consonant_eval.py` |
| Báo động giả trên văn bản đúng | 1,35% / 1,05% số câu | `false_alarm.py` |
| Độ trễ **trong trình duyệt** (wasm) | nạp 355–585ms · một câu **20–27ms** · bài 2.000 ký tự **525–600ms** tổng, đứng hình ≤ **82ms** | `dev/bench-accept.html` |
| Độ trễ onnxruntime Python, 1 luồng | p50 5,5ms · p95 5,7ms | `export_onnx.py` |
| Gói cài | 95,3 MB thô → **58,6 MB nén** | `package_extension.py` |
| **Theo CÂU** — câu sạch hẳn | **39,2%** | `sentence_eval.py` + `dev/sentence-eval.html` |
| **Theo CÂU** — câu sản phẩm KHÔNG ĐỤNG | **49,0%** | nt |
| **Phạm vi phủ của model** | **100%** mọi cỡ, có hay không có dấu câu (bản cắt cụt cũ: 58% ở 700, 7% ở 6.000) | `dev/bench-accept.html`, `dev/bench-fallback.html` |
| **Trên bài KHÔNG dấu câu** (đường lui F2) | P **0,9671** · R **0,7202** · câu sạch bị gạch 0,87% | `dev/bench-fallback.html` |
| **Trên bài đăng có dấu câu**, qua `check()` | P **0,9669** · R **0,7457** · câu sạch bị gạch 0,98% | `dev/bench-accept.html` |

**Con số độ trễ đã sai HAI lần trong tài liệu này.** Lần đầu ghi "p50 5,4ms ·
export_onnx.py" — đó là số onnxruntime trên **Python**, còn trình duyệt chạy qua
wasm. Lần hai ghi "p50 18–24ms" — đúng là số trình duyệt, nhưng đo trên **một
câu 65 ký tự**, trong khi người dùng gõ cả bài đăng. Chỉ có `dev/bench-model.html`
mới đo đủ các cỡ văn bản. Hai lần sai cùng một họ, và cùng là luận điểm của cả
dự án.

**Năm lưu ý khi đọc bảng này:**

1. `evaluate.py` **mặc định chấm bằng argmax không ngưỡng** — đó là năng lực
   thô, không phải thứ người dùng thấy. Phải truyền `--threshold 0.95
   --margin 0.25` mới ra số thật. Cùng model này, argmax cho P 0,8883 · R
   0,8543 — precision lệch 8,7 điểm so với con số thật.
2. Báo oan máy đếm là **chặn trên**. Đọc tay 54 ca của bản trước
   (`docs/false_alarm_review.md`) thì 26% số "báo oan" hoá ra model bắt đúng
   lỗi thật trong văn bản được coi là sạch; tỷ lệ oan thật khoảng **0,75%**.
   **Phần đọc tay chưa làm lại cho v4** — danh sách của v4 cũng có `cứ`→`cư`,
   `vât`→`vật`, `trỗ`→`chỗ`, đều là lỗi thật.
3. So với **v3**, v4 tốt hơn ở cả sáu thước đo. So với **v1** thì vẫn là đánh
   đổi: recall VSEC 0,7457 so với 0,7670, đổi lấy precision 0,9709 so với
   0,9550 và recall phụ âm 25,7% → 48,2%. Xem quyết định 26, 27 và 29.

4. **Độ trễ có hai con số, và con số người dùng cảm thấy là ĐỨNG HÌNH.** Tầng
   model chạy trên luồng chính của trang (quyết định 32). Tổng CPU tăng theo độ
   dài vì giờ model đọc hết bài; đứng hình thì không, vì mỗi câu một lượt và
   luồng được nhả giữa hai lượt. Và một lượt `session.run` dao động gấp đôi trên
   cùng một văn bản (48–94ms) — ghi **khoảng**, và so với bản cũ **đo cùng lượt**,
   đừng so với một con số chép từ lần đo khác.

5. **`R 0,7457` PHẢI đi kèm mẫu số của nó.** Đó là recall trên phần bộ nhãn biểu
   diễn được, tức 54,5% lỗi VSEC. Nhân ra: `0,7457 x 0,545 = 0,406`, nên tỷ lệ
   lỗi thật sự được sửa là **40,8%**. Không phải lỗi tính toán — `evaluate.py`
   khối C đã báo sẵn con số toàn bộ. Nhưng 0,7457 là con số hay bị trích ra khỏi
   ngữ cảnh nhất, và người đọc CV sẽ hiểu nó là "sửa được 74,6% lỗi tôi mắc".

6. **Mọi dòng từ `evaluate.py` tới `sentence_eval.py` chấm câu ĐỨNG MỘT MÌNH.**
   Trước `afb0774` chúng đẹp hơn thứ người dùng gặp trong bài đăng nhiều câu
   (recall 0,62–0,71 thay vì 0,7426, quyết định 32). Giờ chúng khớp trên văn bản
   **có dấu câu**. Văn bản không dấu câu đi cửa sổ trượt F2 và thấp hơn một chút:
   recall 0,7202, precision 0,9671 (quyết định 34).

---

## VIỆC TIẾP THEO — theo thứ tự ưu tiên

### 1. Tầng model đến chậm — đo trước, rồi quyết có chuyển sang offscreen không

Tầng model **đã chạy** trong Chrome thật (xem Trạng thái). Việc còn lại là câu chủ
repo hỏi khi thấy đề xuất "mất một lúc mới hiện": *mỗi lần vào trang mới có phải đợi
model nạp không?* **Có.** `manifest.json` chèn content script vào `<all_urls>`, và dòng
đầu tiên của `content/index.js` là `model.load(...)` — mỗi trang, mỗi tab, mỗi lần
chuyển trang tự nạp 78MB model + 14MB wasm và tạo một phiên onnxruntime riêng, kể cả
trang không có ô nhập liệu nào. Chưa quyết định nào trong `decisions.md` đo chuyện
này: mọi phép đo chạy một trang, nạp một lần.

**Đo trước, hai con số, trong Chrome thật:**

1. **Thời gian tới đề xuất đầu tiên trên một tab MỚI.** F5 tab Facebook, mở "Tạo bài
   viết" và dán ngay đoạn thử, bấm giờ tới lúc có gạch. Rồi xoá đi dán lại lần hai —
   lúc đó model đã nạp xong. Chênh lệch giữa hai lần chính là giá của việc nạp lại mỗi
   trang. (Localhost đo nạp 355–585ms với file đã nằm trong cache HTTP — không phải
   đường của extension.)
2. **RAM mỗi tab.** Mở 3–4 tab bất kỳ, Shift+Esc (Task Manager của Chrome), chụp cột
   bộ nhớ. So với cùng các tab khi tắt extension.

**Hướng sửa đã nghĩ tới, chưa làm:** nạp model **một lần cho cả trình duyệt** trong
offscreen document (`chrome.offscreen`, MV3). Tab mới có model ngay, một bản trong bộ
nhớ dù bao nhiêu tab, và suy luận **ra khỏi luồng chính của trang** — gốc của mọi con
số đứng hình trong quyết định 32–35 biến mất. Giá: thêm quyền `offscreen` (phải sửa
chính sách riêng tư và mô tả store), và đúng loại thay đổi từng giết tầng model hai
tuần (quyết định 24) — kiểm trong Chrome thật trước khi tin số localhost.

Nếu làm offscreen thì **xếp nó trước việc số 4**: phần lớn việc số 4 (nhả luồng, cache
cửa sổ, đứng hình) được đo trong kiến trúc sẽ bị thay.

#### Đoạn thử đã dùng — giữ để kiểm hồi quy sau mỗi thay đổi tầng model

Tầng luật **đã xác nhận chạy** (xem phần Trạng thái). Còn lại đúng một câu hỏi:
tầng model có nạp được qua `chrome-extension://` không? Quyết định 24 đã có
tiền lệ: tầng model chết im lặng hai tuần vì thiếu `vendor/*` trong
`web_accessible_resources`, không phép đo offline nào chạm tới.

Cách kiểm, dùng đúng câu này:

> Hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển.

Tầng luật **cố ý** không bắt câu này; model bắt `cứ→cư` ở **99,9%** (đã đo).
Nên:

* có gạch chân dưới `cứ` → **cả bốn tầng sống**, xong việc này
* không có gì → tầng model không nạp được trong extension. Mở DevTools trên
  trang đó, tìm cảnh báo `[soát] không nạp được model`.

**Đợi ~10 giây sau khi mở trang rồi hãy gõ.** Model nặng 92MB, nạp mất vài giây,
và lượt suy luận đầu tiên còn tốn thêm 55–126ms. Bốn ảnh chụp màn hình đầu tiên
của chủ repo đều rơi vào đúng cửa sổ đó — chỉ thấy tầng luật làm việc.

```
chrome://extensions → Developer mode → Load unpacked → chọn extension/
```

**Nhớ Reload extension** sau mỗi lần thay file model — trình duyệt cache cả file
`.onnx`. Kết quả giống hệt bản cũ thì nghi cache trước, đừng nghi logic.

**Đừng dùng `dành được phần quà` để kiểm** — model xếp `dành→giành` ở p = 0,835,
dưới ngưỡng phụ âm 0,90, nên nó im lặng *đúng theo thiết kế*. Câu bắt được ở lớp
này: *"Rao động về hình dáng từ cây bụi rậm rạp..."* — `Rao→Dao` ở 92,7%.

#### Và kiểm luôn đường CHẤM THEO CÂU — code mới, chưa từng chạy trong extension

Câu `cứ trú` ở trên ngắn, nên nó qua được cả bản cắt cụt lẫn bản mới. Muốn biết
`afb0774` có chạy trong Chrome thật không thì dán nguyên đoạn này (494 ký tự, 114
subword — lỗi nằm ở câu cuối, **sau** chỗ bản cũ cắt):

> Tuần trước nhóm mình đã tổ chức một buổi gặp mặt nhỏ ở quán cà phê gần trường. Mọi người đến khá đông và ai cũng mang theo một món quà nhỏ để trao đổi với nhau. Sau đó cả nhóm cùng nhau đi dạo quanh hồ và chụp rất nhiều ảnh kỷ niệm. Buổi tối chúng mình ăn lẩu và nói chuyện về những dự định trong năm tới. Có bạn muốn học thêm tiếng Anh, có bạn định xin việc ở một công ty lớn. Mình thì vẫn đang phân vân giữa việc học tiếp và đi làm ngay. Hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển.

Đã chạy với model thật trên localhost: bản mới gạch `cứ→cư` ở 100%, bản cắt cụt
**không gạch gì**, và sáu câu đầu không bị gạch oan ở bản nào.

* gạch chân dưới `cứ` → chấm theo câu chạy trong extension
* có gạch ở câu `cứ trú` ngắn mà **không** có ở đoạn này → extension đang chạy code
  cũ. Reload extension rồi thử lại.

Rồi dán lại **đúng đoạn đó nhưng xoá hết dấu chấm, dấu phẩy và viết thường** —
kiểu bài Facebook viết liền. Đó là đường lui F2 (quyết định 34), cũng chưa từng
chạy trong extension. Đã chạy với model thật: bản mới vẫn gạch `cứ→cư` 100%,
bản cắt cụt im lặng.

#### Bốn ảnh chụp màn hình thật đã dạy gì

| Câu người dùng gõ | Sản phẩm làm gì |
|---|---|
| `chúc mựng... trí giá... đuồng` | không ai bắt. `mựng` p=0,802 dưới ngưỡng thanh điệu 0,95; `đuồng→đồng` **ngoài tầm vĩnh viễn** (`uô→ô`) |
| `10 triệu đông` | model bắt `đông→đồng` ở **99,6%** — nhưng chưa nạp kịp |
| `con tró màu vàng` | không bắt. Model xếp `trỏ` (thanh điệu) 0,827 còn `chó` (TR_CH) chỉ 0,052 |
| `chia sẽ... trãi...` | **tầng luật bắt cả hai** ✓ |

Ca `tró→chó` đáng ghi: `tró` không có trong từ điển, `chó` có, TR_CH nằm sẵn trong
tập ứng viên — model vẫn với tay sang nhãn **thanh điệu**. Đúng hiện tượng quyết
định 27 đo được ở lớp d/gi/r (94% ca sửa sai bắn sang thanh điệu), giờ thấy ở cả
lớp ch/tr. Hạ ngưỡng không cứu được — 0,052 thì hạ tới đâu cũng không tới.

**Và một lưu ý cho mọi lần gõ thử:** vệt gạch đỏ lượn sóng của Chrome spellcheck
**trông giống hệt** vệt của sản phẩm này. Ba trong bốn ảnh trên, vệt gạch là của
Chrome chứ không phải của mình. Muốn phân biệt thì bấm vào từ đó: sản phẩm này
hiện tooltip kèm đề xuất, Chrome thì phải chuột phải mới ra menu.

### 2. Xoá blob 311MB khỏi LỊCH SỬ git (CHẶN việc nộp store)

Đã làm xong phần dễ: commit `a8fa30c` chạy `git rm --cached` — việc mà commit
`0e08a98` khai là đã làm nhưng thực ra chỉ sửa `.gitignore` (diff của nó có đúng
một file). Giờ file không còn được theo dõi ở HEAD nữa.

**Còn lại phần phải viết lại lịch sử**, vì blob vẫn nằm trong tree của `ef2a49d`
và `4d14d67`, và `.git` vẫn **624 MB**. GitHub từ chối mọi file trên 100MB, nên
chừng nào chưa xoá thì repo không đẩy lên GitHub được — mà bước 2 của
`docs/store/nop-store.md` cần đúng việc đó để có URL chính sách riêng tư công
khai.

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --index-filter \
  "git rm --cached --ignore-unmatch extension/models/soat.fp32.onnx.data" \
  -- f2a8679..HEAD
```

Chưa push đi đâu nên an toàn. Tag `backup-before-filter` trỏ vào master trước
khi đụng gì, và `refs/original/` giữ thêm một bản. Sau khi chắc chắn thì
`git reflog expire --expire=now --all && git gc --prune=now` mới thật sự lấy lại
dung lượng.

Còn 311MB nữa nằm ở `extension/models/soat.fp32.onnx.data` **trên đĩa**: không
ai nạp nó (extension chỉ đọc bản int8), `package_extension.py` đã loại nó khỏi
gói, và nó không còn được git theo dõi. Xoá được nếu cần chỗ; `export_onnx.py`
sinh lại nó mỗi lần xuất thẳng vào `extension/models`.

### 3. Nộp Chrome Web Store

Hồ sơ đã xong hết, chỉ còn phần cần tài khoản của chủ repo. Làm theo
**[docs/store/nop-store.md](docs/store/nop-store.md)** — 8 bước, bắt đầu bằng
bước 0 là thử lại trên Chrome thật (tức việc số 1 ở trên).

| Thứ | Ở đâu |
|---|---|
| Gói cài | `dist/soat-1.0.0.zip` (58,6 MB, đóng lại với code chấm theo câu `afb0774`) |
| 3 ảnh 1280×800 | `dist/store/*.png` |
| Nội dung từng ô devconsole | `docs/store/listing.md` |
| Chính sách riêng tư | `docs/store/privacy-policy.md` |
| Trang giới thiệu | `docs/store/landing.html` |

Sinh lại: `python ml/package_extension.py` và `python ml/make_screenshots.py`
(cả hai neo đường dẫn theo vị trí file, đứng đâu chạy cũng được).

### 4. Sửa bài dài không dấu câu vẫn chấm lại cả bài — và một lỗi bộ nhớ

**Đây là việc đầu tiên không cần tài khoản hay quyền gì của chủ repo.**

Đã xong trước đó: văn bản không dấu câu được đọc hết bằng cửa sổ trượt F2 (quyết
định 34 — recall 0,7202, precision 0,9671).

**Vừa thử và TRƯỢT: cache theo cửa sổ** (quyết định 35, `c5e374f` ngưỡng ghi trước).
Code nằm sẵn trong `onnxEngine.js`, **tắt** (`DEFAULT_WINDOW_CACHE = 0`). Trên model
thật: giống hệt F2 480/480, và một lần sửa bài 6.000 ký tự tốn x0,02 khi gõ thêm
cuối, x0,04 khi thay một từ — nhưng **x0,47 khi xoá một từ giữa bài** (22 lượt model
trên 43), trượt ngưỡng 0,25.

Lý do: F2 chỉ tự khớp lại ranh giới cửa sổ khi **số từ** không đổi. Phép đếm lúc
thiết kế bỏ sót đúng kiểu xoá và chèn từ, nên đã loại nhầm phương án đúng:

| 6.000 ký tự, số cửa sổ phải chạy lại | thay từ | **xoá từ** | **chèn từ** | tổng cửa sổ |
|---|---|---|---|---|
| F2 | 3,9 | **17,2** | **16,3** | 42,8 |
| cắt theo nội dung | 2,3 | **2,5** | **2,6** | 58,4 |

Việc tiếp theo, theo thứ tự:

1. **Chặn cache theo câu bằng số dòng logit** — lỗi bộ nhớ **đang ship**. Cache theo
   câu lưu cả bài cho mọi phiên bản: 60 lần sửa bài 2.000 ký tự không dấu câu đã giữ
   26.460 dòng, và trần là 400 phiên bản — với bài 6.000 ký tự là ~536.000 dòng. Sửa
   này không đổi issue nào, chỉ đổi thời gian ở ca biên. Nhỏ, nên làm trước.
2. **Ứng viên `F2c`: cửa sổ cắt theo nội dung + cache cửa sổ.** Mẫu cài đặt nằm trong
   quyết định 35 (hash FNV của từ, đoạn 16–32 subword, cửa sổ = hai đoạn liền nhau,
   tối đa 64). Cửa sổ khác F2 nên **issue khác F2** — phải ghi lại cả điều kiện chất
   lượng của quyết định 34 (precision ≥ 0,95, câu sạch bị gạch ≤ 1,50%, so F2 đo cùng
   lượt), cộng chi phí sửa cho **đủ năm** kiểu: thêm cuối, thay, đổi dấu, xoá, chèn.
   Tốn 36% cửa sổ hơn F2 khi chấm lạnh — đứng hình phải đo, không suy ra.
3. **`ort.env.wasm.proxy = true`** — đẩy `session.run` khỏi luồng chính. Gốc của mọi
   con số đứng hình trong quyết định 32–35. Phải kiểm trong Chrome thật: worker phải
   nạp được qua `chrome-extension://` từ content script (quyết định 24).

Hai lưu ý khi sửa code ở đây:

* **Đếm byte NUL trước khi commit** (quyết định 34). Chuỗi thoát NUL gõ trong tham số
  lệnh gọi công cụ bị giải mã thành byte thật — đã lặp lại **bốn** lần, lần cuối ngay
  trong đợt cache cửa sổ.
* **Tái cấu trúc engine thì so với commit trước bằng session giả**, như quyết định 35
  đã làm: trang đo so hai cấu hình của **cùng** code, nên không nhìn thấy lỗi làm lệch
  cả hai phía cùng lúc.

### 5. ĐÃ XONG — ngưỡng riêng cho lớp phụ âm (quyết định 29)

Giữ lại mục này vì nó trả lời sẵn hai câu hỏi hay được hỏi lại.

**Đã làm:** hạ ngưỡng lớp phụ âm từ 0,95 xuống **0,90**, thanh điệu giữ 0,95.
Quét cả ba mức 0,90 / 0,85 / 0,80; cả ba đều qua năm điều kiện đã ghi trước ở
`544c455`, và luật chọn đã ghi trước là "thấp nhất về báo oan" nên lấy 0,90.

Kết quả: recall phụ âm 43,3% → **48,2%**, d/gi/r 28,5% → **33,9%**, trả bằng
precision 0,9749 → 0,9709 và báo oan 1,30%/1,00% → 1,35%/1,05%. Mọi nhóm phụ âm
đều lên, không nhóm nào trả giá cho nhóm nào.

**Câu hỏi 1: sao không lấy 0,80 cho nhiều recall hơn?** Vì 0,80 cho F1 cao hơn
thật (0,8462 so với 0,8436) nhưng luật chọn viết **trước khi đo** nói precision
quan trọng hơn recall. Đổi luật sau khi nhìn số thì việc ghi luật trước chẳng
còn nghĩa gì. Muốn đổi thì đổi luật trước, cho một đợt đo SAU.

**Câu hỏi 2: sao `dành được phần quà` vẫn chưa bắt?** Model xếp nó ở p = 0,835,
dưới cả 0,90. Phải xuống 0,80 mới bắt — xem câu hỏi 1. **Ví dụ đầu bảng của
README vẫn chưa được giải quyết**, đừng kể ngược.

**Chiều còn lại đã thử và đã bác** (quyết định 26): hạ ngưỡng THANH ĐIỆU xuống
0,85 làm báo oan lên 1,65%/1,75%. Lớp thanh điệu chiếm 91% lỗi thật nên nó nhạy
hơn hẳn — đừng đụng vào 0,95 mà không đo lại cả ba phép đo.

**Và kiểu tiêu chí này đã hỏng một lần** (quyết định 28): nới cổng cho token
**phi từ** — tiêu chí dựa vào từ điển — thua ở mọi mức ngưỡng. Khác biệt: ở đó
model không thiếu tự tin mà thiếu đáp án (p của nhãn đúng trung vị 0,0014); ở
lớp phụ âm thì nhãn đúng đã dẫn đầu với p trung vị 0,257. Tiêu chí nào cũng phải
đo, đừng suy từ tiêu chí kia.

### 6. Lớp d/gi/r vẫn còn hai phần ba ca bị bỏ sót

33,9% tốt hơn 17,8% của v3 nhưng vẫn thấp. `consonant_diagnose.py` chia sẵn phần
còn lại (596 ca, bảng dưới đo ở ngưỡng 0,95 dùng chung — trước quyết định 29):

| | v3 | v4 |
|---|---|---|
| sửa đúng | 106 | **170** |
| sót, nhãn đúng dẫn đầu | 241 (p trung vị 0,099) | 244 (p trung vị **0,257**) |
| sót, nhìn sang chỗ khác | 201 (p nhãn đúng 0,0014) | **151** |
| sửa sai | 48 | **31** |

Ô "nhãn đúng dẫn đầu" gần như không đổi về số ca nhưng p trung vị tăng 2,6 lần
— model đã nghiêng về đáp án đúng mạnh hơn nhiều, chỉ chưa vượt ngưỡng. Đó là
lý do việc số 5 đáng làm trước, và nó đã thu được **32 ca** trong ô đó (quyết
định 29). Phần còn lại của ô này — khoảng 212 ca dưới p = 0,90 — **phải học**,
hạ ngưỡng thêm nữa thì trượt luật chọn.

**Đã thử và loại bỏ hướng sửa bằng cue** (quyết định 26): thêm `phần`+`quà` vào
nhóm cue của `giành` thì bắt được câu trên, nhưng câu **đúng** `chị dành phần
quà cho em` bị gạch oan. Đây là việc của model, không phải của luật.

**Nếu train thêm:** đẩy d/gi/r cao hơn 7,42% thì phải biết mình đang lấy của
ai. v4 đã lấy 30 ca của năm nhóm phụ âm còn lại (`l/n` 45,4%→39,6% là nặng
nhất) để được thêm 64 ca cho d/gi/r. Lấy nữa thì các nhóm kia tụt nữa.

### 7. Giảm dung lượng — đã đo, chưa làm, và GIỜ QUAN TRỌNG HƠN TRƯỚC

Lý do mới, không phải chuyện tỷ lệ cài đặt: model 92MB nạp mất vài giây, và **bốn
ảnh chụp màn hình đầu tiên của chủ repo đều rơi vào đúng cửa sổ đó** — người dùng
gõ xong trước khi tầng đắt nhất kịp sẵn sàng. Giảm dung lượng không chỉ để người
ta chịu tải, mà để tầng model **kịp chạy**.

- **Cắt vocab**: chỉ 23.669/64.001 token PhoBERT thực sự xuất hiện. Giữ token
  gặp ≥20 lần phủ 99,69% số lượt, embedding 49,2M→11,9M, model về ~40MB.
  **Chỗ nguy hiểm:** `bpe.js` phải dùng đúng id mới — sai id là lỗi **hoàn toàn
  im lặng**, model vẫn chạy và chỉ trả rác. Bắt buộc mở rộng
  `test/bpe.test.mjs` phủ phần ánh xạ trước khi train.
- **Tải model lúc chạy**: bundle về ~14MB. MV3 cấm nạp *code* từ xa nhưng không
  cấm nạp *dữ liệu*. Đổi lại phải có hosting, kiểm tra toàn vẹn, UX lần chạy
  đầu, và **phá vỡ quyết định 10** (không xin `host_permissions`).

---

## Bố cục

```
extension/          MV3, không cần build
  src/engine/       vi.js (âm tiết + 23 nhãn), rules.js, ruleEngine.js,
                    bpe.js (BPE tự viết), onnxEngine.js (tầng 3,
                    thanh điệu 0,95 / phụ âm 0,90, CHẤM THEO CÂU,
                    đường lui F2 — cửa sổ trượt — cho câu dài quá cửa sổ)
  src/content/      targets.js (lọc ô), highlighter.js, replace.js, tooltip.js
  models/           artifact sinh ra, KHÔNG commit
  vendor/           onnxruntime-web 14MB, tải bằng ml/fetch_vendor.sh
ml/                 vi.py (bản song song vi.js), noise.py, mine_errors.py,
                    build_corpus.py, dataset.py, train.py,
                    export_onnx.py, export_tokenizer.py, encoding.py
  test_encoding.py  không để lọt từ cắt dở — bản song song test cuối của bpe.test.mjs
  mix_datasets.py   trộn nhiều tập train, IN RA phân bố đo được
  evaluate.py       VSEC — thêm --threshold/--margin để chấm ở ngưỡng thật,
                    và --result để không ghi đè out/eval.json
  false_alarm.py    báo động giả trên văn bản ĐÚNG
  consonant_eval.py tập chấm riêng cho lỗi phụ âm (1.796 ca)
  consonant_diagnose.py  vì SAO lớp phụ âm sót — thiếu tự tin, đoán sai, hay
                    bị nhãn thanh điệu ăn mất
  diagnose.py       chia phần bỏ sót trên VSEC
  sentence_eval.py  chấm theo CÂU — năm rổ kết cục. CHỈ tầng model;
                    dùng dev/sentence-eval.html để có số cả hai tầng
  gate.py           PHÉP QUYẾT ĐỊNH — một bản duy nhất cho phía Python. Đổi
                    ngưỡng thì sửa ở đây và ở onnxEngine.js, không chỗ nào khác
  export_gate_cases.py  sinh fixture parity cho gate.py <-> onnxEngine.js
  threshold_report.py   gom một đợt quét ngưỡng thành một bảng, TỰ CHẤM theo
                    ngưỡng chấp nhận đã ghi trước
  oov_headroom.py   trần trên của hướng "nới cổng cho phi từ" (đã bác)
  oov_gate_eval.py  đo thật hướng đó — bảy luật trên cùng một lượt chạy
  package_extension.py, make_screenshots.py
dev/                playground.html, onnx-test.html, shots.html (nguồn ảnh store)
  sentence-eval.html  chấm theo CÂU với cả hai tầng
  bench-rules.html    độ trễ tầng luật (bấm giờ theo lô)
  bench-model.html    độ trễ tầng model + PHẠM VI PHỦ (của bản cắt cụt cũ)
  bench-blocking.html tầng model có giữ luồng chính không — MessageChannel
  bench-context.html  cùng câu, đứng một mình và nằm trong cửa sổ (nhãn vàng)
  bench-chunking.html chia đoạn ở maxLen 96/192/256 lệch khỏi mốc bao nhiêu
  bench-batch.html    gộp lô: đúng trước, nhanh sau (đã bác — chậm hơn)
  bench-accept.html   TÁM ĐIỀU KIỆN của quyết định 33, qua đúng check()
  bench-fallback.html quyết định 34 — đường lui, đứng hình so bản cũ cùng lượt, A/A
  bench-editcache.html quyết định 35 — cache cửa sổ: đồng nhất, chi phí sửa, bộ nhớ
  baseline/           onnxEngine cắt cụt cũ, để đo so cùng lượt
test/chunking.test.mjs  splitSentences + planRuns: mọi từ phải được phủ
test/windowcache.test.mjs  cache cửa sổ giống hệt chạy lạnh — session giả nhạy ngữ cảnh
docs/decisions.md   35 quyết định
docs/blog.html      bài viết về toàn bộ quá trình và các lần sai
docs/store/         hồ sơ nộp Chrome Web Store
```

### Checkpoint trong `ml/out/`

| Thư mục | Là gì |
|---|---|
| `teacher` | PhoBERT 134M, F1 0,8924 |
| `student768` | Bản 768 gốc (v1), copy trọng số teacher |
| **`student768_v4/best`** | **Đang ship** — fine-tune nhắm riêng d/gi/r |
| `student768_v3/best` | 25% phụ âm nói chung, giữ để đối chiếu |
| `student768_v2/best` | Thử 50% phụ âm, loãng lớp thanh điệu |
| `v4_onnx/`, `v3_onnx/`, `v2_onnx/`, `s768_onnx/` | ONNX của từng bản |

`extension/models/soat.int8.onnx` là **copy nguyên** `out/v4_onnx/v4.int8.onnx`,
không xuất lại — để bytes chạy trong trình duyệt đúng bằng bytes của phép đo.
Kiểm tra bằng `md5sum` hai file nếu nghi ngờ.

`train.py` giữ **hai** bản: `<out>` là epoch cuối (để `--resume` khớp với
`trainer_state.pt`), `<out>/best` là epoch tốt nhất trên dev theo `--select`.
Bản `best` là bản đem đi xuất ONNX.

---

## Lệnh hay dùng

```bash
npm run test:all
python ml/package_extension.py
python ml/make_screenshots.py

cd ml
python evaluate.py --onnx ../extension/models/soat.int8.onnx \
  --tokenizer out/student768_v4/best --held-out --limit 1500 \
  --threshold 0.95 --margin 0.25 --result out/eval_v4.json
python false_alarm.py --onnx ../extension/models/soat.int8.onnx \
  --tokenizer out/student768_v4/best --limit 2000
python consonant_eval.py --onnx ../extension/models/soat.int8.onnx \
  --tokenizer out/student768_v4/best
python consonant_diagnose.py --onnx ../extension/models/soat.int8.onnx \
  --tokenizer out/student768_v4/best --group d/gi/r
```

Dựng lại đúng tập train của v4 (dữ liệu gốc đã có trong `ml/data/`):

```bash
cd ml
python dataset.py --corpus data/corpus.txt --out data_dgir --variants 1 \
  --class-weights data/class_weights_dgir.json --seed 13
python mix_datasets.py --pool data:304356 --pool data_cons:45389 \
  --pool data_dgir:50255 --out data_ft_dgir --seed 13
python train.py --data data_ft_dgir --out out/student768_v4 \
  --model out/student768 --epochs 2 --batch 32 --workers 4 --select f1
python export_onnx.py --model out/student768_v4/best --out out/v4_onnx --name v4
```

`--seed 13` là **bắt buộc**, không phải thói quen: `dataset.py` dùng cùng seed
đó để chia train/dev/test. Đổi seed là đổi phép chia, và câu đang nằm trong
`test.jsonl` có thể lọt sang train — tức tự làm rò rỉ thước đo của chính mình.

**PowerShell 5.1 không có `&&`** — chạy từng lệnh một dòng.

---

## Mười ba điều dễ vấp — đều đã mắc ít nhất một lần

1. **Luôn dùng `--held-out` khi chấm.** `mine_errors.py` rút phân bố lỗi từ nửa
   VSEC; chấm trên cả tập là tự lừa mình.

2. **Benchmark tự sinh nói dối, và nói dối NHIỀU HƠN cho model tệ hơn.** Dev tự
   sinh bảo model mới tệ đi 2,2 điểm trong khi trên lỗi người thật nó tốt lên
   9,2 điểm. Chỉ tin số trên VSEC giữ kín.

3. **`vi.js` và `vi.py` phải cho kết quả giống hệt.** Lệch là lỗi im lặng. Có
   test parity 11 hàm × 78 từ.

4. **Cache trình duyệt phục vụ lại cả file `.onnx`.** Thay model rồi mà kết quả
   giống hệt bản cũ thì nghi cache trước, đừng nghi logic.

5. **`evaluate.py` mặc định là argmax KHÔNG ngưỡng.** Con số đó là năng lực thô.
   Truyền `--threshold 0.95 --margin 0.25` mới ra thứ người dùng thấy. Chính chỗ
   này làm kết luận "INT8 gần như miễn phí" sai mất 9 lần (quyết định 25).

6. **Precision quan trọng hơn recall.** Gạch chân nhầm một lần là người dùng gỡ
   cài; bỏ sót thì họ không biết.

7. **Đo trên localhost KHÔNG tương đương chạy trong extension.** Luật
   `web_accessible_resources` chỉ áp dụng với `chrome-extension://`. Vì quên
   `vendor/*` mà tầng model **chưa từng chạy một lần nào** cho tới khi cài thật
   vào Chrome và gõ thật. `test/manifest.test.mjs` giờ canh chỗ này.

8. **Thử bằng câu mà tầng luật CỐ Ý không bắt được.** Dùng `chia sẽ` hay
   `trãi nghiệm` để kiểm tra model là vô nghĩa — tầng luật bắt sẵn hai cụm đó.
   Câu đã kiểm chứng: *"Hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển."*
   Luật bỏ qua, model bắt `cứ→cư`.

9. **Trọng số lớp trong `noise.py` là CHẶN TRÊN, không phải thứ đặt là được.**
   `corrupt_tokens` bốc lớp lỗi trước rồi mới bốc token, nhưng chỉ bốc trong
   những lớp **có mặt** ở câu đang xét. Lớp d/gi/r đòi âm tiết bắt đầu bằng
   d/gi/r mà đổi phụ âm ra vẫn là từ thật — điều kiện hiếm. Cấu hình 20,2% ra
   11,07% thật; cấu hình 80% ra 47%. Đọc phân bố **đo được**, đừng đọc file cấu
   hình. `mix_datasets.py` in sẵn.

10. **Tài liệu trong repo này đã ba lần khai là đã làm một việc mà diff nói
    ngược lại.** `0e08a98` khai "bỏ theo dõi file 311MB" nhưng chỉ sửa
    `.gitignore`; README báo số v1 suốt thời gian ship v3; công thức dựng lại
    dữ liệu trong `decisions.md` tham chiếu `class_weights*.json` mà cả
    `ml/data/` thì bị ignore ở mức thư mục nên không file nào được version. Khi
    đọc bất kỳ câu "đã làm X" trong tài liệu, **kiểm bằng artifact** —
    `git show --stat`, `git ls-files`, `md5sum` — rồi hãy tin.

11. **Sai ở tầng ĐỌC số cũng nguy hiểm y như sai ở tầng ĐO.** `threshold_report.py`
    bỏ lặng cột mốc nền vì file của nó không cùng quy ước tên, khiến cột kế tiếp
    trượt vào vị trí mốc nền — mà cột mốc nền thì không được chấm theo ngưỡng.
    Một cấu hình QUA cả năm điều kiện hiện ra không một dấu tích nào, trông hệt
    như một cấu hình trượt. Và luật chọn "thấp nhất về báo oan" cài bằng `min`
    trên `max` của hai nguồn thì ra đúng đáp án **vì tình cờ xếp thứ tự**, do cả
    ba mức hoà nhau ở một nguồn. Công cụ đọc số phải **dừng hẳn** khi thiếu dữ
    liệu, đừng bao giờ lặng lẽ bỏ một cột đi.

12. **`async` không có nghĩa là không chặn.** `check()` trả Promise, `index.js`
    gọi nó bằng `.then()`, chú thích ghi "chạy trong Web Worker" — và `session.run`
    vẫn giữ luồng chính của trang suốt lượt chạy. Ba chỗ trong repo cùng suy từ
    cú pháp ra hành vi (quyết định 32). Muốn biết có chặn không thì đo nhịp đập
    bằng MessageChannel — **không dùng rAF**: Browser pane ẩn thì rAF không chạy
    và mọi thứ trông như đứng hình.

13. **Đo đúng ĐƠN VỊ mà sản phẩm đưa vào model.** Bốn script đo chấm từng câu
    một; sản phẩm đưa cả ô nhập liệu vào một cửa sổ. Không script nào sai, không
    con số nào sai — chỉ là suốt từ v1 tới v4 chúng đo một đường mà sản phẩm
    không đi. Hỏi câu này trước mọi phép đo: *model nhìn thấy đúng chuỗi token này
    ở đâu trong sản phẩm?* Và khi đặt ngưỡng cho một đại lượng nhiễu như độ trễ,
    **đo mốc cùng lượt** — quyết định 33 đã đặt "≤ 100ms" mà bản cũ cũng trượt.

---

## Thứ đáng giữ khi viết CV và blog

Bài blog đầy đủ đã viết ở `docs/blog.html`. Luận điểm của nó:

> Mười mấy lần làm hỏng dự án này, không lần nào do tính sai. Lần nào cũng là đo
> một con số **hoàn toàn đúng** — của một đường dẫn mà sản phẩm không đi qua.

| Tôi đo | Sản phẩm thật thì |
|---|---|
| Dev tự sinh | gặp lỗi người thật mắc |
| argmax, không ngưỡng | đòi p ≥ 0,95 và biên 0,25 |
| `http://localhost` | chạy qua `chrome-extension://` |
| Kích thước thô | người dùng tải bản nén |
| VSEC — lỗi người *gõ* | phục vụ người *không biết viết* |
| Câu có sẵn lỗi | phần lớn thời gian người ta viết đúng |
| File cấu hình trọng số lớp | phân bố thật bị chặn bởi lớp nào có mặt trong câu |
| Từng câu đứng một mình | đưa cả ô nhập liệu vào một cửa sổ, từ sau nằm ở vị trí sâu |
| `await`, Promise, "chạy trong Worker" | giữ luồng chính của trang suốt lượt chạy |

Và cách rẻ nhất phát hiện ra khoảng cách đó: **cài sản phẩm vào máy mình rồi
dùng như một người dùng**. Ba lỗi nặng nhất đều lộ ra trong ba mươi phút đầu
làm việc đó, sau khi không phép đo offline nào chạm tới chúng suốt hai tuần.

Khi báo cáo hiệu năng, **luôn kèm đánh đổi**. Ví dụ đúng cách:
*"per-channel cứu 37 trong 45 ca lượng tử hoá làm mất, đổi lấy gói nén tăng từ
49,8 lên 58,6 MB."*

Và một thứ đợt v4 mới thêm vào được — **ghi ngưỡng chấp nhận TRƯỚC khi có số**,
rồi commit nó, để thứ tự có lịch sử git làm chứng chứ không chỉ là lời kể
(`77a9148`, trước khi model train xong). Sáu điều kiện, mỗi điều kiện kèm sai số
chuẩn tính trên đúng cỡ mẫu của phép đo đó. Lần này cả sáu đều qua, nhưng giá
trị của việc ghi trước không nằm ở lần nó qua.

Và quyết định 33 cho thấy giá trị đó thật: lần đầu tiên nếp ghi-trước **chặn
một lựa chọn trông tốt hơn**. F2 hơn hiện trạng ở mọi cột, nhưng trượt một điều
kiện đã ghi — nên không ship, dù chính điều kiện ấy hoá ra đặt sai. Câu đáng kể:
*"ngưỡng tôi đặt trước sai, và tôi sửa nó bằng một đợt đo mới chứ không bằng
cách đọc lại số cũ."*
