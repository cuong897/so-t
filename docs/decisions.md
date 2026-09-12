# Nhật ký quyết định

Mỗi mục: chọn gì, bỏ gì, vì sao, đánh đổi ra sao.

Đây là món chuẩn bị phỏng vấn rẻ nhất và hiệu quả nhất. Sáu tháng sau khi được
hỏi *"sao em không dùng seq2seq?"* thì có câu trả lời thật thay vì ú ớ.

---

### 1. Phân loại nhãn biến đổi, không phải seq2seq

**Chọn:** token classification trên ~20 nhãn cố định, mỗi nhãn là một phép biến
đổi chuỗi xác định (`HOI_NGA`, `CH_TR`, `S_X`…).

**Bỏ:** seq2seq kiểu BARTpho/VSEC sinh thẳng câu đã sửa.

**Vì sao:** không gian đầu ra 20 thay vì 75.000 âm tiết. Head bé, softmax rẻ,
model nhẹ — đây là điều kiện cần để chạy trong trình duyệt. Nhãn nói về *phép
biến đổi* chứ không về *từ cụ thể*, nên tổng quát hoá được sang từ chưa gặp lúc
train. Và quan trọng nhất: về mặt cấu trúc **không thể hallucinate**.

**Đánh đổi:** không sửa được lỗi cần chèn/xoá âm tiết, không sửa được lỗi ngữ
pháp. Chấp nhận — phạm vi sản phẩm là lỗi chính tả ở mức âm tiết.

---

### 2. Tầng luật chạy trước, model cắm vào sau

**Chọn:** ship tầng luật trước, model ONNX cắm vào qua một interface cố định.

**Vì sao:** nếu chờ model xong mới ráp DOM thì phải debug hai thứ khó cùng lúc,
và không biết cái nào hỏng. Tầng luật cũng cho sản phẩm có ích ngay ngày đầu.

**Đánh đổi:** recall thấp lúc đầu. Chấp nhận, vì precision mới là ràng buộc
sống còn.

---

### 3. Thà bỏ sót còn hơn báo sai

**Chọn:** ngưỡng chặt, cue phải có bằng chứng dương áp đảo mới dám báo.

**Vì sao:** gạch chân nhầm một lần là người dùng gỡ cài và để lại review 1 sao;
bỏ sót một lỗi thì họ không biết. Hai loại sai này **không đối xứng** về hậu quả,
nên ngưỡng cũng không được đối xứng.

---

### 4. Cue phải có hướng

**Chọn:** cue chia `before` / `after`, kề sát tính điểm gấp đôi, và so sánh
**tương đối** (`otherScore - selfScore >= 2`) chứ không tuyệt đối.

**Bỏ:** danh sách cue vô hướng trong một cửa sổ ±3 token.

**Vì sao — đây là lỗi tôi đã mắc và phải sửa:** với cue vô hướng, câu *"Còn đúng
một nửa tiếng nữa thôi"* (viết đúng hoàn toàn) bị báo sai ở `nữa`, vì `một` và
`tiếng` là cue của `nửa` và chúng nằm gần **cả hai** dạng. Hướng mới là tín
hiệu thật: `một` **đứng trước** thì ủng hộ `nửa`, còn chính từ `một` đó nằm sau
lưng `nữa` ở cuối câu thì chẳng nói lên gì.

---

### 5. Trọng số lớp lỗi phải áp ở cả hai khâu

**Vì sao — lỗi thứ hai đã mắc:** ban đầu trọng số chỉ áp khi chọn *cách* làm
hỏng, còn chọn *token nào* để làm hỏng thì đều nhau. Kết quả: `C_T` đặt 0.5%
nhưng thực tế chiếm 9.6%, vì token nào chỉ có mỗi lựa chọn `C_T` vẫn bị hỏng
ngang với token có `HOI_NGA`, rồi `C_T` là lựa chọn duy nhất nên trúng 100%.

