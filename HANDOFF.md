# Bàn giao — dự án Soát

Đọc file này trước, rồi `README.md` (tổng quan) và `docs/decisions.md` (26 quyết
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

- 38 commit, cây git sạch
- 43 test JS + 9 test Python, tất cả pass (`npm run test:all`)
- Đã cài thật vào Chrome, gõ thật trên Facebook, cả bốn tầng đều sống
- Gói nộp store đã đóng xong, **chưa nộp**

### Số liệu chốt

Model đang ship: `student768_v3`, INT8 per-channel, ngưỡng sản phẩm **0,95** và
biên 0,25 (`onnxEngine.js`).

| Thước đo | Số | Đo bằng |
|---|---|---|
| VSEC giữ kín, trong tầm | P **0,9600** · R 0,7404 · F1 0,8360 | `evaluate.py --held-out --threshold 0.95 --margin 0.25` |
| Lỗi phụ âm (1.796 ca) | recall **41,4%** | `consonant_eval.py` |
| Báo động giả trên văn bản đúng | 1,45% / 1,25% số câu | `false_alarm.py` |
| Trong trình duyệt | nạp ~325ms · p50 5,4ms · p95 5,7ms | `export_onnx.py` |
| Gói cài | 78,5 MB thô → **58,6 MB nén** | `package_extension.py` |

**Ba lưu ý khi đọc bảng này:**

1. `evaluate.py` **mặc định chấm bằng argmax không ngưỡng** — đó là năng lực
   thô, không phải thứ người dùng thấy. Phải truyền `--threshold 0.95
   --margin 0.25` mới ra số thật.
2. Báo oan máy đếm là **chặn trên**. Đọc tay 54 ca ở
   `docs/false_alarm_review.md` thì 26% số "báo oan" hoá ra model bắt đúng lỗi
   thật trong văn bản được coi là sạch. Tỷ lệ oan thật khoảng **0,75%**.
3. Recall VSEC của v3 **thấp hơn** bản trước (0,7404 so với 0,7670). Đây là
   đánh đổi có chủ ý — xem quyết định 26.

---

## VIỆC TIẾP THEO — theo thứ tự ưu tiên

### 1. Xoá blob 311MB khỏi lịch sử git (CHẶN việc nộp store)

`.gitignore` có `extension/models/*.onnx` nhưng mẫu đó **không khớp**
`soat.fp32.onnx.data` — file trọng số ngoài của bản fp32. Nó đã vào hai commit
(`ef2a49d` và `4d14d67`); `.git` hiện **624 MB**.

GitHub từ chối mọi file trên 100MB, nên chừng nào chưa xoá thì repo không đẩy
lên GitHub được — mà bước 2 của `docs/store/nop-store.md` cần đúng việc đó để có
URL chính sách riêng tư công khai.

```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --index-filter \
  "git rm --cached --ignore-unmatch extension/models/soat.fp32.onnx.data" \
  -- f2a8679..HEAD
```

Chưa push đi đâu nên an toàn; `refs/original/` giữ bản sao để lùi. Sau khi chắc
chắn thì `git reflog expire --expire=now --all && git gc --prune=now` mới thật
sự lấy lại dung lượng.

### 2. Nộp Chrome Web Store

Hồ sơ đã xong hết, chỉ còn phần cần tài khoản của chủ repo. Làm theo
**[docs/store/nop-store.md](docs/store/nop-store.md)** — 8 bước, bắt đầu bằng
bước 0 là thử lại trên Chrome thật.

| Thứ | Ở đâu |
|---|---|
| Gói cài | `dist/soat-1.0.0.zip` (58,6 MB) |
| 3 ảnh 1280×800 | `dist/store/*.png` |
| Nội dung từng ô devconsole | `docs/store/listing.md` |
| Chính sách riêng tư | `docs/store/privacy-policy.md` |
| Trang giới thiệu | `docs/store/landing.html` |

Sinh lại: `python ml/package_extension.py` và `python ml/make_screenshots.py`
(cả hai neo đường dẫn theo vị trí file, đứng đâu chạy cũng được).

### 3. Lớp d/gi/r vẫn yếu — ví dụ đầu bảng của sản phẩm

`consonant_eval.py` đo được `d/gi/r` chỉ **17,8%** (106/596). Cụ thể:

- `chúc mừng anh đã **dành** được phần quà` → cả hai tầng đều bỏ qua
- `dành chiến thắng` → tầng luật bắt được (có cue `chiến thắng`)
- `dành được giải nhất` → bỏ qua, vì chữ `được` đẩy cue `giải` ra xa một nhịp

**Đã thử và loại bỏ hướng sửa bằng cue:** thêm `phần`+`quà` vào nhóm cue của
`giành` thì bắt được câu trên, nhưng câu **đúng** `chị dành phần quà cho em` bị
gạch oan (3 điểm − 1 điểm = 2, vừa chạm ngưỡng). Thêm mỗi `quà` thì an toàn mà
vô dụng. Đây là việc của model, không phải của luật.

**Hướng còn lại, chưa làm:** một vòng fine-tune nhắm riêng `d/gi/r` — hiện nó
chỉ chiếm ~1,5% dữ liệu train (5,95% của phần bổ sung × 25% tỷ lệ trộn). Đẩy lên
5–8%. Mất khoảng một tiếng, chấm bằng 596 ca có sẵn. **Rủi ro đã biết:** mỗi lần
nghiêng về một lớp là lấy bớt của lớp thanh điệu — xem v2 trong quyết định 26.

### 4. Giảm dung lượng — đã đo, chưa làm

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
                    build_corpus.py, dataset.py, train.py, export_onnx.py,
                    export_tokenizer.py, encoding.py
  evaluate.py       VSEC — thêm --threshold/--margin để chấm ở ngưỡng thật
  false_alarm.py    báo động giả trên văn bản ĐÚNG
  diagnose.py       chia phần bỏ sót: thiếu tự tin hay đoán sai
  consonant_eval.py tập chấm riêng cho lỗi phụ âm (1.796 ca)
  package_extension.py, make_screenshots.py
dev/                playground.html, onnx-test.html, shots.html (nguồn ảnh store)
docs/decisions.md   26 quyết định
docs/blog.html      bài viết về toàn bộ quá trình và các lần sai
docs/store/         hồ sơ nộp Chrome Web Store
```

### Checkpoint trong `ml/out/`

| Thư mục | Là gì |
|---|---|
| `teacher` | PhoBERT 134M, F1 0,8924 |
| `student768` | Bản 768 gốc, copy trọng số teacher |
| **`student768_v3/best`** | **Đang ship** — fine-tune 25% dữ liệu phụ âm |
| `student768_v2/best` | Thử 50% phụ âm, loãng lớp thanh điệu, giữ để đối chiếu |
| `v3_onnx/`, `v2_onnx/`, `s768_onnx/` | ONNX của từng bản |

`train.py` giờ giữ **hai** bản: `<out>` là epoch cuối (để `--resume` khớp với
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
  --tokenizer out/student768_v3/best --held-out --limit 1500 \
  --threshold 0.95 --margin 0.25
python false_alarm.py --tokenizer out/student768_v3/best --limit 2000
python consonant_eval.py --tokenizer out/student768_v3/best
python diagnose.py --tokenizer out/student768_v3/best
```

Sinh lại dữ liệu bổ sung phụ âm rồi fine-tune (dữ liệu gốc đã có sẵn trong
`ml/data/`, không cần dựng lại):

```bash
cd ml
python dataset.py --corpus data/corpus.txt --out data_cons --variants 1 \
  --class-weights data/class_weights_consonant.json --seed 13
# rồi trộn tay theo tỷ lệ muốn, xem quyết định 26
python train.py --data data_ft25 --out out/student768_v4 \
  --model out/student768 --epochs 2 --batch 32 --workers 4 --select f1
python export_onnx.py --model out/student768_v4/best --out ../extension/models --name soat
```

**PowerShell 5.1 không có `&&`** — chạy từng lệnh một dòng.

---

## Tám điều dễ vấp — đều đã mắc ít nhất một lần

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

Và cách rẻ nhất phát hiện ra khoảng cách đó: **cài sản phẩm vào máy mình rồi
dùng như một người dùng**. Ba lỗi nặng nhất đều lộ ra trong ba mươi phút đầu
làm việc đó, sau khi không phép đo offline nào chạm tới chúng suốt hai tuần.

Khi báo cáo hiệu năng, **luôn kèm đánh đổi**. Ví dụ đúng cách:
*"per-channel cứu 37 trong 45 ca lượng tử hoá làm mất, đổi lấy gói nén tăng từ
49,8 lên 58,6 MB."*
