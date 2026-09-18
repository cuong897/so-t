# Soát

Sửa lỗi **dấu tiếng Việt** ngay trong ô nhập liệu, **chạy hoàn toàn trên máy
người dùng**. Không server, không API, không một ký tự nào rời khỏi trình duyệt.

Phạm vi là mọi lỗi ở mức **âm tiết**: thiếu dấu, sai dấu, và nhầm phụ âm đầu.
Phân bố đo được trên VSEC — 10.845 lỗi do người thật mắc:

| Lớp lỗi | Tỷ lệ thật |
|---|---|
| Sai dấu (đặt nhầm sang thanh khác) | 43,6% |
| Mất dấu hoàn toàn | 43,2% |
| Hỏi ↔ ngã | 4,7% |
| Phụ âm đầu và âm cuối (`ch/tr`, `s/x`, `d/gi/r`, `n/ng`) | 8,5% |

Phần **khó nhất** — và là lý do bài này cần mô hình ngôn ngữ chứ không phải một
danh sách từ — là cặp đồng âm mà **cả hai dạng đều là từ đúng**. Từ điển và
Hunspell bó tay hoàn toàn ở đây:

| Người viết | Đúng phải là | Vì sao từ điển vô dụng |
|---|---|---|
| hộp **sửa** tươi | hộp **sữa** tươi | `sửa` và `sữa` đều là từ có thật |
| **dành** chiến thắng | **giành** chiến thắng | `dành` và `giành` đều đúng |
| đọc **chuyện** tranh | đọc **truyện** tranh | `chuyện` và `truyện` đều đúng |
| **nổ** lực | **nỗ** lực | `nổ` là từ có thật (phát nổ) |

Tên đúng của lớp bài toán đó là **contextual homophone disambiguation**. Nó chỉ
chiếm phần nhỏ về số lượng nhưng là phần duy nhất không công cụ nào khác làm
được — nên nó là điểm khác biệt, còn sửa dấu nói chung mới là khối lượng công
việc.

Và đây là mức làm được thật, đo trong trình duyệt trên bản đang ship, ở chính
cặp câu khó nhất của lớp `d/gi/r` — hai câu gần như trùng nhau, một câu sai một
câu đúng:

| Câu | Model xếp | Ở ngưỡng phụ âm 0,90 |
|---|---|---|
| Chúc mừng anh đã **dành** được phần quà. | `dành→giành` **p = 0,835** | chưa báo |
| Chị **dành** phần quà cho em. *(đúng)* | không nhãn nào | không báo ✓ |

Đó là **phân biệt đúng** — cùng chữ `dành`, cùng cụm `phần quà`, hai kết luận
khác nhau. Tầng luật không làm được: thêm cue `phần`+`quà` cho `giành` thì bắt
được câu trên nhưng gạch oan câu dưới (quyết định 26). Model làm được, chỉ chưa
đủ tự tin để vượt ngưỡng — nên hiện tại nó **im lặng ở cả hai câu**.

Quyết định 29 đã hạ ngưỡng lớp phụ âm từ 0,95 xuống **0,90** vì chính lý do đó, và
nó ăn thêm 4,8 điểm recall phụ âm. Nhưng **ca này vẫn chưa bắt được**: 0,835 vẫn
dưới 0,90. Phải xuống 0,80 mới bắt, mà mức đó trượt luật chọn đã ghi trước.

---

## Kiến trúc — bốn tầng

```
văn bản  ─►  ① tra từ điển   ─►  ② sinh ứng viên  ─►  ③ chấm ngữ cảnh  ─►  ④ lọc & ngưỡng  ─►  gạch chân
              0,05ms, JS          <0,01ms            ~20ms, ONNX INT8     <0,01ms
              ——— trong trang ———                    ——— trong offscreen document ———
```

**Model không nằm trong trang.** Tầng ① ② chạy ngay trong content script của tab và vẽ
gạch chân tức thì; tầng ③ ④ chạy trong một **offscreen document** — một trang ẩn của
chính extension — bên trong một Web Worker, **một bản duy nhất cho cả trình duyệt**,
dựng lần đầu khi người dùng focus vào một ô đủ điều kiện. Trang gửi văn bản của ô qua
message nội bộ của extension và nhận lại đúng mảng `Issue`.

Lý do là số đo, không phải sở thích (quyết định 37 và 38, đo trong Chrome thật):

| | model nạp trong mỗi tab | model trong offscreen |
|---|---|---|
| bộ nhớ thêm **mỗi tab** | **279 MB** | **1,8 MB** |
| 8 tab | +2,2 GB | +320 MB |
| long task trên trang lúc mở | 150 ms | **0** |
| long task trên trang lúc chấm | 53–135 ms | **0** |
| dán → gạch chân, cache ấm | mốc | +4…+10 ms |