**Sửa:** chọn token theo tổng trọng số các lựa chọn của nó. Sau khi sửa,
hỏi/ngã về 69% (thiết kế 60%), `C_T` về 1.0% (thiết kế 0.5%).

**Bài học tổng quát:** phân bố của dữ liệu sinh ra là thứ phải *đo*, không phải
thứ tự tin là mình đã cấu hình đúng.

---

### 6. `vi.js` và `vi.py` là hai bản của cùng một thứ

**Chọn:** viết tay hai bản và có test parity, thay vì chạy JS trong Python hay
ngược lại.

**Vì sao:** lệch tokenizer hay lệch cách sinh nhãn giữa lúc train và lúc chạy là
lỗi **im lặng** — không crash, chỉ kém đi, và rất khó truy ra.

**Đã bắt được một lệch thật:** JS tokenize lấy cả chữ số (`[\p{L}\p{M}\d_]+`),
Python thì không (`[^\W\d_]+`). Đã đồng bộ về "chỉ chữ cái".

---

### 7. CSS Custom Highlight API cho contenteditable

**Chọn:** `CSS.highlights` + `Range` cho contenteditable; lớp phủ mirror cho
textarea.

**Bỏ:** chèn thẻ `<span>` vào vùng soạn thảo.

**Vì sao:** chèn DOM node vào editor của Facebook (Lexical) hay Gmail sẽ phá mô
hình nội bộ của editor, hỏng con trỏ và undo stack. Highlight API không đụng
vào DOM của trang. Với textarea thì không có lựa chọn — không thể tô màu chữ
bên trong, nên phải dựng div sao chép font/padding/wrap, để chữ trong suốt và
chỉ vẽ gạch chân.

**Đánh đổi:** Google Docs render bằng canvas nên cả hai cách đều không dùng
được. **v1 bỏ Google Docs.**

---

### 8. `execCommand` dù đã deprecated

**Chọn:** `document.execCommand('insertText')` để thay chuỗi, có đường dự phòng
qua native setter + `InputEvent`.

**Vì sao:** React ghi đè property `value` trên chính instance phần tử để theo
dõi thay đổi. Gán `el.value = x` sẽ đổi hiển thị nhưng React **không biết**,
nên lần render sau giá trị cũ quay lại. `execCommand` đi qua đúng đường ống
soạn thảo của trình duyệt nên editor nhận được `beforeinput`/`input` như người
dùng gõ thật.

**Đánh đổi:** dùng một API đã deprecated. Chấp nhận — chưa có thứ thay thế nào
được hỗ trợ rộng bằng, và đã có đường dự phòng.

---

### 9. Không dùng Firebase cho analytics

**Chọn:** chỉ đếm cục bộ. Nếu sau này gửi đi thì self-host PostHog/Plausible.

**Vì sao:** sản phẩm bán bằng câu *"không một ký tự nào rời khỏi trình duyệt"*.
Gắn Firebase vào là vừa nói dối trong phần marketing, vừa dễ bị Chrome Web Store
từ chối vì khai báo dữ liệu không khớp — và Firebase là Google, đúng thứ người
dùng đang sợ khi cài một extension đọc mọi ô nhập liệu.

**Ghi chú:** "đo được sản phẩm khi không được phép nhìn thấy dữ liệu người dùng"
là một bài toán kỹ thuật thật, và rất ít sinh viên từng phải giải.

---

### 10. `<all_urls>` — quyền rộng, biết là rủi ro

**Chọn:** content script khớp `<all_urls>`, nhưng **không** xin `host_permissions`.

**Vì sao:** một trợ lý viết buộc phải có mặt ở mọi ô nhập liệu. Không xin
`host_permissions` nghĩa là extension không thể gọi mạng tới trang nào — giảm
đáng kể bề mặt rủi ro và dễ giải trình khi Chrome Web Store xét duyệt.

**Bù lại:** danh sách loại trừ trong `targets.js` phải chặt và phải có test.

---

### 11. Sáu nhãn đặt-thanh thay cho cặp hỏi/ngã

