# Bàn giao — dự án Soát

Đọc file này trước, rồi `README.md` (tổng quan) và `docs/decisions.md` (30 quyết
định, kèm lý do và mọi lỗi đã mắc).

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

## Trạng thái: CHẠY ĐƯỢC TRONG CHROME THẬT

- 52 commit, cây git sạch
- 48 test JS + 9 test Python, tất cả pass (`npm run test:all`)
- Đã cài thật vào Chrome, gõ thật trên Facebook, cả bốn tầng đều sống —
  **nhưng lần đó là với model v3.**
- v4 đã chạy qua trình duyệt thật ở `dev/onnx-test.html`
  (`http://localhost:8777`): 4/6 câu mẫu, **0 báo động giả**, mọi
  bất biến pass (đề xuất trong từ điển, offset đúng, không trùng bản gốc). Đây
  là tầng model qua wasm thật, **nhưng qua `http://` chứ không qua
  `chrome-extension://`** — quyết định 24 đã dạy một lần rằng hai đường đó
  khác nhau ở chỗ nạp tài nguyên. Vẫn cần cài thật, xem việc số 1.
- Gói nộp store đã đóng lại với v4, **chưa nộp**

### Số liệu chốt

Model đang ship: `student768_v4`, INT8 per-channel, biên 0,25, ngưỡng **theo
lớp nhãn**: thanh điệu **0,95**, phụ âm **0,90** (`onnxEngine.js`, quyết định 29).

| Thước đo | Số | Đo bằng |
|---|---|---|
| VSEC giữ kín, trong tầm | P **0,9709** · R 0,7457 · F1 0,8436 | `evaluate.py --held-out --threshold 0.95 --margin 0.25` |
| Lỗi phụ âm (1.796 ca) | recall **48,2%** | `consonant_eval.py` |
| riêng lớp `d/gi/r` (596 ca) | recall **33,9%** | `consonant_eval.py` |
| Báo động giả trên văn bản đúng | 1,35% / 1,05% số câu | `false_alarm.py` |
| Độ trễ **trong trình duyệt** (wasm) | nạp 355–585ms · p50 **18–24ms** · p95 23–30ms | `dev/onnx-test.html` |
| Độ trễ onnxruntime Python, 1 luồng | p50 5,5ms · p95 5,7ms | `export_onnx.py` |
| Gói cài | 95,3 MB thô → **58,6 MB nén** | `package_extension.py` |
| **Theo CÂU** — câu sạch hẳn | **39,2%** | `sentence_eval.py` + `dev/sentence-eval.html` |
| **Theo CÂU** — câu sản phẩm KHÔNG ĐỤNG | **49,0%** | nt |

**Bản bàn giao trước ghi "trong trình duyệt · p50 5,4ms · export_onnx.py" —
sai.** 5,4ms là số onnxruntime trên Python; trình duyệt chạy cùng file model qua
wasm và đo được 18–24ms, chậm hơn ba tới bốn lần. Đây đúng là loại lỗi mà cả dự
án này lấy làm luận điểm, mắc thêm một lần nữa ngay trong tài liệu bàn giao.

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

4. Độ trễ ghi thành **khoảng** chứ không một con số: đo bốn lần trên cùng máy
   được 18,4 / 23,1 / 23,8ms. Một con số lẻ là một lần bốc thăm.

5. **`R 0,7457` PHẢI đi kèm mẫu số của nó.** Đó là recall trên phần bộ nhãn biểu
   diễn được, tức 54,5% lỗi VSEC. Nhân ra: `0,7457 x 0,545 = 0,406`, nên tỷ lệ
   lỗi thật sự được sửa là **40,8%**. Không phải lỗi tính toán — `evaluate.py`
   khối C đã báo sẵn con số toàn bộ. Nhưng 0,7457 là con số hay bị trích ra khỏi
   ngữ cảnh nhất, và người đọc CV sẽ hiểu nó là "sửa được 74,6% lỗi tôi mắc".

---

## VIỆC TIẾP THEO — theo thứ tự ưu tiên

### 1. Gõ thử v4 trong Chrome THẬT — ĐÃ LÀM MỘT LẦN, và kết quả là "im lặng"

Chủ repo đã cài v4 vào Chrome và gõ thật trên Facebook:

> chúc **mựng** anh chị đã giành được phần quà **trí** giá 10 triệu **đuồng**

**Extension không gạch gì cả.** Vệt gạch dưới `đuồng` trong ảnh là spellcheck
của Chrome, không phải của sản phẩm này. Mổ ra ở quyết định 28; tóm tắt:

| Chữ | Đúng phải là | Sản phẩm | Vì sao |
|---|---|---|---|
| `mựng` | `mừng` | bỏ sót | p = 0,802, mà đây là nhãn THANH ĐIỆU nên ngưỡng vẫn là 0,95 — quyết định 29 không giúp ca này |
| `trí giá` | `trị giá` | bỏ sót | model không xếp nhãn nào lên đầu |
| `đuồng` | `đồng` | **ngoài tầm vĩnh viễn** | `uô→ô`, ngoài 23 nhãn |
| `giành được` | *(đúng)* | im lặng ✓ | |

**Việc còn lại của mục này** không phải đo tầng model nữa — `dev/onnx-test.html`
đã kiểm nó rồi. Còn lại là ba tầng mà cả `onnx-test.html` lẫn ảnh trên đều chưa
xác nhận được: `targets.js` có chọn đúng ô nhập của Facebook không,
`highlighter.js` vẽ gạch chân có đúng chỗ không, `replace.js` thay chuỗi có an
toàn với React không. Muốn thấy ba tầng đó thì phải gõ một câu mà sản phẩm
**chắc chắn bắt**:

> Hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển.

Tầng luật **cố ý** không bắt câu này, model thì bắt `cứ→cư` ở 100% (đã đo). Nếu
gõ câu đó mà vẫn không thấy gạch chân thì mới là lỗi cài đặt thật.

```
chrome://extensions → Developer mode → Load unpacked → chọn extension/
```

**Đừng dùng `dành được phần quà` để kiểm** — model xếp `dành→giành` ở p = 0,835,
vẫn dưới ngưỡng phụ âm 0,90 sau quyết định 29, nên nó im lặng *đúng theo thiết
kế*. Câu bắt được ở lớp này: *"Rao động về hình dáng từ cây bụi rậm rạp..."*
— `Rao→Dao` ở 92,7%, im lặng dưới cấu hình cũ và báo dưới cấu hình mới.

**Nhớ cache:** trình duyệt phục vụ lại cả file `.onnx`. Thay model rồi mà kết
quả giống hệt bản cũ thì nghi cache trước, đừng nghi logic. Bấm Reload ở
`chrome://extensions` và hard-reload trang.

**Và bài học chung từ lần gõ thử này đã thành một phép đo** (quyết định 30):
ba trong bốn chữ sai của câu đó sản phẩm không đụng tới, và đó không phải ca cá
biệt. `sentence_eval.py` chấm theo CÂU thay vì theo lỗi: **49,0% số câu có lỗi thì
sản phẩm im lặng hoàn toàn**, chỉ 39,2% sạch hẳn. Một nửa.

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
| Gói cài | `dist/soat-1.0.0.zip` (58,6 MB, đã đóng lại với v4) |
| 3 ảnh 1280×800 | `dist/store/*.png` |
| Nội dung từng ô devconsole | `docs/store/listing.md` |
| Chính sách riêng tư | `docs/store/privacy-policy.md` |
| Trang giới thiệu | `docs/store/landing.html` |

Sinh lại: `python ml/package_extension.py` và `python ml/make_screenshots.py`
(cả hai neo đường dẫn theo vị trí file, đứng đâu chạy cũng được).

### 4. ĐÃ XONG — ngưỡng riêng cho lớp phụ âm (quyết định 29)

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

### 5. Lớp d/gi/r vẫn còn hai phần ba ca bị bỏ sót

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
lý do việc số 4 đáng làm trước, và nó đã thu được **32 ca** trong ô đó (quyết
định 29). Phần còn lại của ô này — khoảng 212 ca dưới p = 0,90 — **phải học**,
hạ ngưỡng thêm nữa thì trượt luật chọn.

**Đã thử và loại bỏ hướng sửa bằng cue** (quyết định 26): thêm `phần`+`quà` vào
nhóm cue của `giành` thì bắt được câu trên, nhưng câu **đúng** `chị dành phần
quà cho em` bị gạch oan. Đây là việc của model, không phải của luật.

**Nếu train thêm:** đẩy d/gi/r cao hơn 7,42% thì phải biết mình đang lấy của
ai. v4 đã lấy 30 ca của năm nhóm phụ âm còn lại (`l/n` 45,4%→39,6% là nặng
nhất) để được thêm 64 ca cho d/gi/r. Lấy nữa thì các nhóm kia tụt nữa.

### 6. Giảm dung lượng — đã đo, chưa làm

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
                    bpe.js (BPE tự viết), onnxEngine.js (tầng 3, ngưỡng 0,95)
  src/content/      targets.js (lọc ô), highlighter.js, replace.js, tooltip.js
  models/           artifact sinh ra, KHÔNG commit
  vendor/           onnxruntime-web 14MB, tải bằng ml/fetch_vendor.sh
ml/                 vi.py (bản song song vi.js), noise.py, mine_errors.py,
                    build_corpus.py, dataset.py, train.py,
                    export_onnx.py, export_tokenizer.py, encoding.py
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
docs/decisions.md   30 quyết định
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

## Mười một điều dễ vấp — đều đã mắc ít nhất một lần

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