Con số ở ①+② đo bằng `dev/bench-rules.html` trên một bài đăng 280 ký tự, văn bản
người thật lấy từ VSEC. **Tầng luật nhanh hơn tầng model khoảng 400 lần**, và
tăng tuyến tính theo độ dài văn bản chứ không theo số lỗi:

| Độ dài | `checkText` p50 | cả cụm đồng bộ p50 |
|---|---|---|
| 80 ký tự — một câu | 0,014ms | 0,025ms |
| 280 ký tự — bài đăng ngắn | **0,048ms** | 0,087ms |
| 700 ký tự — bài đăng dài | 0,124ms | 0,130ms |
| 2.000 ký tự | 0,359ms | 0,367ms |
| 6.000 ký tự — dán cả bài | 1,09ms | 1,12ms |

"Cả cụm" là `collectTextNodes + checkText + paint` — đúng ba thứ `run()` chạy
**đồng bộ trên luồng chính**. `paint` tốn ~0,5µs mỗi lỗi, nên 180 lỗi cùng lúc cũng
chỉ 0,09ms. Ngân sách một khung hình 60fps là 16,7ms — tầng luật dùng hết 0,5%
của nó ở cỡ bài đăng bình thường.

*(Một lưu ý về cách đo: `performance.now()` trong trình duyệt bị làm tròn tới
~0,1ms để chống Spectre. Bấm giờ từng lần gọi cho ra toàn `0.000` và `0.100` — sàn
đồng hồ, không phải số thật. Bảng trên bấm giờ theo LÔ rồi chia.)*

**① + ②  Tầng luật** (`extension/src/engine/`) — 137 luật cụm sai tuyệt đối và
20 cặp đồng âm quyết định bằng **cue có hướng**. Chạy được ngay, không cần model.

**③  Tầng model** (`ml/`) — điểm kiến trúc quan trọng nhất:

> Model **không dự đoán từ**. Nó dự đoán một nhãn trong **23 nhãn cố định**
> (`KEEP`, 6 nhãn đặt-thanh, 12 nhãn phụ âm đầu, 4 nhãn âm cuối), mỗi nhãn là
> một phép biến đổi chuỗi xác định.

Hệ quả: không gian đầu ra 23 thay vì 75.000 âm tiết → head bé, model nhẹ, chạy
được trong trình duyệt; tổng quát hoá sang từ chưa gặp lúc train; và **về mặt
cấu trúc không thể bịa** — model không có khả năng sinh ra từ nằm ngoài tập ứng
viên do tầng ② dựng sẵn.

Bộ nhãn được **chọn bằng số đo, không bằng cảm tính**. Đo trên VSEC (10.845 cặp
lỗi thật): bản đầu chỉ có hỏi↔ngã phủ được 7,6%; thay bằng 6 nhãn "đặt thanh
thành X" phủ 49,7%; cộng phụ âm và âm cuối thành **54,5%**. Bốn nhãn thêm vào
đổi lấy gấp bảy lần coverage.

**④  Ngưỡng** — nguyên tắc xuyên suốt: **thà bỏ sót còn hơn báo sai**. Gạch chân
nhầm một lần là người dùng gỡ cài; bỏ sót thì họ không biết.

---

## Chạy thử

```bash
npm run test:all  # 63 test JS + 10 kiểm tra Python
npm run dev       # rồi mở hai trang dưới đây
```

| Trang | Kiểm chứng gì |
|---|---|
| `dev/playground.html` | Tầng DOM — gạch chân và thay chuỗi trong trình duyệt thật, không cần cài extension |
| `dev/onnx-test.html` | Đường ONNX — nạp runtime, mã hoá BPE, suy luận, chặn theo tập ứng viên |
| `dev/bench-rules.html` | Độ trễ tầng luật — bấm giờ theo lô, văn bản người thật |
| `dev/sentence-eval.html` | Chấm theo CÂU với **cả hai tầng** — phần mà `sentence_eval.py` không chạy được vì tầng luật là JS |
| `dev/harness-content.html` | Nạp nguyên `content/index.js` với `chrome.*` giả lập — kiểm đường **dán** vào ô soạn thảo (quyết định 36) |
| `dev/bench-accept.html` | Tám điều kiện của quyết định 33, đo qua đúng `check()` — chất lượng trên bài đăng, phủ, đứng hình, cache |
| `dev/bench-fallback.html` | Quyết định 34 — đường lui cho văn bản không dấu câu, đứng hình so bản cũ cùng lượt, kèm đối chứng A/A |
| `dev/bench-blocking.html` | Tầng model có giữ luồng chính không — nhịp đập MessageChannel, không dùng rAF |
| `dev/measure-chrome.mjs` | Chạy bằng `node`, không qua trang: lái **Chrome đã cài** (headless) nạp gói store thật, đo nạp model, đứng hình, **RAM mỗi tab** và dán → gạch chân. `--plan 37` so có/không extension; `--plan 38` so bản trước offscreen với bản offscreen, chấm tám điều kiện ghi trước |
| `dev/lexical-check.mjs` | Gói store thật trên **Lexical thật** (`playground.lexical.dev`) — dán bằng sự kiện `paste`, kiểm gạch `cứ` còn sống sau khi Lexical dựng lại DOM; `--idle 300` để thử sau khi service worker bị tắt |
| `ml/trim_vocab.py` | Cắt vocab (quyết định 41): giữ token từng xuất hiện lúc train, cắt embedding, đánh số lại id — **không train lại** |
| `dev/bench-cachecap.mjs` | Chạy bằng `node`, session giả: trần cache theo **số dòng logit** — bốn kịch bản × 60 lần sửa xoay đủ năm kiểu, chấm ba điều kiện của quyết định 39 |
| `dev/bench-context.html` | Cùng một câu, đứng một mình và nằm trong cửa sổ — nhãn vàng, so có cặp |

