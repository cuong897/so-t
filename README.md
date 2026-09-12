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

---

## Kiến trúc — bốn tầng

```
văn bản  ─►  ① tra từ điển   ─►  ② sinh ứng viên  ─►  ③ chấm ngữ cảnh  ─►  ④ lọc & ngưỡng  ─►  gạch chân
              <1ms, JS            <1ms, tập đóng      ~60ms, ONNX INT8      <1ms
```

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
npm run test:all  # 39 test JS + 9 test Python
npm run dev       # rồi mở hai trang dưới đây
```

| Trang | Kiểm chứng gì |
|---|---|
| `dev/playground.html` | Tầng DOM — gạch chân và thay chuỗi trong trình duyệt thật, không cần cài extension |
| `dev/onnx-test.html` | Đường ONNX — nạp runtime, mã hoá BPE, suy luận, chặn theo tập ứng viên |

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

Đo trên 1.500 câu VSEC **giữ kín**, khối "trong tầm":

| Model | Tham số | MB | P | R | F1 |
|---|---|---|---|---|---|
| Teacher fp32 | 134,4M | 539,4 | 0,9169 | 0,8691 | **0,8924** |
| 768 fp32 | 77,7M | 311,5 | 0,8966 | 0,8574 | 0,8766 |
| **768 INT8 per-channel ← đang dùng** | 77,7M | **78,5** | **0,9126** | 0,8330 | **0,8710** |
| 384 INT8 | 31,8M | 32,4 | 0,8378 | 0,7309 | 0,7807 |

Trong trình duyệt (768 INT8): nạp 325ms, p50 **15,6ms**, p95 **18,7ms**, bắt
4/6 câu mẫu, **0 báo động giả**.

**INT8 làm precision TĂNG** (0,8966 → 0,9126) chứ không phải cái giá phải trả:
lượng tử hoá cắt đi những dự đoán ở vùng ranh giới, vốn phần lớn là sai.

Còn thiếu — và là nhóm khó bịa nhất: **tỷ lệ chấp nhận gợi ý**, retention
D1/D7/D30, tỷ lệ gỡ cài. Extension đã đếm sẵn, chỉ chờ người dùng thật.

### Báo động giả trên văn bản viết đúng

Mọi con số trên đây đo trên câu **có sẵn lỗi**, bằng **argmax không ngưỡng**.
Người dùng thì sống với câu hỏi ngược lại: *tôi viết đúng, bao lâu một lần thì
nó gạch chân oan?* `false_alarm.py` dựng lại đúng phép quyết định của
`onnxEngine.js` (p ≥ 0,90 và hơn KEEP ≥ 0,25) rồi chạy trên 2.000 câu **không
có lỗi**, hai nguồn khác miền:

| Nguồn | Máy đếm | Đọc tay, chỉ tính oan thật |
|---|---|---|
| Wikipedia sạch (chưa từng train) | 1,25% số câu | ~0,75% |
| VSEC nửa giữ kín, câu đã sửa đúng | 1,30% số câu | ~0,75% |

*(Số đọc tay ở trên đo trên bản per-tensor @0,90 — 0,85% và 0,70%; bản
per-channel @0,95 hiện tại có tỷ lệ máy đếm tương đương nên tỷ lệ thật cũng
xấp xỉ, nhưng chưa đọc tay lại.)*

Khoảng **một câu trong 120–140**. Chênh lệch giữa hai cột là điểm đáng nói:
**26% số "báo động giả" hoá ra là model bắt đúng lỗi thật trong văn bản được coi
là sạch** (`cứ trú`→`cư trú`, `nỗi danh`→`nổi danh`). Văn bản sạch không sạch,
nên số máy đếm là chặn trên chứ không phải sự thật — cả 54 lần gạch chân được
đọc tay và để nguyên ngữ cảnh trong
[docs/false_alarm_review.md](docs/false_alarm_review.md).

**Ngưỡng mua được gì:** so với argmax, ngưỡng sản phẩm (0,95 / biên 0,25) đẩy
precision 0,9126 → **0,9550** và recall 0,8330 → **0,7670**. Đó mới là cặp số
người dùng thật sự thấy — `evaluate.py` mặc định chấm bằng argmax không ngưỡng,
tức năng lực thô.

**Và nâng ngưỡng không phải cách sửa:** trung vị độ tin cậy của các ca oan là
**0,981**, 12/31 ca ở p ≥ 0,99 — model **tự tin khi sai**. Vặn lên 0,99 thì báo
oan còn 0,60% nhưng recall rơi xuống 0,5862. Chỗ oan tập trung ở tên riêng,
thuật ngữ chuyên ngành và từ thường gặp trong ngữ cảnh lạ — tức chỗ **cả hai
dạng đều là từ thật**, đúng nơi từ điển bó tay.

```bash
cd ml && python false_alarm.py --limit 2000
python evaluate.py --onnx ../extension/models/soat.int8.onnx                    --tokenizer out/student768 --held-out --limit 1500                    --threshold 0.9 --margin 0.25
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
extension/src/content/  targets.js (lọc ô), highlighter.js (gạch chân),
                        replace.js (thay chuỗi an toàn với React/Lexical), tooltip.js
ml/                     vi.py (bản song song của vi.js), noise.py, encoding.py,
                        build_corpus.py, dataset.py, evaluate.py,
                        train.py, export_onnx.py, export_tokenizer.py
docs/decisions.md       nhật ký quyết định — vì sao chọn thế này, bỏ gì
```

`vi.js` và `vi.py` **bắt buộc cho cùng kết quả**. Lệch tokenizer giữa lúc train
và lúc chạy là lỗi im lặng, không crash, chỉ kém đi, rất khó truy.
