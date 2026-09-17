# Bàn giao — dự án Soát

Đọc file này trước, rồi `README.md` (tổng quan) và `docs/decisions.md` (36 quyết
định, kèm lý do và mọi lỗi đã mắc). Phiên mới bắt đầu từ **việc số 1: câu chuyện
thời gian**.

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

## Trạng thái: CẢ HAI TẦNG CHẠY TRONG CHROME THẬT, trên Facebook

- 71 commit, cây git sạch
- 63 test JS + 2 bộ kiểm tra Python, tất cả pass (`npm run test:all`)
- **Tầng luật** — xác nhận từ trước: gõ *"chia sẽ một vãi trãi nghiệm"* trên
  Facebook, gạch đúng `chia sẽ→chia sẻ` và `trãi→trải`.
- **Tầng model — xác nhận lần đầu (17–18/09/2026)**, chủ repo dán đoạn thử 494 ký
  tự (việc số 1) vào ô "Tạo bài viết":
  * **có dấu câu** → gạch đúng một chỗ, `cứ→cư` ở câu cuối — sau chỗ bản cắt cụt cũ
    dừng, nên đây là đường **chấm theo câu**. Sáu câu đầu không bị gạch oan.
  * **không dấu câu, viết thường** → gạch `cứ→cư` qua đường lui **F2**.
  * **dán vào là có gạch**, không phải gõ thêm — sau khi sửa lỗi dán (quyết định 36).
- Gói nộp store `dist/soat-1.0.0.zip` đã đóng lại với code hiện tại (58,6 MB nén),
  **chưa nộp**. Trước khi nộp phải **gỡ chế độ đo** (xem việc số 1).

**Hai điều người sau hay vấp khi thử trên Chrome thật:**

1. **Reload extension thôi là chưa đủ — phải F5 cả tab.** Chrome giữ content script
   cũ trong tab đang mở. Một lần thử của phiên này "không có gạch" chỉ vì thế.
2. **Vệt gạch đỏ lượn sóng của Chrome spellcheck trông giống hệt vệt của Soát.** Rê
   chuột lên từ đó: Soát hiện tooltip kèm đề xuất, Chrome thì không.

---

## Phiên vừa rồi làm gì (15–18/09/2026)

Mười bốn commit, `ea8c174..` commit bàn giao này. Bắt đầu từ "xem xét kỹ việc sửa
model cắt cụt văn bản", kết thúc bằng lần đầu tầng model chạy thật trên Facebook.

| quyết định | chuyện gì | kết quả |
|---|---|---|
| 32 | `session.run` **giữ luồng chính** — tài liệu khai "chạy trong Web Worker", không có Worker nào. Và **mọi con số chất lượng là số của câu đứng một mình**, trong khi sản phẩm nhét cả ô nhập liệu vào một cửa sổ | recall 0,7426 khi câu đứng một mình, **0,6202** khi câu nằm cuối cửa sổ — thủ phạm là vị trí |
| 33 | **Chấm theo câu** thay cho cắt cụt, ngưỡng ghi trước | ship cho văn bản có dấu câu: phủ 100%, P 0,9669 · R 0,7457 (trùng `evaluate.py`) |
| 34 | **Đường lui F2** cho văn bản không dấu câu — đợt đo riêng, có **đối chứng A/A** vì ngưỡng đứng hình của 33 đặt sai | ship: R 0,1553 → 0,7202, P 0,9419 → 0,9671 |
| 35 | **Cache theo cửa sổ** khi sửa bài dài | **trượt** ở kiểu sửa *xoá từ* — code nằm sẵn, **tắt** |
| 36 | "Model chậm" hoá ra là **dán vào không soát** — Lexical không bắn sự kiện `input` | sửa bằng `MutationObserver`; xác nhận trên Facebook |

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
| Gói cài | 95,3 MB thô → **58,6 MB nén** | `package_extension.py` |

**Chưa có số nào đo trong Chrome thật về thời gian hay bộ nhớ.** Đó là việc số 1.

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

### 1. Câu chuyện thời gian — ĐO trong Chrome thật trước, rồi mới chọn cách sửa

Chủ repo hỏi: *"mỗi lần vào một trang mới, người ta phải đợi model nạp xong?"*
**Đúng.** `manifest.json` chèn content script vào `<all_urls>`, và content script gọi
`model.load(...)` ngay khi trang mở: **mỗi trang, mỗi tab, mỗi lần chuyển trang** nạp
78MB model + 14MB wasm và tạo một phiên onnxruntime riêng — kể cả trang không có ô
nhập liệu nào, kể cả khi người dùng không gõ gì.