Trước khi dùng `onnx-test.html` phải có runtime và model:

```bash
bash ml/fetch_vendor.sh                 # onnxruntime-web 14MB -> extension/vendor/
cd ml && python export_tokenizer.py     # tokenizer.json + lexicon.json
```

Cài extension: Chrome → `chrome://extensions` → bật *Developer mode* →
*Load unpacked* → chọn thư mục `extension/`.

**Lưu ý dung lượng:** runtime 14MB + model 75MB ≈ **91MB**, đủ lớn để ảnh hưởng
tỷ lệ cài đặt. Hai hướng giảm, đã đo nhưng chưa làm:

- **Cắt vocab** — chỉ 23.669/64.001 token PhoBERT thực sự xuất hiện. Giữ token
  gặp ≥20 lần phủ 99,69% số lượt, embedding giảm 49,2M→11,9M, model về ~40MB.
- **Tải model lúc chạy** — MV3 cấm nạp *code* từ xa nhưng không cấm nạp *dữ
  liệu*, nên bundle có thể về ~14MB.

---

## Huấn luyện

```bash
cd ml && pip install -r requirements.txt

python build_corpus.py                  # 400k câu sạch từ Wikipedia tiếng Việt
python dataset.py --corpus data/corpus.txt --out data --variants 2
python train.py   --data data --out out/teacher --epochs 2
python train.py   --data data --out out/student768 --teacher out/teacher \
                  --layers 4 --hidden 768 --epochs 3 --workers 4
python evaluate.py --model out/student768/best --held-out --limit 1500
python export_tokenizer.py
python export_onnx.py --model out/student768/best --out ../extension/models --name soat
```

Bốn lệnh trên ra **bản v1**. Bản đang ship là `student768_v4`, thêm hai vòng
fine-tune cân lại lớp phụ âm (quyết định 26 và 27) — không có hai vòng này thì
`d/gi/r`, ví dụ đầu bảng của README, chỉ đạt recall 6,2%:

```bash
# tập bổ sung: một tập nặng phụ âm nói chung, một tập nhắm riêng d/gi/r.
# --seed 13 là BẮT BUỘC: dataset.py dùng cùng seed đó để chia train/dev/test,
# đổi seed là đổi phép chia và câu trong test.jsonl có thể lọt sang train.
python dataset.py --corpus data/corpus.txt --out data_cons --variants 1 \
  --class-weights data/class_weights_consonant.json --seed 13
python dataset.py --corpus data/corpus.txt --out data_dgir --variants 1 \
  --class-weights data/class_weights_dgir.json --seed 13

python mix_datasets.py --pool data:304356 --pool data_cons:45389 \
  --pool data_dgir:50255 --out data_ft_dgir --seed 13

python train.py --data data_ft_dgir --out out/student768_v4 \
  --model out/student768 --epochs 2 --batch 32 --workers 4 --select f1
python export_onnx.py --model out/student768_v4/best --out ../extension/models --name soat
```

`mix_datasets.py` in ra phân bố **đo được** của tập đã trộn, và phải đọc con số
đó chứ không đọc file cấu hình: trọng số lớp trong `noise.py` là **chặn trên**,
vì nó chỉ bốc trong những lớp có mặt ở câu đang xét. Cấu hình `d/gi/r` 80% chỉ
ra 47% thật.

