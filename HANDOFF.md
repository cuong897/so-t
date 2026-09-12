# Bàn giao — dự án Soát

Tài liệu để một phiên làm việc mới tiếp quản. Đọc file này trước, rồi đọc
`README.md` (tổng quan) và `docs/decisions.md` (22 quyết định, kèm lý do và các
lỗi đã mắc).

---

## Sản phẩm là gì

Extension Chrome sửa lỗi **dấu tiếng Việt** ngay trong ô nhập liệu, chạy **hoàn
toàn trên máy người dùng**. Không server, không API, không một ký tự nào rời
khỏi trình duyệt.

Bốn tầng: ① tra từ điển → ② sinh tập ứng viên → ③ model ONNX chấm theo ngữ cảnh
→ ④ ngưỡng và lọc.

Người dùng mục tiêu: người làm content và admin fanpage (viết công khai nhiều
lần mỗi ngày, sai chính tả là bẽ mặt trước hàng nghìn người), sau đó là sinh
viên viết khoá luận.

---

## Trạng thái: CHẠY ĐƯỢC

- 24 commit, cây git sạch
- 39 test JS + 9 test Python, tất cả pass (`npm run test:all`)
- Extension load được vào Chrome, model thật chạy trong trình duyệt
- Tầng luật: 137 luật cụm + 20 cặp đồng âm, hoạt động độc lập với model

### Số liệu chốt (1.500 câu VSEC **giữ kín**, khối "trong tầm")

| Model | Tham số | MB | P | R | F1 |
|---|---|---|---|---|---|
| Teacher fp32 | 134,4M | 539,4 | 0,9169 | 0,8691 | **0,8924** |
| 768 fp32 | 77,7M | 311,5 | 0,8966 | 0,8574 | 0,8766 |
| **768 INT8 ← đang dùng** | 77,7M | **74,8** | **0,9126** | 0,8330 | **0,8710** |
| 384 INT8 | 31,8M | 32,4 | 0,8378 | 0,7309 | 0,7807 |

Trong trình duyệt (bản 768 INT8): nạp 325ms, p50 15,6ms, p95 18,7ms, bắt 4/6
câu mẫu, **0 báo động giả**.

---

## VIỆC TIẾP THEO — người dùng đang cân nhắc

**Cắt vocab để giảm model từ 75MB xuống ~40MB.** Đã đo, chưa làm, **chưa được
đồng ý** — phải hỏi trước khi bắt tay.

Số liệu đã đo: chỉ **23.669 / 64.001** token của PhoBERT thực sự xuất hiện
(37%). Giữ token xuất hiện ≥20 lần → 15.503 token, phủ **99,69%** số lượt,
embedding giảm 49,2M → 11,9M, tổng model 77,7M → ~40M.

Cách làm, và chỗ nguy hiểm:

1. Đếm tần suất token từ `ml/data/train.tok96.npz` (đã có sẵn)
2. Dựng bảng ánh xạ id cũ → id mới, giữ nguyên 4 token đặc biệt
3. Cắt ma trận embedding theo bảng đó, train lại (hoặc chỉ fine-tune ngắn)
4. `export_tokenizer.py` xuất vocab đã remap
5. **`bpe.js` phải dùng đúng id mới** — sai id là lỗi **hoàn toàn im lặng**:
   model vẫn chạy, chỉ trả rác. Bắt buộc mở rộng `test/bpe.test.mjs` để phủ
   phần ánh xạ, theo đúng cách nó đã bắt được lỗi hậu tố `@@` trước đây.

### Việc khác đã biết, chưa làm

- **`train.py` chỉ giữ checkpoint mới nhất, không phải tốt nhất.** Mỗi epoch ghi
  đè lên epoch trước. Với sản phẩm ưu tiên precision thì epoch cuối không nhất
  thiết tốt nhất. Hiện phải copy tay (đã làm với `out/student768_ep1`).
- **Google Docs không hỗ trợ** (render bằng canvas). Đã quyết bỏ ở v1.
- **Văn bản không dấu hoàn toàn** model bắt kém (`luon co gang` → không thấy).
  Giới hạn cố hữu: model dựa vào ngữ cảnh, cả câu mất dấu thì ngữ cảnh cũng
  hỏng. Cần nói rõ chứ đừng giấu.
- **Chưa có người dùng thật.** Extension chưa nộp Chrome Web Store, chưa có
  landing page.

---

## Bố cục

```
extension/          MV3, không cần build
  src/engine/       vi.js (âm tiết + 23 nhãn), rules.js, ruleEngine.js,
                    bpe.js (BPE tự viết), onnxEngine.js (tầng 3)
  src/content/      targets.js (lọc ô), highlighter.js, replace.js, tooltip.js
  models/           artifact sinh ra, KHÔNG commit
  vendor/           onnxruntime-web 14MB, tải bằng ml/fetch_vendor.sh
ml/                 vi.py (bản song song vi.js), noise.py, mine_errors.py,
                    build_corpus.py, dataset.py, train.py, evaluate.py,
                    export_onnx.py, export_tokenizer.py, encoding.py
  out/              checkpoint + kết quả eval (xem bảng dưới)
dev/                playground.html (tầng DOM), onnx-test.html (đường ONNX)
docs/decisions.md   22 quyết định — vì sao chọn, bỏ gì, lỗi nào đã mắc
```