**Đo được rồi mới quyết.** Trên VSEC (10.845 cặp lỗi thật):

| Bộ nhãn | Phủ được |
|---|---|
| hỏi↔ngã + phụ âm + âm cuối (bản đầu) | 7,6% |
| chỉ 6 nhãn `TONE_*` (đặt thanh thành X) | 49,7% |
| cả hai gộp lại | **54,5%** |
| thêm kết hợp hai phép biến đổi | 54,6% |

**Chọn:** thay `HOI_NGA`/`NGA_HOI` bằng 6 nhãn `TONE_*`. Bốn nhãn thêm vào đổi
lấy gấp bảy lần coverage, mà hỏi/ngã vẫn nằm trọn bên trong. **Bỏ** phương án
kết hợp hai phép — thêm 0,1% không đáng phần phức tạp.

**Hệ quả phụ:** bảng `INVERSE_TAG` tĩnh phải bỏ. Nghịch đảo của một nhãn
đặt-thanh phụ thuộc thanh gốc của từ đúng, nên phải tra bằng `tag_between()`.
Đổi lại, chính hàm đó là thứ `evaluate.py` cần để biết một cặp (sai, đúng) có
nằm trong tầm với hay không.

**45,5% còn lại nằm ngoài tầm** và phải nói rõ chứ không giấu: một nửa là
chèn/xoá ký tự (`tranhh`→`tranh`, `iên`→`nhiên`), còn lại là đổi phẩm chất
nguyên âm (`bức`→`bước`). VSEC nặng về lỗi **gõ phím**; sản phẩm này nhắm lỗi
**kiến thức** — người không biết hỏi hay ngã. Đó là hai bài toán khác nhau, nên
`evaluate.py` in riêng khối "trong tầm" và khối "toàn bộ".

---

### 12. Bốc LỚP lỗi trước, rồi mới bốc token

**Lỗi thứ ba đã mắc.** Sau khi sửa lỗi ở quyết định 5, phân bố vẫn sai: `missing`
ra 50,7% dù cấu hình 22,2%, phụ âm ra 5,4% dù cấu hình 37%.

**Nguyên nhân:** bốc token trước thì phân bố bị chi phối bởi **lớp nào tình cờ
có sẵn ở token nào**. Âm tiết nào cũng có thể mất dấu, nhưng chỉ âm tiết bắt
đầu bằng l/n/ch/tr/s/x/d/gi/r mới có lỗi phụ âm. Trọng số đặt bao nhiêu cũng vô
nghĩa trước sự chênh lệch đó.

**Sửa:** bốc lớp theo trọng số trước, rồi bốc token trong lớp ấy. `hoi_nga` từ
18,4% về 34,5% (thiết kế 31,5%).

**Bài học lặp lại lần thứ ba trong dự án này:** phân bố dữ liệu sinh ra là thứ
phải **đo**, không phải thứ tự tin là đã cấu hình đúng.

---

### 13. Tự viết BPE cho trình duyệt — và bài kiểm tra đã cứu dự án

**Chọn:** `bpe.js` ~100 dòng, đọc `tokenizer.json` do `export_tokenizer.py` sinh.

**Bỏ:** transformers.js. MV3 cấm nạp code từ xa nên thư viện nào cũng phải đóng
gói kèm; bản đầy đủ nặng vài trăm KB và kéo theo cả phần suy luận đã có
onnxruntime-web lo.

**Hai thứ chỉ lộ ra nhờ kiểm tra parity:**

1. PhoBERT **không có** tokenizer bản fast. `use_fast=True` âm thầm trả về bản
   Python, nên `word_ids()` không tồn tại. Phải tự tách theo từng từ — hoá ra
   lại tốt hơn, vì đó đúng là cách `bpe.js` làm.

2. PhoBERT theo quy ước subword-nmt: hậu tố `@@` đánh dấu subword **còn tiếp**,
   subword cuối để trơn. Tôi đã giả định `</w>` cuối từ — **ngược hẳn**. Ship
   như vậy thì mọi token thành UNK và model trả về rác, không một lỗi nào bật ra.