`train.py` giữ **hai** bản: `<out>` là epoch cuối (để `--resume` còn khớp với
optimizer và scheduler đã cất), `<out>/best` là epoch tốt nhất trên dev theo
`--select` (mặc định `f1`). Bản `best` là bản đem đi xuất ONNX — nhưng nó được
xếp hạng bằng **dev tự sinh**, thứ đã ba lần nói dối trong dự án này, nên phải
chấm lại trên VSEC giữ kín trước khi ship. `<out>/epochs.json` ghi số đo từng
epoch để biết các epoch có sát nhau không.

Tải VSEC (dùng cho `evaluate.py`) một lần:

```bash
curl -sL -o ml/data/raw/VSEC.jsonl https://raw.githubusercontent.com/VSEC2021/VSEC/main/Dataset/VSEC.jsonl
```

Dữ liệu train là **miễn phí và vô hạn**: corpus sạch + bộ sinh lỗi = cặp
(sai, đúng), không tốn một đồng gán nhãn.

### Cái bẫy trong việc sinh dữ liệu

Nếu đảo hỏi↔ngã **ngẫu nhiên đều** thì model học một phân bố lỗi không giống
đời thật — người Việt sai `nỗ lực` liên tục nhưng gần như không bao giờ sai
`mỹ`. Model train trên nhiễu đều sẽ vừa bỏ sót lỗi thật vừa báo động giả ở chỗ
chẳng ai sai.

`mine_errors.py` đo phân bố đó từ dữ liệu người gán nhãn rồi ghi ra
`class_weights.json` (tỷ trọng từng lớp lỗi) và `propensity.json` (từ nào hay bị
viết sai). `noise.py` nạp cả hai; thiếu thì lùi về bảng ước lượng và nói rõ.

**Cái giá của việc đoán thay vì đo, đo được bằng số:** bản train đầu dùng trọng
số tôi tự ước lượng đạt F1 0,929 trên dev tự sinh nhưng chỉ **0,732** trên lỗi
người thật. Hai mươi điểm bốc hơi. Đo lại thì thấy ước lượng lệch rất xa —
`hoi_nga` đoán 31,5% nhưng thực tế 4,7%, `other_tone` đoán 9,3% nhưng thực tế
43,6%.

**Và phải tránh tự lừa mình:** rút phân bố từ VSEC rồi chấm trên chính VSEC là
vô nghĩa. `mine_errors.py` chia đôi VSEC bằng hàm băm tất định — một nửa để rút,
một nửa giữ kín; `evaluate.py --held-out` chấm trên đúng nửa giữ kín.

Phân bố thu được là thứ phải **đo**, không phải thứ tự tin là đã cấu hình đúng —
riêng chỗ này đã sai hai lần trước khi đúng (xem `docs/decisions.md`, quyết định
5 và 12). Lỗi cuối cùng tinh vi nhất: phải bốc **lớp lỗi trước** rồi mới bốc
token, vì bốc token trước thì phân bố bị chi phối bởi lớp nào *tình cờ* có sẵn ở
token nào — âm tiết nào cũng mất dấu được, nhưng chỉ âm tiết bắt đầu bằng
l/n/ch/tr/s/x mới có lỗi phụ âm.

---

## Số liệu

### Bản đang ship — đo ở ĐÚNG ngưỡng sản phẩm

`student768_v4`, INT8 per-channel, biên **0,25**, và ngưỡng **theo lớp nhãn**:
thanh điệu **0,95**, phụ âm **0,90** (quyết định 29). Đây là những con số người
dùng thật sự gặp — **với một điều kiện phải đọc trước bảng**:

> Mọi phép đo chất lượng dưới đây chấm **từng câu đứng một mình**. Cho tới
> `cf6ad59`, sản phẩm lại nhét **cả ô nhập liệu** vào một lượt chạy, và từ nằm sâu
> trong cửa sổ bị chấm tệ hơn hẳn: recall 0,7426 khi câu đứng một mình, 0,6202
> khi câu nằm cuối cửa sổ (quyết định 32). Giờ sản phẩm chấm theo câu, nên trên
> **văn bản có dấu câu** các con số này là thật — đo lại qua đúng `check()` trên
> bài đăng dựng sẵn ra recall 0,7457, trùng tới số lẻ thứ tư (quyết định 33).
> **Văn bản không có dấu câu** đi đường lui F2 — cửa sổ trượt 64 subword — và
> kém hơn một chút: recall 0,7202, precision 0,9671 (quyết định 34).

