# Soát

Kiểm tra chính tả tiếng Việt ngay trong ô nhập liệu, **chạy hoàn toàn trên máy
người dùng**. Không server, không API, không một ký tự nào rời khỏi trình duyệt.

Trọng tâm là lớp lỗi mà từ điển và Hunspell **không thể** xử lý: cặp đồng âm mà
cả hai dạng đều là từ đúng.

| Người viết | Đúng phải là | Vì sao từ điển bó tay |
|---|---|---|
| hộp **sửa** tươi | hộp **sữa** tươi | `sửa` và `sữa` đều là từ có thật |
| **dành** chiến thắng | **giành** chiến thắng | `dành` và `giành` đều đúng |
| đọc **chuyện** tranh | đọc **truyện** tranh | `chuyện` và `truyện` đều đúng |
| **nổ** lực | **nỗ** lực | `nổ` là từ có thật (phát nổ) |

Tên đúng của bài toán không phải *spell check* mà là **contextual homophone
disambiguation**. Đó là lý do nó cần một mô hình ngôn ngữ chứ không phải một
danh sách từ.

---

## Kiến trúc — bốn tầng

```
văn bản  ─►  ① tra từ điển   ─►  ② sinh ứng viên  ─►  ③ chấm ngữ cảnh  ─►  ④ lọc & ngưỡng  ─►  gạch chân
              <1ms, JS            <1ms, tập đóng      ~60ms, ONNX INT8      <1ms
```

**① + ②  Tầng luật** (`extension/src/engine/`) — 137 luật cụm sai tuyệt đối và
20 cặp đồng âm quyết định bằng **cue có hướng**. Chạy được ngay, không cần model.

**③  Tầng model** (`ml/`) — điểm kiến trúc quan trọng nhất:

> Model **không dự đoán từ**. Nó dự đoán một nhãn trong ~20 nhãn cố định
> (`KEEP`, `HOI_NGA`, `CH_TR`, `S_X`…), mỗi nhãn là một phép biến đổi chuỗi
> xác định.

Hệ quả: không gian đầu ra 20 thay vì 75.000 âm tiết → head bé, model nhẹ, chạy
được trong trình duyệt; tổng quát hoá sang từ chưa gặp lúc train; và **về mặt
cấu trúc không thể bịa** — model không có khả năng sinh ra từ nằm ngoài tập ứng
viên do tầng ② dựng sẵn.

**④  Ngưỡng** — nguyên tắc xuyên suốt: **thà bỏ sót còn hơn báo sai**. Gạch chân
nhầm một lần là người dùng gỡ cài; bỏ sót thì họ không biết.

---

## Chạy thử

```bash
npm test                      # 32 test cho lõi ngôn ngữ và bộ khớp luật
npm run dev                   # rồi mở http://localhost:8777/dev/playground.html
```

`dev/playground.html` nạp thẳng engine và tầng DOM, không cần cài extension —
dùng để kiểm chứng phần gạch chân và phần thay chuỗi trong trình duyệt thật.

Cài extension: Chrome → `chrome://extensions` → bật *Developer mode* →
*Load unpacked* → chọn thư mục `extension/`.

---

## Huấn luyện

```bash
cd ml && pip install -r requirements.txt

python dataset.py   --corpus data/corpus.txt --out data --variants 2
python train.py     --data data --out out/teacher --model vinai/phobert-base-v2
python train.py     --data data --out out/student --teacher out/teacher --layers 4 --hidden 384
python export_onnx.py --model out/student --out ../extension/models
```

Dữ liệu train là **miễn phí và vô hạn**: corpus sạch + bộ sinh lỗi = cặp
(sai, đúng), không tốn một đồng gán nhãn.

### Cái bẫy trong việc sinh dữ liệu

Nếu đảo hỏi↔ngã **ngẫu nhiên đều** thì model học một phân bố lỗi không giống
đời thật — người Việt sai `nỗ lực` liên tục nhưng gần như không bao giờ sai
`mỹ`. Model train trên nhiễu đều sẽ vừa bỏ sót lỗi thật vừa báo động giả ở chỗ
chẳng ai sai.

`noise.py` vì vậy nhận một bảng xu hướng lỗi **theo từng từ**, ước lượng từ văn
bản bẩn thật. Trọng số phải tác động ở **cả hai khâu** — chọn token nào để làm
hỏng, và chọn cách làm hỏng nào; chỉ áp ở khâu sau thì phân bố thu được chẳng
liên quan gì tới thiết kế (xem `docs/decisions.md`, quyết định 5).

---

## Số liệu

Cần điền sau khi train. Ba nhóm, và nhóm thứ ba mới là nhóm khó bịa:

| Nhóm | Chỉ số | Trạng thái |
|---|---|---|
| Chất lượng | P / R / F1 trên tập test, **đối chiếu VSEC** (86.8% phát hiện / 81.5% sửa) | chưa có |
| Hiệu năng | kích thước model, p50/p95 **đo trên máy yếu, 1 luồng** | `export_onnx.py` in sẵn |
| Sản phẩm | **tỷ lệ chấp nhận gợi ý**, retention D1/D7/D30, tỷ lệ gỡ cài | extension đã đếm |

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

## Cấu trúc

```
extension/src/engine/   vi.js (âm tiết + bộ nhãn), rules.js (dữ liệu), ruleEngine.js
extension/src/content/  targets.js (lọc ô), highlighter.js (gạch chân),
                        replace.js (thay chuỗi an toàn với React/Lexical), tooltip.js
ml/                     vi.py (bản song song của vi.js), noise.py, dataset.py,
                        train.py, export_onnx.py
docs/decisions.md       nhật ký quyết định — vì sao chọn thế này, bỏ gì
```

`vi.js` và `vi.py` **bắt buộc cho cùng kết quả**. Lệch tokenizer giữa lúc train
và lúc chạy là lỗi im lặng, không crash, chỉ kém đi, rất khó truy.