**Bài học phải mang theo (quyết định 36):** lần trước chủ repo báo "model chậm", phiên
này đưa ra hai giả thuyết hợp lý — nạp lại mỗi trang, rồi phần chấm chậm trên Facebook
— và đã đề xuất cả một kiến trúc offscreen. **Cả hai sai**; thật ra là dán vào không
kích hoạt soát. Nên lần này **không sửa gì trước khi có ba con số**:

| # | đo gì | bằng gì |
|---|---|---|
| A | **thời gian nạp model** trên một tab mới — lần đầu sau khi mở Chrome, và các lần sau | `soatModel` trong chế độ đo |
| B | **RAM mỗi tab** — cùng 3–4 tab, bật và tắt extension | Shift+Esc (Task Manager của Chrome), chụp ảnh |
| C | **dán → gạch chân** trên Facebook khi model đã nạp — localhost ra 607ms | `soatLog` trong chế độ đo |

#### Chế độ đo — có sẵn, TẮT MẶC ĐỊNH

`content/index.js` có công cụ đo ghi `data-soat-*` lên thẻ `<html>` của trang: Console
của content script bị lọc theo ngữ cảnh (đã mất một lượt thử vì thế), còn DOM thì mọi
ngữ cảnh đọc được. **Vì trang nào cũng đọc được các dấu đó — tức phát hiện được người
dùng cài Soát — nó chỉ bật khi đặt cờ tay, và PHẢI GỠ HẲN trước khi nộp store.**

```
Bật:  chrome://extensions → Soát → link "service worker" → Console:
        chrome.storage.local.set({ soatDebug: true })
      rồi F5 trang cần đo.
Đọc:  Console của trang, ngữ cảnh "top":
        ({ ...document.documentElement.dataset })
      soatModel = "san-sang sau Xms"   (thời gian nạp của trang đó)
      soatLog   = 8 lượt chấm gần nhất, tách: input đầu→chấm · tầng luật · model ·
                  số lượt model · câu trúng cache · TỔNG từ input đầu
Tắt:  chrome.storage.local.remove('soatDebug')
```

Facebook hiện cảnh báo "Stop!" khi dán vào Console, và Chrome có thể bắt gõ
`allow pasting` — lệnh đọc ở trên không làm gì ngoài đọc thuộc tính.

#### Hai hướng sửa đã nghĩ tới — CHỌN SAU KHI CÓ SỐ

* **Nạp lười**: chỉ nạp model khi người dùng focus ô soạn thảo đủ điều kiện lần đầu
  trên trang đó. Rẻ, không thêm quyền; trang không gõ gì thì không tốn RAM. Nhưng lần
  gõ đầu mỗi trang vẫn đợi nạp.
* **Offscreen document** (`chrome.offscreen`, MV3): nạp **một lần cho cả trình duyệt**,
  một bản trong bộ nhớ, suy luận **ra khỏi luồng chính của trang** — gốc của mọi con
  số đứng hình trong quyết định 32–35 biến mất. Giá: quyền `offscreen` (sửa chính sách
  riêng tư, mô tả store), văn bản đi qua message nội bộ, và đúng loại thay đổi từng
  giết tầng model hai tuần (quyết định 24) — kiểm trong Chrome thật.

Nếu làm offscreen thì **xếp trước việc số 4**: phần lớn việc số 4 được đo trong kiến
trúc sẽ bị thay.

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

### 2. Xoá blob 311MB khỏi LỊCH SỬ git (CHẶN việc nộp store)

`a8fa30c` đã bỏ theo dõi file ở HEAD, nhưng blob vẫn nằm trong tree của `ef2a49d` và
`4d14d67`, `.git` vẫn **~625 MB**. GitHub từ chối file trên 100MB, mà bước 2 của
`docs/store/nop-store.md` cần repo trên GitHub để có URL chính sách riêng tư.

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --index-filter \
  "git rm --cached --ignore-unmatch extension/models/soat.fp32.onnx.data" \
  -- f2a8679..HEAD