| Thước đo | Số | Đo bằng |
|---|---|---|
| VSEC giữ kín, trong tầm | P **0,9709** · R 0,7457 · F1 **0,8436** | `evaluate.py --held-out --threshold 0.95 --margin 0.25` |
| Lỗi phụ âm (1.796 ca) | recall **48,2%** | `consonant_eval.py` |
| riêng lớp `d/gi/r` (596 ca) | recall **33,9%** | `consonant_eval.py` |
| Báo động giả trên văn bản đúng | **1,35%** / **1,05%** số câu | `false_alarm.py --limit 2000` |
| Độ trễ **trong trình duyệt** (wasm) | nạp 355–585ms · một câu **20–27ms** · bài 2.000 ký tự **525–600ms** tổng, đứng hình ≤ **82ms** | `dev/bench-accept.html` |
| Độ trễ onnxruntime Python, 1 luồng | p50 5,5ms · p95 5,7ms | `export_onnx.py` |
| Gói cài | 63,1 MB thô → **40,0 MB nén** | `package_extension.py` |

Độ trễ ghi thành **khoảng** chứ không một con số: đo lại bốn lần trên cùng máy
được 18,4 / 23,1 / 23,8ms. Một con số lẻ là một lần bốc thăm.

Các con số đứng hình dưới đây đo **bản trước offscreen**, khi `session.run` chạy
trên luồng chính của trang (quyết định 32). Từ quyết định 38, suy luận nằm trong Worker
của offscreen document: cột "đứng hình" **không còn rơi vào trang nào** — đo trong Chrome
thật, 12/12 tab không có long task nào lúc mở trang lẫn lúc chấm. Giữ bảng lại vì nó vẫn
là hình dạng chi phí CPU của một lượt chấm, và vì cột "model xét" là chuyện của quyết
định 33, không phải của offscreen:

| Độ dài, có dấu câu | tổng CPU | **đứng hình lâu nhất** | model xét | bản cắt cụt trước đây xét |
|---|---|---|---|---|
| 280 ký tự — bài đăng ngắn | 62–90ms | 38–65ms | 100% | 100% |
| 700 ký tự — bài đăng dài | 177–223ms | 48–56ms | 100% | **58%** |
| 2.000 ký tự | 525–600ms | 82ms | 100% | **20%** |
| 6.000 ký tự — dán cả bài | 1.357–1.751ms | 55–78ms | 100% | **7%** |

Đo bằng `dev/bench-accept.html`, hai lượt. Tổng tăng theo độ dài vì giờ model đọc
**hết** bài; đứng hình thì không tăng, vì mỗi câu một lượt và luồng được nhả giữa
hai lượt. Sửa một câu trong bài 6.000 ký tự đã chấm xong chỉ chạy lại câu đó:
32–36ms.

**Văn bản không dấu câu** (quyết định 34) cũng được đọc hết, bằng cửa sổ trượt
64 subword bước 32. So với bản cắt cụt đo **cùng lượt, cùng 40 văn bản mỗi cỡ**,
đứng hình p90 ra x0,75–1,09 — không tệ hơn, và từ 700 ký tự trở lên thì ít hơn,
vì mỗi lượt chạy ngắn hơn. Nhưng sửa một chữ ở đó là chấm lại cả bài: cả bài là
một "câu" nên cache theo câu không trúng.

Hai giới hạn phải nói cạnh các con số này:

* **Một lượt `session.run` dao động gấp đôi trên cùng một văn bản** (48–94ms), nên
  đỉnh đứng hình là một khoảng, không phải một con số. "Lâu nhất" của chính bản
  cắt cụt cũ ra 101–156ms. So hai cấu hình thì so p50/p90 **đo cùng lượt**, và đối
  chứng A/A cho thấy chênh dưới ~25% ở p50 là không phân biệt được.
* Model **giữ luồng của nơi nó chạy**. Nhả luồng giữa các lượt chỉ chia nhỏ việc chặn,
  không bỏ được nó — nhưng từ quyết định 38, nơi đó là Worker của offscreen chứ không
  còn là trang người dùng đang đọc.

Phân rã một lượt `check()`: `session.run` chiếm **98,8%**, `bpe.js` 0,2%, giải mã
1,0%. Không có gì để tối ưu ngoài chính model. Lượt suy luận **đầu tiên 55–126ms**,
rơi đúng lúc người dùng gõ câu đầu.

### Và con số người dùng thật sự sống cùng: chấm theo CÂU

Bảng trên chấm theo **lỗi**. Người dùng không sống theo đơn vị lỗi — họ gõ một
**câu** rồi nhìn. `sentence_eval.py` chia 1.483 câu VSEC giữ kín có lỗi thành
năm rổ (`dev/sentence-eval.html` chạy lại cùng phép đo với **cả hai tầng**):

| Kết cục | Tầng model | Cả hai tầng |
|---|---|---|
| SẠCH HẲN | 38,8% | **39,2%** |
| Hết phần trong tầm | 3,1% | 3,0% |
| Sửa một phần | 1,1% | 1,3% |
| **KHÔNG ĐỤNG** | 49,8% | **49,0%** |
| CÓ SỬA SAI | 7,1% | 7,6% |