`test/bpe.test.mjs` giờ đối chiếu `bpe.js` với tokenizer Python trên 5.609 token
lấy từ corpus thật. Đây là loại lỗi không thể bắt bằng cách đọc code.

---

### 14. Mở rộng tiền đề: "sửa dấu tiếng Việt", không phải "sửa hỏi/ngã"

**Số liệu buộc phải đổi.** `mine_errors.py` đo phân bố lỗi thật trên VSEC:

| Lớp lỗi | Đo được | Tôi đã đoán |
|---|---|---|
| `other_tone` (sai sang thanh khác) | **43,6%** | 9,3% |
| `missing` (mất dấu hoàn toàn) | **43,2%** | 22,2% |
| `hoi_nga` | **4,7%** | 31,5% |

Hỏi↔ngã — thứ tôi dựng cả luận điểm sản phẩm quanh nó — chỉ chiếm 4,7%.

**Nhưng xu hướng theo TỪNG TỪ lại xác nhận giả thuyết:** `nỗ` bị viết sai 19/36
lần (53%), `sàng` 11/24, `sẻ` 12/35, `ràng` 15/46, `dành` 6/25. Đúng nhóm từ
hỏi/ngã và d/gi kinh điển.

**Hai điều đó không mâu thuẫn.** Lỗi hỏi/ngã có thật và tập trung dữ dội vào một
nhóm từ hẹp, nhưng VSEC với tư cách một corpus lại bị lỗi gõ phím lấn át — vì
VSEC thu lỗi từ người *gõ*, còn tiền đề cũ nhắm người *không biết* viết hỏi hay
ngã. Hai quần thể khác nhau.

**Chọn:** mở rộng thành "sửa dấu tiếng Việt". Giữ đồng âm làm **điểm khác biệt**
(không công cụ nào khác làm được) nhưng nhận rằng sửa dấu nói chung mới là khối
lượng công việc.

**Không phải làm lại kiến trúc** — bộ 23 nhãn vốn đã phục vụ cả hai. Chỉ đổi
trọng số train và đổi câu chuyện.

**Cái giá của việc đoán, tính được bằng số:** F1 0,929 trên dev tự sinh so với
0,732 trên lỗi người thật. Hai mươi điểm là khoảng cách giữa nhiễu nhân tạo và
đời thật.

---

### 15. Chia đôi VSEC để không tự lừa mình

**Vấn đề:** rút phân bố lỗi từ VSEC rồi đem chấm trên chính VSEC thì số sẽ đẹp
lên mà chẳng có nghĩa gì.

**Chọn:** `mine_errors.py` chia VSEC làm đôi bằng băm SHA-256 nội dung câu —
nửa `mine` để rút phân bố, nửa `eval` giữ kín. `evaluate.py --held-out` chấm
trên đúng nửa giữ kín. Tất định nên không cần lưu danh sách, chạy lại luôn ra
cùng cách chia.

**Vì sao đáng làm dù không ai kiểm tra:** đây chính là chỗ nhiều đồ án sinh viên
gian lận một cách vô thức, và là chỗ người phỏng vấn giỏi sẽ hỏi đúng vào.

---

### 16. Ablation: đo phân bố đáng +9,2 điểm F1

Cùng checkpoint epoch 0, cùng lệnh, cùng 1.500 câu VSEC giữ kín. Khác đúng một
thứ: trọng số lớp lỗi là **đoán** hay **đo**.

| Trong tầm | Đoán | Đo | Chênh |
|---|---|---|---|
| Precision | 0,8652 | 0,8953 | +3,0 |
| Recall | 0,6830 | 0,8191 | **+13,6** |
| F1 | 0,7634 | 0,8556 | **+9,2** |

Precision **cũng** tăng. Nếu chỉ recall tăng còn precision giảm thì đó chỉ là
model trở nên mạnh dạn hơn; cả hai cùng tăng nghĩa là nó học được thứ đúng hơn.