```

Chưa push đi đâu nên an toàn. Tag `backup-before-filter` trỏ vào master trước khi
đụng gì. Chắc chắn rồi thì `git reflog expire --expire=now --all && git gc --prune=now`.

### 3. Nộp Chrome Web Store

Làm theo **[docs/store/nop-store.md](docs/store/nop-store.md)** — 8 bước, cần tài
khoản của chủ repo. **Trước bước 1: gỡ chế độ đo khỏi `content/index.js`**, chạy lại
`python ml/package_extension.py`, rồi thử lại đoạn thử ở việc số 1.

| Thứ | Ở đâu |
|---|---|
| Gói cài | `dist/soat-1.0.0.zip` (58,6 MB) |
| 3 ảnh 1280×800 | `dist/store/*.png` |
| Nội dung từng ô devconsole | `docs/store/listing.md` |
| Chính sách riêng tư | `docs/store/privacy-policy.md` |

Nếu việc số 1 chọn offscreen thì chính sách riêng tư và mô tả phải nói tới quyền mới.

### 4. Sửa bài dài không dấu câu — một lỗi bộ nhớ và hai hướng tối ưu

1. **Lỗi bộ nhớ đang ship — nhỏ, nên làm trước.** Cache theo câu lưu cả bài dài cho
   mọi phiên bản: 60 lần sửa bài 2.000 ký tự không dấu câu giữ 26.460 dòng logit, trần
   400 phiên bản (~536.000 dòng với bài 6.000 ký tự). Chặn theo **số dòng** thay vì số
   mục. Không đổi issue nào.
2. **Ứng viên `F2c`: cửa sổ cắt theo nội dung + cache cửa sổ.** Cache cửa sổ với F2
   trượt vì F2 chỉ tự khớp lại khi **số từ** không đổi — xoá một từ giữa bài 6.000 ký tự
   phải chạy lại 17,2/42,8 cửa sổ; cắt theo nội dung chỉ 2,5/58,4 (quyết định 35). Code
   cache nằm sẵn, tắt. Cửa sổ khác F2 nên issue khác F2: đo lại **cả chất lượng**, và chi
   phí sửa cho **đủ năm kiểu**: thêm cuối, thay, đổi dấu, xoá, chèn.
3. **`ort.env.wasm.proxy = true`** — nếu việc số 1 không chọn offscreen.

Chỉ đáng làm nếu sửa giữa bài dài viết liền là ca người dùng thật gặp. Đọc việc số 1
trước.

### 5. Lớp d/gi/r vẫn còn hai phần ba ca bị bỏ sót

33,9% (v4, ngưỡng phụ âm 0,90). Khoảng 212 ca có nhãn đúng dẫn đầu nhưng dưới p = 0,90
— **phải học**, hạ ngưỡng thêm thì trượt luật chọn (quyết định 29: 0,80 cho F1 cao hơn
nhưng luật ghi trước ưu tiên precision). Sửa bằng cue đã bác: thêm `phần`+`quà` cho
`giành` thì gạch oan `chị dành phần quà cho em` (quyết định 26). Train thêm thì nhớ v4
đã lấy 30 ca của các nhóm phụ âm khác (`l/n` 45,4% → 39,6%) để được 64 ca cho d/gi/r.

### 6. Giảm dung lượng — liên quan trực tiếp tới việc số 1

Model 78MB là thứ phải nạp mỗi trang. Model nhỏ thì nạp nhanh hơn, tốn RAM ít hơn.

- **Cắt vocab**: chỉ 23.669/64.001 token PhoBERT xuất hiện; giữ token gặp ≥20 lần phủ
  99,69% số lượt, model về ~40MB. **Nguy hiểm:** `bpe.js` phải dùng đúng id mới — sai
  id là lỗi hoàn toàn im lặng. Mở rộng `test/bpe.test.mjs` trước khi train.
- **Tải model lúc chạy**: bundle ~14MB, nhưng phá quyết định 10 (không xin
  `host_permissions`) và cần hosting.

---

## Bố cục

```
extension/          MV3, không cần build
  src/engine/       vi.js (âm tiết + 23 nhãn), rules.js, ruleEngine.js,
                    bpe.js (BPE tự viết), onnxEngine.js (tầng 3: chấm theo câu,
                    đường lui F2, cache cửa sổ có sẵn nhưng TẮT)
  src/content/      index.js (điểm vào; MutationObserver cho ô contenteditable;
                    CHẾ ĐỘ ĐO tắt mặc định — gỡ trước khi nộp store),
                    targets.js (lọc ô), highlighter.js, replace.js, tooltip.js
  models/           artifact sinh ra, KHÔNG commit
  vendor/           onnxruntime-web 14MB, tải bằng ml/fetch_vendor.sh
ml/                 vi.py, noise.py, mine_errors.py, build_corpus.py, dataset.py,
                    train.py, export_onnx.py, export_tokenizer.py, encoding.py
  evaluate.py, false_alarm.py, consonant_eval.py, consonant_diagnose.py,
  diagnose.py, sentence_eval.py   — mọi script CHẤM CÂU ĐỨNG MỘT MÌNH
  gate.py           PHÉP QUYẾT ĐỊNH phía Python — đổi ngưỡng thì sửa ở đây và ở
                    onnxEngine.js, không chỗ nào khác
  threshold_report.py, mix_datasets.py, package_extension.py, make_screenshots.py
  test_evaluate.py, test_encoding.py
dev/                playground.html, onnx-test.html, shots.html (ảnh store)
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
docs/decisions.md   36 quyết định
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