**Một nửa số câu có lỗi thì sản phẩm im lặng hoàn toàn.** Đó là con số phải nói
cạnh mọi con số recall, vì nó mới là thứ người dùng gặp.

Bảng này đo từng câu đứng một mình. Trước `cf6ad59` nó **đẹp hơn** thứ người dùng
gặp trong một bài đăng nhiều câu; giờ sản phẩm chấm theo câu nên nó khớp — trên
văn bản có dấu câu.

Và phải đọc `0,7457` kèm mẫu số của nó: đó là recall trên **phần bộ nhãn biểu
diễn được**, tức 54,5% lỗi VSEC. Nhân ra thì tỷ lệ lỗi thật sự được sửa là
**40,8%**. Hai con số cùng một model, nhưng "74,6%" và "40,8%" tạo ấn tượng rất
khác nhau — và người đọc sẽ hiểu theo nghĩa thứ hai.

**Hai dòng độ trễ chênh nhau hơn ba lần, và đó là chỗ dễ báo cáo sai.**
`export_onnx.py` đo bằng onnxruntime trên Python; trình duyệt chạy cùng file
model qua **wasm**, chậm hơn hẳn. Con số người dùng thấy là dòng trên (18,4ms).
Bản bàn giao trước ghi "trong trình duyệt p50 5,4ms" — đó là số của Python bị
gán nhãn sai, và cũng là đúng loại lỗi mà cả README này nói về.

*(Đo qua `http://localhost`, không phải `chrome-extension://`. Với **độ trễ**
hai đường tương đương vì cùng file wasm và cùng model; với **việc nạp được tài
nguyên hay không** thì không tương đương — xem quyết định 24.)*

### So sánh kiến trúc và lượng tử hoá — đo bằng argmax, KHÔNG ngưỡng

Bảng dưới trả lời một câu hỏi khác: chọn kích thước model và kiểu lượng tử hoá
nào. Nó đo bằng **argmax không ngưỡng**, tức **năng lực thô** chứ không phải
thứ người dùng thấy, và bốn dòng đầu đo trên **đợt train v1** — trước hai lần
cân lại lớp phụ âm (quyết định 26 và 27). Giữ lại vì so sánh kiến trúc vẫn đúng;
đừng đọc nó như số của bản đang ship.

| Model | Tham số | MB | P | R | F1 |
|---|---|---|---|---|---|
| Teacher fp32 | 134,4M | 539,4 | 0,9169 | 0,8691 | **0,8924** |
| 768 fp32 | 77,7M | 311,5 | 0,8966 | 0,8574 | 0,8766 |
| 768 INT8 per-channel | 77,7M | **78,5** | **0,9126** | 0,8330 | 0,8710 |
| 384 INT8 | 31,8M | 32,4 | 0,8378 | 0,7309 | 0,7807 |
| *768 INT8, đợt train v4 ← đang ship* | 77,7M | 78,5 | 0,8883 | **0,8543** | 0,8709 |

**INT8 làm precision TĂNG** (0,8966 → 0,9126) chứ không phải cái giá phải trả:
lượng tử hoá cắt đi những dự đoán ở vùng ranh giới, vốn phần lớn là sai.

Và dòng cuối là một ví dụ sạch cho luận điểm của cả dự án này. **Đo bằng argmax
thì v4 và v1 gần như không phân biệt được**: F1 0,8709 so với 0,8710, chênh một
phần mười nghìn. Một phép đo hoàn toàn đúng, và hoàn toàn vô dụng cho việc phải
quyết — vì nó ẩn mất chuyện hai model đó *lệch về hai phía khác nhau* (v1 nghiêng
precision 0,9126/0,8330, v4 nghiêng recall 0,8883/0,8543), và cái ngưỡng 0,95
của sản phẩm đối xử với hai kiểu lệch đó rất khác nhau.

Ở ngưỡng sản phẩm, v4 hơn **v3** ở cả sáu thước đo (quyết định 27). So với
**v1** thì vẫn là một đánh đổi chứ không phải thắng sạch: precision 0,9709 so
với 0,9550, nhưng recall 0,7457 so với 0,7670 — đổi 2,1 điểm recall lấy 1,6
điểm precision, cộng với recall phụ âm 25,7% → **48,2%**.

Còn thiếu — và là nhóm khó bịa nhất: **tỷ lệ chấp nhận gợi ý**, retention
D1/D7/D30, tỷ lệ gỡ cài. Extension đã đếm sẵn, chỉ chờ người dùng thật.

### Báo động giả trên văn bản viết đúng