**Phát hiện quan trọng hơn cả con số:**

| Đo trên | Đoán | Đo | |
|---|---|---|---|
| Dev tự sinh | 0,9288 | 0,9065 | −2,2 |
| VSEC thật, giữ kín | 0,7634 | 0,8556 | +9,2 |

Trên dev tự sinh, model mới **tệ hơn**. Trên lỗi người thật, **tốt hơn rõ rệt**.

Benchmark tự sinh không chỉ nói dối — nó nói dối **nhiều hơn cho model tệ hơn**,
vì dev tự sinh luôn khớp với chính phân bố đã dùng để train nó. Chỉ nhìn con số
đó thì sẽ kết luận ngược hoàn toàn và vứt bỏ đúng thay đổi cần giữ.

---

### 17. Learning rate phải theo kiểu khởi tạo, không để một mặc định

**Lỗi bắt được bằng rà tĩnh, trước khi chạy.** `--lr` mặc định 3e-5 là mức
fine-tune, nhưng học trò dựng bằng `from_config` nên khởi tạo **ngẫu nhiên** —
tức train từ đầu, cần 3e-4.

**Vì sao đáng sợ:** ở 3e-5 model gần như không học được gì, nhưng loss vẫn giảm
đủ đẹp để không ai nghi ngờ. Hai tiếng GPU đổ đi mà không có một dấu hiệu nào.

**Sửa:** lr tự chọn theo kiểu khởi tạo, và cảnh báo nếu người dùng tự đặt lr
thấp cho học trò.

**Đo thêm được một điều đáng lưu ý:** bảng embedding chiếm 63–84% học trò ở mọi
cấu hình và **không nhỏ đi theo số tầng** — nó tỷ lệ với vocab 64k nhân hidden.

| Cấu hình | Tổng | Embedding |
|---|---|---|
| 4 tầng/768 | 77,7M | 63% |
| 4 tầng/384 | 31,8M | 77% |
| 4 tầng/256 | 19,6M | 84% |

Cắt tầng gần như không giảm kích thước file. Muốn nhỏ thì phải giảm `hidden` —
và cái giá là không copy được trọng số teacher (lệch shape), học trò phải học
từ đầu.

---

### 18. Opset 18, và một lời nói dối trong chính code

**Lỗi chỉ lộ ra khi chạy trên model thật.** `export_onnx.py` đặt
`opset_version=14`, nhưng RoBERTa/PhoBERT dùng `LayerNormalization` — toán tử
chỉ có từ opset 17. Bộ chuyển phiên bản ném `RuntimeError`, `torch.onnx` **nuốt
lỗi**, và file vẫn xuất ra ở opset 18.

Nghĩa là hằng số `OPSET = 14` trong code nói một đằng, file nói một nẻo. Không
ai phát hiện được bằng cách đọc code.

**Sửa:** đặt `OPSET = 18` kèm lý do, thêm `actual_opset()` đọc lại opset THẬT từ
file sau khi xuất và cảnh báo nếu lệch, ghi opset vào report.

**Đã kiểm chứng đầu kia:** dựng một model RoBERTa nhỏ cùng kiến trúc, xuất ra
opset 18, nạp bằng onnxruntime-web 1.29 trong trình duyệt thật — chạy được,
shape `[1, 8, 23]` đúng. Nếu để tới lúc có model thật mới thử thì phát hiện ở
phút chót, khi không còn đường lùi nào rẻ.

**Số thật của teacher** (134M, 1 luồng CPU, 30 subword):

| | fp32 | INT8 |
|---|---|---|
| Kích thước | 539,4 MB | 136,3 MB (nhẹ hơn 4,0×) |
| p50 | 63,3 ms | 21,7 ms |
| p95 | 68,4 ms | 23,0 ms |

136 MB quá nặng để đóng gói vào extension — đây là con số biện minh cho bước
distil, chứ không phải cảm tính.