### Checkpoint trong `ml/out/`

| Thư mục | Là gì |
|---|---|
| `teacher` | PhoBERT 134M, 2 epoch, phân bố **đo được** — F1 0,8924 |
| `teacher_guessed` | Baseline phân bố **ước lượng** — F1 0,7634, giữ để đối chiếu |
| `student768` | **Model đang dùng**, 4 tầng/768, copy trọng số teacher |
| `student768_ep1` | Checkpoint epoch 1, giữ vì precision cao hơn epoch 0 |
| `student` | Bản 384 cũ, giữ để đối chiếu |
| `s768_onnx` | ONNX fp32 + INT8 của bản 768 |

Các file `eval_*.json` đều có khối `_meta` ghi rõ checkpoint, lệnh chạy và tập
chấm — dùng chúng thay vì chạy lại.

---

## Lệnh hay dùng

```bash
npm run test:all                       # 39 JS + 9 Python
npm run dev                            # rồi mở dev/playground.html hoặc onnx-test.html

cd ml
python evaluate.py --model out/student768 --held-out --limit 1500
python evaluate.py --onnx ../extension/models/soat.int8.onnx \
                   --tokenizer out/student768 --held-out --limit 1500
python train.py --data data --out out/x --teacher out/teacher \
                --layers 4 --hidden 768 --epochs 3 --workers 4
python export_onnx.py --model out/student768 --out ../extension/models --name soat
```

Train lại từ đầu mất ~2,5 tiếng trên RTX 4060 (teacher 2 epoch + học trò 3
epoch). Dataset đã có sẵn trong `ml/data/`, không cần dựng lại.

---

## Sáu điều dễ vấp — đều đã mắc ít nhất một lần

1. **Luôn dùng `--held-out` khi chấm.** `mine_errors.py` rút phân bố lỗi từ nửa
   VSEC; chấm trên cả tập là tự lừa mình. Chia đôi bằng băm tất định nên không
   cần lưu danh sách.

2. **Benchmark tự sinh nói dối, và nói dối NHIỀU HƠN cho model tệ hơn.** Ba lần
   liên tiếp trong dự án này: dev tự sinh bảo model mới tệ đi 2,2 điểm trong khi
   trên lỗi người thật nó tốt lên 9,2 điểm. Chỉ tin số trên VSEC giữ kín.

3. **`vi.js` và `vi.py` phải cho kết quả giống hệt.** Lệch là lỗi im lặng, không
   crash, chỉ kém đi. Có test parity 11 hàm × 78 từ — chạy lại sau mỗi lần sửa.

4. **Cache trình duyệt phục vụ lại cả file `.onnx`.** Thay model rồi mà kết quả
   *giống hệt* bản cũ tới từng phần trăm thì nghi cache trước, đừng nghi logic.
   `dev/onnx-test.html` đã cache-bust cả ba tầng: trang, module JS, file model.

5. **`evaluate.py` dùng argmax KHÔNG ngưỡng; sản phẩm đòi 0,9 và biên 0,25.**
   Số F1 báo cáo là năng lực thô, không phải thứ người dùng thấy. Đừng đem con
   số đó đi hứa, cũng đừng lấy nó làm cớ hạ ngưỡng.

6. **Precision quan trọng hơn recall.** Gạch chân nhầm một lần là người dùng gỡ
   cài và để review 1 sao; bỏ sót thì họ không biết. Hai loại sai này không đối
   xứng về hậu quả nên ngưỡng cũng không được đối xứng.

---

## Ba thứ nên giữ khi viết CV và blog

Câu chuyện mạnh nhất của dự án **không** phải con số F1, mà là hai tầng sai lầm
đã tự phát hiện:

1. Tôi đoán hỏi/ngã chiếm 31,5% lỗi. Đo ra **4,7%**. Phải mở rộng tiền đề sản
   phẩm.
2. Sửa xong, benchmark tự sinh bảo tôi **làm tệ đi**. Chỉ tập gán nhãn tay mới
   cho thấy thật ra **tốt hơn 9,2 điểm**.

Tầng thứ hai mới đắt giá: nó cho thấy biết **không tin thước đo của chính mình**,
và biết vì sao.

Khi báo cáo hiệu năng, **luôn kèm đánh đổi**: *"INT8 nhẹ hơn 4×, nhanh hơn 3×,
và precision TĂNG từ 0,8966 lên 0,9126 — lượng tử hoá cắt đi những dự đoán vùng
ranh giới, vốn phần lớn là sai."*