Bảng so sánh kiến trúc ở trên đo trên câu **có sẵn lỗi**, bằng **argmax không
ngưỡng**. Người dùng thì sống với câu hỏi ngược lại: *tôi viết đúng, bao lâu một
lần thì nó gạch chân oan?* `false_alarm.py` dựng lại đúng phép quyết định của
`onnxEngine.js` (thanh điệu p ≥ 0,95, phụ âm p ≥ 0,90, và hơn KEEP ≥ 0,25) rồi
chạy trên 2.000 câu **không có lỗi**, hai nguồn khác miền:

| Nguồn | Đang ship | v4 @0,95 chung | v3 | v1 |
|---|---|---|---|---|
| Wikipedia sạch (chưa từng train) | **1,35%** số câu | 1,30% | 1,45% | 1,25% |
| VSEC nửa giữ kín, câu đã sửa đúng | **1,05%** số câu | 1,00% | 1,25% | 1,30% |

Khoảng **một câu trong 74–95**. Nhưng con số máy đếm là **chặn trên**, không
phải sự thật: đọc tay 54 lần gạch chân của bản trước thì **26% số "báo động
giả" hoá ra là model bắt đúng lỗi thật trong văn bản được coi là sạch**
(`cứ trú`→`cư trú`, `nỗi danh`→`nổi danh`) — tỷ lệ oan thật khoảng **0,75%**.
Cả 54 ca để nguyên ngữ cảnh trong
[docs/false_alarm_review.md](docs/false_alarm_review.md).

Danh sách của bản đang ship cũng vậy: ở Wikipedia có `cứ`→`cư`, `vât`→`vật`,
`trỗ`→`chỗ`, `dộng`→`rộng` — đều là lỗi thật trong văn bản "sạch".
**Phần đọc tay chưa làm lại cho v4**, nên 0,75% là số của bản trước, không phải
số của bản này.

**Ngưỡng mua được gì:** với chính model đang ship, ngưỡng sản phẩm đổi argmax
P 0,8883 · R 0,8543 thành P **0,9709** · R **0,7457**. Trả 10,9 điểm recall để
lấy 8,3 điểm precision — và cặp sau mới là cặp người dùng thấy.
`evaluate.py` **mặc định chấm bằng argmax không ngưỡng**; quên hai cờ
`--threshold/--margin` là đo một đường mà sản phẩm không đi qua.

**Và nâng ngưỡng không phải cách sửa:** đo trên bản per-tensor @0,90, trung vị
độ tin cậy của các ca oan là **0,981**, 12/31 ca ở p ≥ 0,99 — model **tự tin
khi sai**, nên vặn ngưỡng lên chỉ cắt đúng phần đang làm việc tốt. Vặn lên 0,99
thì báo oan còn 0,60% mà recall rơi xuống 0,5862. Chỗ oan tập trung ở tên riêng,
thuật ngữ chuyên ngành và từ thường gặp trong ngữ cảnh lạ — tức chỗ **cả hai
dạng đều là từ thật**, đúng nơi từ điển bó tay.

```bash
cd ml
python false_alarm.py --onnx ../extension/models/soat.int8.onnx \
  --tokenizer out/student768_v4/best --limit 2000
python evaluate.py --onnx ../extension/models/soat.int8.onnx \
  --tokenizer out/student768_v4/best --held-out --limit 1500 \
  --threshold 0.95 --margin 0.25
```

### Đo phân bố lỗi thật đáng +9,2 điểm F1

Ablation sạch: cùng checkpoint epoch 0, cùng lệnh, cùng 1.500 câu VSEC giữ kín.
Khác đúng một thứ — trọng số lớp lỗi là **đoán** hay **đo**.

| Trong tầm | Đoán | Đo | Chênh |
|---|---|---|---|
| Precision | 0,8652 | **0,8953** | +3,0 |
| Recall | 0,6830 | **0,8191** | **+13,6** |
| F1 | 0,7634 | **0,8556** | **+9,2** |

Precision **cũng** tăng chứ không phải đánh đổi lấy recall — tức model học được
thứ đúng hơn, không phải chỉ trở nên mạnh dạn hơn.

### Benchmark tự sinh nói dối nhiều hơn cho model tệ hơn

| Đo trên | Đoán | Đo | |
|---|---|---|---|
| Dev tự sinh | 0,9288 | 0,9065 | **−2,2** |
| VSEC thật, giữ kín | 0,7634 | 0,8556 | **+9,2** |

Trên dev tự sinh, model mới **tệ hơn**. Trên lỗi người thật, nó **tốt hơn rõ
rệt**. Chỉ nhìn dev tự sinh thì sẽ kết luận ngược hoàn toàn và vứt đúng thay đổi
cần giữ.

Đây là lý do bắt buộc phải có một tập gán nhãn tay, tách riêng, **không bao giờ
đụng tới khi tinh chỉnh** — và là lý do `mine_errors.py` chia đôi VSEC.

**So với VSEC phải nói rõ phạm vi, không được lặng lẽ chọn con số đẹp.** Bộ nhãn
chỉ biểu diễn được 54,5% số lỗi trong VSEC; 45,5% còn lại là chèn/xoá ký tự
(`tranhh`→`tranh`) và đổi phẩm chất nguyên âm (`bức`→`bước`). VSEC nặng về lỗi
**gõ phím**, sản phẩm này nhắm lỗi **kiến thức** — người không biết hỏi hay ngã.
`evaluate.py` vì vậy in riêng khối "trong tầm" và khối "toàn bộ".

Tỷ lệ chấp nhận gợi ý vừa là chỉ số sản phẩm vừa **chính là precision ngoài đời
thật** của model. Một con số, hai mục đích.

Khi báo cáo hiệu năng, **luôn kèm cái đánh đổi**: *"INT8: 135MB→34MB, p95
340ms→62ms, F1 0.940→0.928 — chấp nhận mất 1.2 điểm F1 vì dưới 100ms là ngưỡng
người dùng cảm nhận được, còn 1.2 điểm F1 thì không."*

---

## Quyền riêng tư

Extension **không gửi nội dung người dùng gõ đi bất cứ đâu**. Đây vừa là kiến
trúc vừa là lời hứa với người dùng, nên hai ràng buộc sau là bất di bất dịch:

- `background.js` **chỉ đếm** — số lỗi theo nhóm, theo tuần. Không câu văn,
  không tên miền, không thời điểm chính xác.
- Văn bản có đi từ trang sang **offscreen document của chính extension** (quyết định 38).
  Nó không rời khỏi trình duyệt, nhưng chính sách riêng tư phải **nói ra** chặng đó —
  "xử lý tại chỗ" phải đúng tới từng chặng, không chỉ đúng ở câu tóm tắt.
- Nói cho chính xác về `host_permissions`: không xin nó khiến Chrome chặn extension
  **đọc** dữ liệu từ máy chủ khác, chứ **không** khiến việc gửi đi trở thành bất khả.
  Bảo đảm thật nằm ở chỗ trong mã không có lệnh gọi mạng nào, và MV3 cấm tải mã từ xa.
  Tài liệu store từng khai mạnh hơn sự thật ở chỗ này; đã sửa.
- Nếu sau này gắn analytics từ xa thì **không dùng Firebase/Google Analytics**:
  nó mâu thuẫn trực tiếp với lời hứa và là đúng thứ người dùng đang sợ.

`targets.js` giữ danh sách nơi extension phải im lặng tuyệt đối: ô mật khẩu,
ô thẻ ngân hàng, ô tìm kiếm, và trình soạn thảo code.

---

## Bàn giao

Tiếp quản dự án: đọc [HANDOFF.md](HANDOFF.md) trước — trạng thái hiện tại, việc
đang dở, và sáu chỗ dễ vấp đã mắc ít nhất một lần.

---

## Cấu trúc

```
extension/src/engine/   vi.js (âm tiết + 23 nhãn), rules.js, ruleEngine.js,
                        bpe.js (BPE tự viết), onnxEngine.js (tầng 3)
extension/src/content/  index.js (điểm vào; chỉ tầng luật + gửi văn bản sang offscreen),
                        targets.js (lọc ô), highlighter.js (gạch chân),
                        replace.js (thay chuỗi an toàn với React/Lexical), tooltip.js
extension/src/offscreen/  offscreen.html/js (trang ẩn), worker.js (OnnxEngine, một bản
                        cho cả trình duyệt), checkService.js (hàng đợi + huỷ lượt cũ)
ml/                     vi.py (bản song song của vi.js), noise.py, encoding.py,
                        build_corpus.py, dataset.py, mix_datasets.py,
                        train.py, export_onnx.py, export_tokenizer.py
ml/evaluate.py          VSEC — nhớ --held-out --threshold 0.95 --margin 0.25
ml/false_alarm.py       báo động giả trên văn bản ĐÚNG
ml/sentence_eval.py     chấm theo CÂU — năm rổ kết cục, chỉ tầng model
ml/gate.py              phép quyết định, một bản duy nhất cho phía Python
ml/consonant_eval.py    tập chấm riêng cho lỗi phụ âm (1.796 ca)
ml/consonant_diagnose.py  vì SAO lớp phụ âm sót: thiếu tự tin, đoán sai,
                        hay bị nhãn thanh điệu ăn mất
ml/diagnose.py          chia phần bỏ sót trên VSEC
docs/decisions.md       nhật ký quyết định — vì sao chọn thế này, bỏ gì
```

`vi.js` và `vi.py` **bắt buộc cho cùng kết quả**. Lệch tokenizer giữa lúc train
và lúc chạy là lỗi im lặng, không crash, chỉ kém đi, rất khó truy.
