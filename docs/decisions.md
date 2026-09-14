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

---

### 19. Distil lấy mất 11 điểm F1, INT8 gần như miễn phí

Đo trên cùng 1.500 câu VSEC giữ kín:

| Model | Tham số | Kích thước | F1 trong tầm |
|---|---|---|---|
| Teacher fp32 | 134M | 539 MB | **0,8924** |
| Học trò fp32 | 32M | 128 MB | 0,7824 |
| Học trò INT8 | 32M | **32,4 MB** | **0,7807** |

**Distil: −11,0 điểm. Lượng tử hoá: −0,17 điểm.**

Con số thứ hai là bất ngờ dễ chịu — INT8 gần như miễn phí, nhẹ hơn 3,9 lần và
nhanh gấp đôi. Con số thứ nhất mới là cái giá thật, và nó đắt.

**Lý do distil đắt:** học trò hidden 384 lệch shape với teacher 768 nên không
copy được trọng số nào, phải học lại từ đầu qua KD. Đổi lại là kích thước: giữ
hidden 768 thì copy được nhưng model thành 78 MB.

**Và một lần nữa dev tự sinh nói dối:** nó báo khoảng cách teacher↔học trò chỉ
5,5 điểm (0,9335 vs 0,8788), trong khi trên lỗi người thật là 11,0 điểm. Lần
thứ ba trong dự án này benchmark tự sinh làm đẹp cho model yếu hơn.

### Trong trình duyệt thật

| | |
|---|---|
| Nạp model | 375 ms |
| Suy luận | p50 **6,6 ms**, p95 **8,0 ms** |
| Bắt lỗi (6 câu mẫu, ngưỡng sản xuất) | **4/6**, 2 báo động giả |
| Độ tin cậy khi báo | 99–100% |

Hai ca trượt đều là văn bản **không dấu hoàn toàn** (`luon co gang`,
`duoc gap lai`). Giải thích được: model phân biệt bằng ngữ cảnh, mà khi cả câu
mất dấu thì chính ngữ cảnh cũng hỏng. Đây là giới hạn thật, không phải bug —
và là phạm vi cần nói rõ chứ không giấu.

---

### 20. Cache trình duyệt suýt cho một kết luận sai hoàn toàn

Thay model 32 MB vào rồi chạy lại trang test: kết quả **y hệt** model giả cũ,
kể cả các con số phần trăm. Suýt kết luận "model thật không bắt được gì".

Thực ra trình duyệt phục vụ lại file `.onnx` trong cache. Phải cache-bust cả ba
tầng mới thấy model thật: trang HTML, các module JS, **và chính file model**.

Bài học: khi kết quả sau khi thay đổi *giống hệt* kết quả trước, nghi cache
trước khi nghi logic. Con số trùng khít tới từng phần trăm là dấu hiệu của cache
chứ không phải của một sự trùng hợp.

---

### 21. Chọn học trò 768 + copy trọng số teacher

Đo trên cùng 1.500 câu VSEC giữ kín:

| Model | Tham số | MB | P | R | F1 |
|---|---|---|---|---|---|
| Teacher fp32 | 134,4M | 539,4 | 0,9169 | 0,8691 | **0,8924** |
| 768 fp32 | 77,7M | 311,5 | 0,8966 | 0,8574 | 0,8766 |
| **768 INT8** | 77,7M | **78,4** | **0,9126** | 0,8330 | **0,8710** |
| 384 INT8 | 31,8M | 32,4 | 0,8378 | 0,7309 | 0,7807 |

**768 hơn 384 tới +9,0 điểm F1 và +7,5 điểm precision**, đổi lấy 46 MB.

**Nhưng phải nói rõ phép so này không sạch.** Bản 384 chạy khi `build_model` còn
luôn khởi tạo ngẫu nhiên, nên nó không chỉ thiệt vì hidden nhỏ mà còn vì chưa hề
được copy trọng số. Đúng ra câu hỏi được trả lời ở đây là *"768 + copy trọng số
đáng giá bao nhiêu so với 384 từ đầu"*, chứ không phải *"hidden 768 đáng giá bao
nhiêu"*. Điều an ủi: 384 **không thể** copy được (lệch shape), nên đây vẫn là so
sánh đúng về mặt kỹ thuật — tốt nhất đạt được ở 32 MB so với tốt nhất ở 78 MB.

### INT8 làm precision TĂNG

Bản 768 khi lượng tử hoá mất 0,56 điểm F1 nhưng precision tăng từ 0,8966 lên
0,9126. Lượng tử hoá làm model dè dặt hơn, mất đi những dự đoán ở vùng ranh
giới — mà phần lớn trong đó vốn sai.

Hai lần trước tôi gọi INT8 là "gần như miễn phí". Chưa đúng: ở bản 768 nó **có
lợi** cho đúng chỉ số quan trọng nhất của sản phẩm.

### Trong trình duyệt

| | 384 INT8 | 768 INT8 |
|---|---|---|
| Nạp | 375 ms | 325 ms |
| p50 / p95 | 6,6 / 8,0 ms | 15,6 / 18,7 ms |
| Bắt được | 4/6 | 4/6 |
| **Báo động giả** | **2** | **0** |

Chậm hơn 2,3 lần nhưng vẫn cách rất xa ngưỡng cảm nhận 100 ms, nên tốc độ không
phải yếu tố quyết định. **Không còn báo động giả nào** mới là điểm đáng giá.

Hai ca trượt vẫn là văn bản không dấu hoàn toàn — giới hạn cố hữu, vì model dựa
vào ngữ cảnh mà cả câu mất dấu thì ngữ cảnh cũng hỏng.

---

### 22. train.py nên giữ checkpoint TỐT NHẤT, không phải mới nhất

Mỗi epoch ghi đè vào cùng một thư mục, nên epoch 2 xoá epoch 1. Suýt mất
checkpoint epoch 1 khi đang cân nhắc dùng nó vì precision.

Với sản phẩm ưu tiên precision, epoch cuối **không nhất thiết** là epoch tốt
nhất. Trước đây phải copy tay (`out/student768_ep1`).

**Đã sửa.** `--select {f1,precision,none}` (mặc định `f1`) giữ thêm bản tốt nhất
vào `<out>/best`, kèm `<out>/epochs.json` ghi số đo từng epoch.

**Vì sao `best` là thư mục con chứ không phải ghi đè `<out>`:** `--resume` nạp
lại optimizer và scheduler từ `trainer_state.pt`, vốn thuộc về epoch **cuối**.
Nếu `<out>` giữ trọng số của epoch tốt nhất còn `trainer_state.pt` giữ trạng
thái epoch cuối thì resume ghép nhầm hai thứ — lại đúng loại lỗi im lặng: không
crash, chỉ học kém đi. Nên `<out>` = epoch cuối (khớp với trạng thái), `<out>/best`
= epoch tốt nhất (bản đem đi xuất ONNX). Mỗi bản đều tự chứa `tags.json` và
`train_meta.json` để `export_onnx.py` không phải đoán `max_len`.

**Hoà điểm thì chọn epoch SAU**, vì nó trùng với bản ở `<out>` và được train
nhiều hơn. Dùng `>` thì một model chưa học được gì — mọi epoch đều F1 0 — sẽ báo
"epoch 0 tốt nhất" rồi kèm cảnh báo sai rằng epoch cuối không phải bản đáng ship.
Bắt được lỗi này bằng một lần chạy thử 2 epoch trên 256 mẫu.

**Chỗ phải cẩn thận, và nó mâu thuẫn với chính quyết định 16:** số dùng để xếp
hạng là số trên **dev tự sinh**, thứ đã ba lần nói dối trong dự án này. Nên
`best` chỉ là **xếp hạng sơ bộ**, không phải phán quyết. Cả `best.json` lẫn dòng
in cuối buổi train đều nói thẳng điều đó và đưa sẵn lệnh chấm lại trên VSEC giữ
kín. Tự động hoá một lựa chọn bằng thước đo mình đã biết là dối trá thì phải nói
rõ, chứ không được để người sau tưởng con số đó chốt được.

---

### 23. Đo báo động giả trên văn bản ĐÚNG — con số cả dự án chưa từng có

Mọi số F1 trong repo đều đo trên câu **có sẵn lỗi**, bằng **argmax không
ngưỡng**. Chúng trả lời "khi có lỗi thì model sửa đúng bao nhiêu phần". Chúng
không trả lời câu hỏi mà người dùng sống cùng mỗi ngày, và là câu hỏi quyết
định họ có gỡ cài hay không:

> Tôi viết đúng. Bao lâu một lần thì nó gạch chân oan?

`false_alarm.py` dựng lại **đúng** phép quyết định của `onnxEngine.js` (softmax
chỉ trên tập nhãn hợp lệ, p ≥ 0,90 **và** hơn KEEP ≥ 0,25) rồi chạy trên văn bản
không có lỗi. Kiểm chứng bản port trước khi tin nó: chạy lại 6 câu mẫu của
`dev/onnx-test.html` ra **đúng 4/6, 0 báo động giả** — trùng khít số trình duyệt.

Hai nguồn văn bản đúng, cố tình khác miền:

| Nguồn | Câu | Câu bị gạch oan | Trên số từ |
|---|---|---|---|
| Wikipedia sạch (test, chưa từng train) | 2.000 | 28 = **1,40%** | 0,054% |
| VSEC nửa giữ kín, câu đã sửa đúng | 2.000 | 24 = **1,20%** | 0,042% |

### Nhưng con số máy đếm là CHẶN TRÊN, không phải sự thật

Văn bản "sạch" không sạch. Đọc tay cả 54 lần gạch chân
([docs/false_alarm_review.md](false_alarm_review.md), để nguyên ngữ cảnh để ai
cũng phán lại được):

| Phán | Số | |
|---|---|---|
| **OAN** — văn bản đúng, model báo bậy | **31** | báo động giả thật |
| ĐÚNG — văn bản sai thật, model bắt trúng | 14 | `cứ trú`→`cư trú`, `nỗi danh`→`nổi danh`, `thực vât`→`thực vật` |
| NỬA — chỗ đó sai thật nhưng đề xuất sai | 7 | `đinh tam giác` (phải là `đỉnh`) → model đoán `định` |
| ? — ngữ cảnh cắt cụt | 2 | |

**26% số "báo động giả" hoá ra là model bắt đúng lỗi trong văn bản được coi là
sạch.** Wikipedia có lỗi chính tả thật, và câu đã-sửa-đúng của VSEC vẫn còn lỗi
người gán nhãn bỏ sót. Ai chỉ chạy script rồi lấy số máy đếm sẽ tự bôi đen mình
gần gấp đôi.

**Tỷ lệ báo động giả thật: 0,85% (Wikipedia) và 0,70% (VSEC)** — khoảng **một
câu trong 120–140**. Người viết content 50 câu mỗi ngày gặp một lần gạch oan
chừng hai đến ba ngày. Không dễ chịu, nhưng không phải thứ chặn việc ship.

### Ngưỡng mua được gì, và giá bao nhiêu

Cùng model INT8, cùng 1.500 câu VSEC giữ kín (khối trong tầm) cho P/R/F1, cùng
2.000 câu đúng cho phần báo oan:

| Ngưỡng | P | R | F1 | Oan (wiki) | Oan (VSEC) |
|---|---|---|---|---|---|
| argmax, không ngưỡng | 0,9126 | 0,8330 | 0,8710 | 2,40% | 2,50% |
| **0,90 / 0,25 ← đang chạy** | **0,9556** | 0,7553 | 0,8437 | 1,40% | 1,20% |
| 0,95 / 0,25 | 0,9615 | 0,7181 | 0,8222 | 1,10% | 0,80% |
| 0,99 / 0,25 | 0,9822 | 0,5862 | 0,7342 | 0,60% | 0,60% |

Ngưỡng sản phẩm **giảm một nửa số báo oan** (2,4% → 1,4%) và đẩy precision
0,9126 → 0,9556, trả giá 7,8 điểm recall. Đây là con số người dùng thật sự
thấy, và trước hôm nay chưa ai đo — `evaluate.py` giờ nhận `--threshold` và
`--margin` để đo lại được (mặc định 0, giữ nguyên mọi số đã báo cáo).

### Phát hiện quan trọng nhất: model TỰ TIN KHI SAI

Trung vị độ tin cậy của 31 ca oan là **0,981**. 19/31 ở p ≥ 0,95, và **12/31 ở
p ≥ 0,99**.

Nghĩa là **nâng ngưỡng không phải cách sửa sạch**. Từ 0,90 lên 0,99 đúng là hạ
báo oan còn một nửa, nhưng recall rơi 0,7553 → 0,5862 — mất hơn một phần năm số
lỗi bắt được, để đổi lấy chưa tới một phần trăm câu. Độ tin cậy của model **không
phải** thước đo model đúng hay sai; dùng nó làm núm vặn thì vặn tới đâu cũng
đang đánh đổi mù.

**Chỗ oan tập trung vào đâu — và đây mới là hướng sửa:**

- **Tên riêng**: `Hoàng Văn Nhủng`, `Tiểu Đương Giang`, `Thủy Biều`, `Đảo bảo tàng`
- **Thuật ngữ chuyên ngành**: `thanh cái` (điện lực), `sổ chi tiết` (kế toán),
  `dư lượng`, `bình phong`, `băng hình`, `điêu bảo`, `trưởng tràng`
- **Từ nước ngoài** trong câu song ngữ: `no` (yes/no)
- **Từ thường gặp ở ngữ cảnh lạ**: `nhưng`, `năm`, `nắm`, `cỏ`, `Nêu`, `Ôn`, `vơi`

Cả bốn nhóm đều là chỗ **từ điển mỏng còn ngữ cảnh hiếm**. Từ điển 7.214 âm tiết
rút từ corpus chỉ chặn được ứng viên không tồn tại; nó không nói gì khi **cả hai
dạng đều là từ thật** — mà đó đúng là toàn bộ 31 ca oan. Hướng đáng thử tiếp
là **tỷ lệ tần suất**: nếu dạng gốc phổ biến hơn hẳn dạng đề xuất thì đòi bằng
chứng mạnh hơn. Chưa làm, và chưa đo.

---

### 24. Tầng model chết im lặng vì thiếu một dòng trong manifest

Cài thật vào Chrome, gõ trên Facebook thật, bằng một câu **cố ý chọn để tầng
luật không bắt được** (`Hơn một nửa dân số cứ trú...`). Không có gạch chân nào.

Hai lỗi chồng lên nhau, cả hai đều không crash.

**Lỗi 1 — thiếu `vendor/*` trong `web_accessible_resources`.** Khai báo có
`src/engine/*.js`, `src/content/*.js`, `models/*` — quên `vendor/`. Content
script gọi `import(base + 'vendor/ort.wasm.bundle.min.mjs')`, Chrome chặn vì
tài nguyên không web-accessible, `load()` bắt lỗi rồi ghi một dòng `console.warn`,
và extension chạy tiếp bằng tầng luật như không có chuyện gì.

Hậu quả: extension **vẫn cài được, vẫn gạch chân được, vẫn trông như đang hoạt
động** — chỉ là tầng model 78 MB không bao giờ sống. Người dùng không có cách
nào biết.

**Lỗi 2 — không soát lại khi model nạp xong.** `index.js` gọi `model.load()`
rồi bỏ đó. Người dùng gõ xong trước khi model sẵn sàng thì lần soát cuối đã
thoát sớm ở `if (!model.ready) return`, và không có gì chạy lại. Sửa bằng cách
giữ promise rồi soát lại ô đang focus khi nó resolve.

### Vì sao không phép đo nào trước đây thấy

`dev/onnx-test.html` chạy qua `http://localhost`, không qua `chrome-extension://`
nên **luật web-accessible không áp dụng**. `false_alarm.py` và `evaluate.py` nạp
model thẳng từ đĩa bằng onnxruntime Python. Cả ba đều chủ động chạy **sau khi**
model sẵn sàng.

Nghĩa là F1 0,8710, precision 0,9556, báo động giả 0,70–0,85% — tất cả đều đúng,
và tất cả đều đo một đường dẫn mà **sản phẩm thật không đi qua**. Không con số
nào trong repo có thể phát hiện chuyện này.

**Bài học, và nó khác với bài học về benchmark tự sinh:** quyết định 16 nói
_đừng tin thước đo của mình_. Chỗ này nói thêm một tầng — thước đo đúng đến mấy
cũng chỉ đo được thứ nó chạm tới, và môi trường thật có những ràng buộc không
môi trường đo nào tái lập: luật web-accessible của Chrome, thứ tự nạp, tốc độ gõ
của người thật. **Phải cài vào máy thật và dùng thử như người dùng.**

### Bài test đáng giá

`test/manifest.test.mjs` đối chiếu mọi `base + '...'` trong `index.js` với các
pattern `web_accessible_resources`, cộng thêm danh sách file mà onnxruntime tự
nối đường dẫn rồi tải lúc chạy — thứ không phép quét tĩnh nào thấy được.

Đã kiểm chứng nó bắt được đúng lỗi này: bỏ `vendor/*` ra khỏi manifest thì 2/4
test đỏ ngay, kèm tên file thiếu. Một bài test không chứng minh được là nó bắt
được lỗi thật thì chưa phải bài test.

---

### 25. Lượng tử hoá per-channel, và cái giá của INT8 lớn hơn báo cáo cũ 9 lần

Chẩn đoán bằng `diagnose.py` — chia 230 ca bỏ sót ở ngưỡng sản phẩm thành hai
nhóm có cách sửa khác hẳn nhau:

| | Số ca | Cách sửa |
|---|---|---|
| Đoán **đúng** nhãn, chỉ thiếu tự tin | 163 (71%) | ngưỡng / lượng tử hoá — vài phút |
| Đoán **sai**, hoặc nhãn đúng không nằm trong ứng viên | 67 (29%) | train lại — vài tiếng GPU |

Phần lớn là nhóm thứ nhất, nên trước khi tiêu giờ GPU phải vắt hết nhóm này.

### INT8 per-tensor tốn 45 ca, không phải "gần như miễn phí"

Chạy cùng `diagnose.py` lên bản fp32 để loại trừ nghi phạm:

| Bản | Bắt được (ngưỡng sản phẩm) |
|---|---|
| fp32 | 755/940 |
| INT8 **per-tensor** | 710/940 |
| INT8 **per-channel** | **747/940** |

Quyết định 19 và 21 ghi INT8 "gần như miễn phí" — **đo bằng argmax không
ngưỡng**, ở đó nó chỉ kém 0,56 điểm F1. Ở ngưỡng sản phẩm nó tốn **45 ca, tức
4,8 điểm recall** — gấp gần 9 lần. Lượng tử hoá không làm đổi thứ hạng nhãn,
nó làm xác suất TỤT; argmax không thấy gì còn ngưỡng thì thấy hết.

Đây là lần thứ hai trong dự án phải sửa lại một kết luận vì nó đo ở chế độ mà
sản phẩm không chạy. Lần trước là dev tự sinh (quyết định 16), lần này là
argmax không ngưỡng.

**per-channel cứu 37 trong 45 ca** — mỗi cột trọng số một hệ số tỷ lệ riêng
thay vì một hệ số chung cho cả ma trận. Loại thêm head phân loại ra khỏi lượng
tử hoá không thay đổi gì (747 y nguyên), nên bỏ.

### Ngưỡng phải đổi CÙNG LÚC, không thì mất precision

per-channel trả lại phần xác suất mà per-tensor làm tụt, nên ngưỡng 0,90 cũ bỗng
lỏng hơn ý định ban đầu:

| Cấu hình | P | R | F1 | Báo oan (wiki / VSEC) | Gói nén |
|---|---|---|---|---|---|
| per-tensor @0,90 — bản cũ | 0,9556 | 0,7553 | 0,8437 | 1,40% / 1,20% | 49,8 MB |
| **per-channel @0,95 — đang dùng** | **0,9550** | **0,7670** | **0,8507** | **1,25% / 1,30%** | **58,6 MB** |
| per-channel @0,90 | 0,9420 | 0,7947 | 0,8621 | 1,45% / 1,50% | 58,6 MB |
| per-tensor @0,80 | 0,9448 | 0,7830 | 0,8563 | 1,50% / 1,45% | 49,8 MB |

**Chọn hàng 2:** giữ precision đúng mức cũ (0,9550 so với 0,9556) mà hơn 1,2
điểm recall, và báo oan trên Wikipedia còn giảm. Hai hàng dưới đều mua recall
bằng precision — đúng thứ quyết định 3 nói không được làm.

**Cái giá phải nói rõ: +8,8 MB gói nén.** Kích thước thô chỉ tăng 0,1 MB, nhưng
hệ số tỷ lệ theo từng cột làm trọng số khó nén hơn hẳn, và người dùng tải về
bản nén. Suýt báo "gần như miễn phí" lần nữa vì nhìn nhầm vào con số thô — đúng
loại sai lầm mà mục trên vừa ghi lại.

### Còn lại: lớp phụ âm, và VSEC không đo được nó

Chia recall theo lớp lỗi thì lộ ra chỗ yếu thật:

| Nhóm | Bắt được |
|---|---|
| Thanh điệu (mất dấu, sai dấu, hỏi/ngã) | 682/867 = **78,7%** |
| Phụ âm và âm cuối (ch/tr, s/x, d/gi/r, n/ng) | 28/73 = **38,4%** |

Trong đó `d_gi_r` — lớp của `dành`/`giành`, ví dụ đầu bảng trong README — bắt
được **0/8**. Một mình n=8 không kết luận được, nhưng gộp cả nhóm phụ âm thì
n=73, đủ để tin.

Nguyên nhân nằm ngay trong `class_weights.json`: d/gi/r cộng lại chỉ **0,92%**
số lỗi sinh ra, `R_GI` và `GI_R` mỗi cái 0,03%. Model gần như không được học.

**Và đây là chỗ tréo ngoe:** trọng số đó ĐÚNG — nó đo từ VSEC, và đo phân bố
thật đáng +9,2 điểm F1 (quyết định 16). Nhưng VSEC thu lỗi từ người **gõ**, còn
sản phẩm nhắm người **không biết viết thế nào** (quyết định 14 đã ghi rõ). Phân
bố đúng cho corpus lại bỏ đói đúng lớp làm nên điểm khác biệt của sản phẩm.

Nên bước tiếp theo không phải "train thêm cho F1 cao hơn", mà là hai việc đi
kèm nhau: **cân lại trọng số lớp** khi sinh dữ liệu, và **dựng một tập chấm
riêng cho đồng âm** — vì với n=8, VSEC không thể nói cho biết việc đó có hiệu
quả hay không.

---

### 26. Cân lại lớp phụ âm: +15,7 điểm, và một đánh đổi phải nói thẳng

Quyết định 25 để lại một chỗ yếu đo được: recall phụ âm 25,7% so với thanh điệu
78,7%, riêng `d_gi_r` — lớp của `dành`/`giành`, ví dụ đầu bảng trong README —
chỉ 6,2%.

### Thước đo phải dựng TRƯỚC

VSEC chỉ có 8 ca `d_gi_r`. Train xong mà chấm bằng n=8 thì không biết tốt lên
hay tệ đi, nên `consonant_eval.py` phải có trước một dòng train nào.

Cách dựng: khai cặp nhầm lẫn từ **chính từ điển** (âm tiết `a` có thật, đổi phụ
âm ra `b` cũng có thật — đúng lớp bài toán mà từ điển bó tay), rồi ghép vào câu
Wikipedia thật lấy từ `data/test.jsonl` mà model chưa từng thấy. **Không tự viết
câu mẫu:** viết tay thì tập chấm phản ánh giả định của tôi về chỗ model sai chứ
không phản ánh tiếng Việt — đúng cái bẫy quyết định 14 đã mắc. Giới hạn mỗi từ 3
ca để "đo lớp d/gi/r" không hoá ra "đo mỗi chữ giành".

**1.796 ca, cân đều 16 nhãn, riêng d/gi/r có 596 ca thay vì 8.**

Đo **hai** con số, và con số thứ hai mới giữ cho phép đo lương thiện: recall, và
báo oan trên chính câu gốc chưa đụng vào. Không có cái thứ hai thì chỉ cần model
báo bừa mọi phụ âm là recall đẹp ngay.

### Trộn 50/50 làm loãng lớp thanh điệu

Dữ liệu bổ sung chỉ chứa lỗi phụ âm, trọng số trong lớp lấy **căn bậc hai** của
tỷ lệ đo được rồi chuẩn hoá — giữ đúng thứ tự phổ biến thật nhưng nén khoảng
cách 60 lần giữa `N_NG` và `R_GI` xuống còn 8 lần. Cào bằng hoàn toàn thì model
học một thế giới không có thật.

Fine-tune từ `student768` chứ không train lại từ đầu: phần thanh điệu đang tốt
thì không nên đụng vào.

| Bản | Trộn | VSEC P | VSEC R | VSEC F1 | Phụ âm | Báo oan |
|---|---|---|---|---|---|---|
| v1 @0,95 | — | 0,9550 | 0,7670 | 0,8507 | 25,7% | 1,25% / 1,30% |
| v2 @0,95 | 50% | 0,9703 | 0,6947 | 0,8097 | 48,6% | 1,35% / 1,20% |
| v2 @0,85 | 50% | 0,9591 | 0,7734 | 0,8563 | 55,8% | 1,75% / 1,85% |
| **v3 @0,95** | **25%** | **0,9600** | 0,7404 | 0,8360 | **41,4%** | **1,45% / 1,25%** |
| v3 @0,90 | 25% | 0,9505 | 0,7755 | 0,8541 | 46,1% | 1,65% / 1,75% |

v2 (50% phụ âm) mất **7,2 điểm** recall VSEC — lớp thanh điệu chiếm 91% lỗi
thật, pha loãng nửa dữ liệu là quá tay. Phải hạ ngưỡng xuống 0,85 mới bù lại
được, mà hạ ngưỡng thì báo oan lên 1,75%/1,85%.

**Đã thử ngưỡng theo lớp** (thanh điệu 0,85, phụ âm 0,95) để cứu: ra
1,60%/1,75%, vẫn cao hơn v1. Nghĩa là báo oan tăng **không** do phụ âm mà do
phải hạ ngưỡng thanh điệu. Bỏ hướng đó.

### Chọn v3 @0,95, và cái giá của nó

**Báo oan không đổi** — 29 so với 25 câu trên 2.000, chênh 4 câu nằm gọn trong
nhiễu (độ lệch chuẩn ≈ 5). Precision nhích lên 0,9600. Recall phụ âm 25,7% →
**41,4%**, tức hơn 60% tương đối.

**Cái giá: recall VSEC 0,7670 → 0,7404, mất 2,7 điểm.** Trên một corpus phân bố
như đời thật thì v3 bắt được **ít lỗi hơn** v1 — 696 so với 721 trên 940. Đây là
đánh đổi thật, không phải chiến thắng sạch, và phải ghi đúng như vậy.

**Vì sao vẫn chọn:** VSEC thu lỗi từ người **gõ**; sản phẩm nhắm người **không
biết viết thế nào** (quyết định 14). Nếu người dùng thật mắc lỗi phụ âm và đồng
âm nhiều hơn tỷ lệ VSEC gợi ý — và cả tiền đề sản phẩm đặt cược vào điều đó —
thì v3 thắng cho họ. Nếu không thì v1 đúng hơn.

**Không phép đo offline nào phân xử được chuyện này.** Nhưng popup đã đếm sẵn
`byTag`, nên người dùng thật sẽ trả lời: nhóm lỗi nào được chấp nhận nhiều nhất
chính là câu trả lời. Đây là lần đầu trong dự án một quyết định phải chờ người
dùng thật mới khép lại được.

---

### 27. Đẩy riêng lớp d/gi/r — ngưỡng chấp nhận ghi TRƯỚC khi có số

Quyết định 26 để lại lớp `d/gi/r` ở recall 17,8% (106/596), thấp nhất trong sáu
nhóm phụ âm, mà nó lại đúng là ví dụ đầu bảng của README: `dành` / `giành`.

#### Chẩn đoán trước, không train trước

`consonant_eval.py` nói "bao nhiêu". `consonant_diagnose.py` — viết mới cho đợt
này — nói "vì sao", và câu trả lời đổi hẳn hướng sửa:

| Kết cục | Ca | | |
|---|---|---|---|
| sửa đúng | 106 | 17,8% | |
| sót, nhãn đúng đã dẫn đầu | 241 | 40,4% | p trung vị **0,099** |
| sót, model nhìn sang chỗ khác | 201 | 33,7% | p của nhãn đúng **0,0014** |
| sửa sai | 48 | 8,1% | **45/48 bắn sang nhãn THANH ĐIỆU** |

Ba điều không nhìn từ recall mà thấy được:

1. Gọi 241 ca kia là "thiếu tự tin" là quá tử tế. p trung vị 0,099 nghĩa là
   nhãn đúng chỉ dẫn đầu trong đám non-KEEP, còn KEEP vẫn áp đảo. Hạ ngưỡng
   xuống 0,90 cứu được **26 ca trong 241**. Phần còn lại phải học.
2. Với 201 ca còn lại, nhãn đúng nhận p = 0,0014. Model không do dự giữa hai
   phương án — nó không có phương án đúng trong tầm nhìn.
3. Và phần đáng giá nhất: trong 48 ca sửa sai, **45 ca bắn sang một nhãn thanh
   điệu**, chỉ 3 ca nhầm sang phụ âm khác — ở p = 0,98:

   ```
   dơi  -> đúng rơi  | model chọn TONE_HUYEN p=0,982  (p của D_R  = 0,016)
   day  -> đúng ray  | model chọn TONE_NGA   p=0,979  (p của D_R  = 0,000)
   giáo -> đúng ráo  | model chọn TONE_NGANG p=0,983  (p của GI_R = 0,000)
   ```

Model **không** lẫn `d` với `r`. Nó bỏ hẳn hướng phụ âm rồi với tay sang lớp
chiếm 91% lỗi trong dữ liệu train. Đó là vấn đề **tiên nghiệm của đầu ra**, và
ngưỡng không sửa được — đặt ngưỡng nào thì 0,98 cũng vượt. Chỉ tỷ lệ dữ liệu
sửa được. Nên đợt này đẩy tỷ lệ, không chỉnh ngưỡng lần nữa.

#### Hai con số của quyết định 26 đo lại thì khác

* Bàn giao ghi d/gi/r chiếm ~1,5% dữ liệu train. Đếm thẳng trên
  `data_ft25/train.jsonl` thì là **3,08%** — con số 1,5% chỉ tính nhãn `D_GI`,
  bỏ năm nhãn còn lại của lớp.
* **Trọng số lớp trong `noise.py` là CHẶN TRÊN, không phải thứ đặt là được.**
  `corrupt_tokens` bốc lớp lỗi trước rồi mới bốc token, nhưng chỉ bốc trong
  những lớp **có mặt** ở câu đang xét. Lớp d/gi/r đòi âm tiết bắt đầu bằng
  d/gi/r mà đổi phụ âm ra vẫn là từ thật — điều kiện hiếm. Nên cấu hình 20,2%
  chỉ ra 11,07% thật, và cấu hình 80% cho đợt này chỉ ra 47%. Từ giờ đọc phân
  bố **đo được**, đừng đọc file cấu hình.

#### Trộn một biến, không trộn hai

v2 thất bại vì đẩy phụ âm lên 50% làm loãng lớp thanh điệu — thứ chiếm 91% lỗi
thật. Nên đợt này **giữ nguyên tổng tỷ lệ phụ âm ở mức v3** và chỉ đổi thành
phần bên trong nó:

| | tổng phụ âm | riêng d/gi/r |
|---|---|---|
| v3 (`data_ft25`) | 29,60% | 3,08% |
| v4 (`data_ft_dgir`) | **28,62%** | **7,42%** |

Phần d/gi/r tăng lấy từ các nhóm phụ âm khác, **không** lấy từ lớp thanh điệu.
Nếu recall VSEC vẫn tụt thì nguyên nhân không thể là pha loãng thanh điệu, và
đó là thông tin — khác với v2, nơi hai biến đổi cùng lúc nên không quy được
trách nhiệm.

Mix dựng bằng `mix_datasets.py`, viết mới cho đợt này vì **bản v3 đang ship
được trộn bằng tay trong shell và không dựng lại được**: không ghi pool nào lấy
bao nhiêu dòng, seed nào. Một con số không dựng lại được thì không phải phép đo.
Lệnh của v4:

```bash
python dataset.py --corpus data/corpus.txt --out data_dgir --variants 1 \
  --class-weights data/class_weights_dgir.json --seed 13
python mix_datasets.py --pool data:304356 --pool data_cons:45389 \
  --pool data_dgir:50255 --out data_ft_dgir --seed 13
```

`--seed 13` là bắt buộc, không phải thói quen: `dataset.py` dùng cùng seed cho
việc chia train/dev/test. Đổi seed là đổi phép chia, và câu đang nằm trong
`test.jsonl` có thể lọt sang train — tức tự làm rò rỉ thước đo của chính mình.

#### Ngưỡng chấp nhận — ghi ở commit này, TRƯỚC khi v4 train xong

Đây là chỗ dự án này đã tự lừa mình nhiều lần: đo xong rồi mới chọn con số nào
đáng kể. Nên lần này viết trước, và commit trước, để lịch sử git làm chứng cho
thứ tự. Mốc nền là số **tự đo lại**, không phải số chép từ bàn giao — v3 tái lập
đúng P 0,9600 · R 0,7404 · F1 0,8360 (tp 696, fp 29, fn 244).

Sai số chuẩn tính theo `sqrt(p(1-p)/n)` trên đúng cỡ mẫu của từng phép đo:

| Thước đo | v3 | Điều kiện để v4 thay v3 | Vì sao mốc đó |
|---|---|---|---|
| recall d/gi/r (n=596) | 17,8% | **≥ 22,8%** (+5 điểm) | σ = 1,6 điểm; +5 là ~3σ, dưới mức đó thì không phân biệt được với nhiễu |
| precision VSEC trong tầm | 0,9600 | **≥ 0,9500** | ranh giới cứng. Quyết định 25 nâng ngưỡng lên 0,95 chính là để giữ precision ở mức này; bỏ nó là phá lại việc cũ |
| recall VSEC trong tầm | 0,7404 | **≥ 0,7254** (−1,5 điểm) | σ = 1,4 điểm. v3 đã trả 2,7 điểm so với v1; trả thêm quá 1σ nữa là cộng dồn thành cái giá không còn biện hộ được |
| báo oan văn bản đúng | 1,45% / 1,25% | **≤ 2,00%** cả hai nguồn | σ = 0,27 điểm; 2,00% là ~2σ |
| recall phụ âm toàn bộ (n=1796) | 41,4% | **≥ 40,2%** | σ = 1,2 điểm. Phần d/gi/r tăng lấy từ nhóm khác, nên nhóm khác tụt là dự kiến — nhưng tổng không được tụt |
| sửa sai d/gi/r | 8,1% | **≤ 10%** | đây là lỗi precision, thứ người dùng nhìn thấy (quyết định 8) |

Trượt bất kỳ dòng nào thì **v3 ở lại**, và kết quả v4 vẫn ghi vào đây — một đợt
train thất bại đã được ghi lại vẫn rẻ hơn một đợt train thất bại bị bỏ quên rồi
có người làm lại.

#### Kết quả: sáu trên sáu, và không phải đánh đổi

Lần đầu trong dự án một đợt train qua hết mọi điều kiện, và qua theo hướng
không ai trong hai bản trước đạt được — **precision tăng chứ không giảm**:

| Thước đo | v3 | v4 | Ngưỡng đã ghi trước | |
|---|---|---|---|---|
| recall d/gi/r (n=596) | 17,8% | **28,5%** | ≥ 22,8% | qua, +10,7 điểm |
| precision VSEC trong tầm | 0,9600 | **0,9749** | ≥ 0,9500 | qua, *tăng* |
| recall VSEC trong tầm | 0,7404 | **0,7426** | ≥ 0,7254 | qua, *tăng* |
| F1 VSEC trong tầm | 0,8360 | **0,8430** | — | +0,7 điểm |
| báo oan văn bản đúng | 1,45% / 1,25% | **1,30% / 1,00%** | ≤ 2,00% | qua, *giảm cả hai* |
| recall phụ âm toàn bộ (n=1796) | 41,4% | **43,3%** | ≥ 40,2% | qua |
| sửa sai d/gi/r | 8,1% (48 ca) | **5,2%** (31 ca) | ≤ 10% | qua, *giảm* |

Độ trễ và dung lượng không đổi: p50 5,5ms (v3: 5,4ms), gói nén vẫn 58,6 MB —
INT8 cùng kiến trúc thì cùng kích thước.

#### Vì sao precision lại TĂNG — chẩn đoán đã đoán trước chuyện này

Chỗ đáng học của đợt này. VSEC precision đi từ 0,9600 lên 0,9749, số lần báo
sai từ **29 xuống 18** trên cùng tập. Bình thường đẩy recall một lớp thì
precision phải trả giá. Ở đây không, và lý do nằm đúng trong bảng chẩn đoán ở
trên: **45 trong 48 ca sửa sai của v3 là nhãn thanh điệu bắn ở p = 0,98 tại
đúng vị trí mà đáp án là một phép đổi phụ âm.** Những ca đó không phải "bỏ sót"
— chúng là **báo sai**. Dạy model rằng ở vị trí đó có một giả thuyết phụ âm
đáng cân nhắc thì đồng thời dập bớt loại báo sai đó.

Nói cách khác: tiên nghiệm lệch về thanh điệu vừa làm mất recall của lớp phụ
âm, vừa **sinh ra** false positive ở chính những vị trí ấy. Sửa một nguyên
nhân, hai con số cùng tốt lên. Bảng chẩn đoán trước/sau:

| | v3 | v4 |
|---|---|---|
| sửa đúng | 106 | **170** |
| sót, nhãn đúng dẫn đầu | 241 (p trung vị 0,099) | 244 (p trung vị **0,257**) |
| sót, nhìn sang chỗ khác | 201 (p nhãn đúng 0,0014) | **151** (p nhãn đúng 0,0090) |
| sửa sai | 48 (45 sang thanh điệu) | **31** (25 sang thanh điệu) |

Cả bốn ô đều đi đúng hướng mong đợi. Đáng chú ý là ô "nhãn đúng dẫn đầu" gần
như không đổi về số ca (241 → 244) nhưng p trung vị tăng 2,6 lần — model chưa
vượt ngưỡng ở đó, nhưng đã nghiêng về đáp án đúng mạnh hơn nhiều. Đó là phần
còn lại để dành cho đợt sau.

#### Cái giá, vì luôn phải nói ra

Các nhóm phụ âm khác **có** trả giá, đúng như thiết kế: phần dữ liệu d/gi/r
tăng lấy từ họ.

| Nhóm | v3 | v4 | |
|---|---|---|---|
| d/gi/r | 17,8% | 28,5% | +10,7 |
| c/t | 60,4% | 62,1% | +1,7 |
| ch/tr | 48,3% | 46,7% | −1,6 |
| n/ng | 63,3% | 60,8% | −2,5 |
| s/x | 48,3% | 44,2% | −4,1 |
| l/n | 45,4% | 39,6% | −5,8 |

Tính theo số ca: d/gi/r sửa đúng thêm **64 ca**, năm nhóm còn lại mất **30
ca**, tổng +34.

Đọc cho đúng mức: σ của một nhóm 240 ca là 3,2 điểm, nên riêng lẻ thì mức tụt
của `l/n` (−5,8 điểm) mới là ~1,8σ và `s/x` là ~1,3σ — **chưa** đủ để kết luận
từng nhóm. Nhưng bốn trong năm nhóm cùng tụt, và cùng tụt là đúng thứ cơ chế
"lấy bớt dữ liệu của họ" dự đoán. Nên coi đây là cái giá thật, cỡ nhỏ, chứ
không coi là nhiễu.

Và **recall d/gi/r 28,5% vẫn là con số thấp.** Nó tốt hơn 60% tương đối so với
v3, nhưng gần ba phần tư ca của lớp này vẫn bị bỏ sót. Đây là một bước, không
phải một cái kết.

#### Còn lại gì cho đợt sau

244 ca "nhãn đúng đã dẫn đầu mà p trung vị 0,257" là túi tiền rõ nhất, và
`consonant_diagnose.py` đã đo sẵn: hạ ngưỡng xuống 0,90 cứu 32 ca trong đó.
Nhưng quyết định 26 đã thử hạ ngưỡng rồi và báo oan lên 1,65%/1,75%. Lần này
v4 đang ở 1,30%/1,00% — **thấp hơn cả v3** — nên chỗ trống đó rộng hơn trước.
Đáng đo lại, không đáng đoán.

---

### 28. Phi từ vẫn phải qua ngưỡng 0,95 — một hướng nghe rất đúng, đo thì sai

Người dùng gõ thật trên Facebook và gửi lại ảnh màn hình:

> chúc **mựng** anh chị đã giành được phần quà **trí** giá 10 triệu **đuồng**

Extension **không gạch gì cả**. Vệt gạch dưới `đuồng` trong ảnh là spellcheck
của Chrome, không phải của sản phẩm này. Mổ ra từng chữ:

| Chữ | Đúng phải là | Sản phẩm làm gì | Vì sao |
|---|---|---|---|
| `mựng` | `mừng` | bỏ sót | model xếp p = 0,802, dưới ngưỡng 0,95 |
| `trí giá` | `trị giá` | bỏ sót | model không xếp nhãn nào lên đầu |
| `đuồng` | `đồng` | **không bao giờ bắt được** | `uô→ô` là đổi phẩm chất nguyên âm, ngoài 23 nhãn |
| `giành được` | *(đúng)* | im lặng ✓ | |

`đuồng` nằm trong 45,5% lỗi VSEC mà bộ nhãn không biểu diễn được, cùng rổ với
`bức→bước` — giới hạn kiến trúc, không phải lỗi.

#### Giả thuyết: cổng đang đối xử với hai tình huống khác hẳn nhau như một

`mựng` **không phải từ tiếng Việt**. Tầng ① đã biết điều đó — nó là một phép tra
từ điển. Và `mựng` có **đúng một** ứng viên có thật là `mừng`. Nên KEEP ở đây là
phương án **sai chắc chắn**.

Vậy mà `onnxEngine._decode` áp đúng một ngưỡng cho mọi token: `mựng` phải vượt
0,95 y như `dành` — trong khi với `dành` thì KEEP hoàn toàn hợp lệ, vì có thể
người ta thật sự muốn viết `dành`. Sản phẩm đang bắt ca DỄ chịu cái ngưỡng dựng
cho ca KHÓ.

Nghe rất thuyết phục. Và đếm từ điển thì càng thuyết phục (`oov_headroom.py`):

| | |
|---|---|
| lỗi VSEC trong tầm | 2.925 |
| token sai là phi từ, có ứng viên có thật | **726 — 24,8%** |
| trong đó có đúng một ứng viên | 172 — 5,9% |
| phi từ trong 53.322 token văn bản ĐÚNG | chỉ 47 — 0,09% |

Đọc bảng đó thì đây là món hời: một phần tư số lỗi nằm ở ca dễ, mà rủi ro ở văn
bản đúng chỉ 0,09% số token.

#### Đo thật thì hỏng, và hỏng ở mọi mức ngưỡng

`oov_gate_eval.py` chạy model thật, áp bảy luật quyết định lên **cùng một bộ
logit** nên bảy dòng so được với nhau:

| Cổng cho phi từ | P | R | F1 | báo oan |
|---|---|---|---|---|
| **P0 hiện tại (0,95 + biên)** | 0,8725 | 0,7426 | **0,8023** | **1,30%** |
| bỏ KEEP | 0,7805 | 0,7489 | 0,7644 | 2,55% |
| bỏ KEEP + bỏ qua chữ hoa | 0,7901 | 0,7489 | 0,7690 | 2,10% |
| @0,80 | 0,8455 | 0,7511 | 0,7955 | 1,40% |
| @0,85 | 0,8544 | 0,7489 | 0,7982 | 1,40% |
| @0,90 | 0,8612 | 0,7457 | 0,7993 | 1,40% |
| @0,93 | 0,8706 | 0,7447 | 0,8028 | 1,35% |

Bỏ KEEP được **+6** ca sửa đúng và trả **+96** ca báo sai — mười sáu lần bắn
nhầm cho một lần bắn trúng. Báo oan trên văn bản đúng tăng gấp đôi, 26 lên 51
câu trên 2.000.

Và cái quét ngưỡng mới là phần kết luận được: F1 **đi lên đơn điệu về phía P0**
khi ngưỡng phi từ tiến về 0,95. Điểm tốt nhất trong cả họ là @0,93 với F1 0,8028
so với 0,8023 — chênh 0,0005, tức *không phân biệt được với việc không làm gì*.
Không có điểm ngọt nào để tìm. Đây không phải "ba cấu hình thất bại", đây là cả
họ giải pháp bị P0 trội hơn.

**Kết luận không phụ thuộc vào cách đếm fp.** Scorer của file này nghiêm hơn
`evaluate.py` (nó tính fp cả ở vị trí lỗi NGOÀI tầm, chỗ `evaluate.py` bỏ qua),
nên precision ở bảng trên không so được với con số 0,9749 đã công bố. Nhưng
**recall** thì hai scorer đếm y hệt nhau, và báo oan trên văn bản đúng thì không
dùng scorer nào cả. Cả họ ngưỡng được nhiều nhất **+0,85 điểm recall** trong khi
báo oan tăng 1,30% → 1,40% ở mọi mức. Hai con số đó đủ kết luận.

#### Vì sao con số đếm từ điển nói dối

Bảng headroom đếm **726 ca mà một từ điển làm được**. Nó lặng lẽ giả định rằng
khi bị ép phải chọn, model sẽ chọn đúng ứng viên. Nó không chọn đúng: ở đúng
những vị trí đó, cái model thiếu tự tin **không phải là "có nên sửa không"** mà
là **"sửa thành cái gì"**. Bỏ KEEP không thêm cho nó tri thức nào — nó chỉ đổi
sự im lặng thành lỗi sai đầy tự tin. Khớp với thứ đã đo trước đây: model **tự
tin khi sai**, trung vị p của ca báo oan là 0,981.

Nên đây lại đúng một lần nữa cái luận điểm của cả dự án, lần này mắc vào chính
phép đo dựng ra để kiểm nó: **tôi đo một con số hoàn toàn đúng — của một đường
dẫn mà sản phẩm không đi qua.** Lần này đường dẫn tưởng tượng là "một model biết
đáp án".

#### Giữ lại gì

Giữ P0 nguyên. Hai script ở lại trong repo vì chúng là bằng chứng của một hướng
đã bị bác — lần sau ai thấy `mựng` bị bỏ sót và nghĩ ra đúng ý này thì đọc bảng
trên, đừng train lại.

Và ghi rõ ca `mựng`: model xếp nó p = 0,802, tức cổng @0,80 **có** bắt được đúng
câu người dùng gửi. Nhưng cái giá của @0,80 là −2,7 điểm precision và 129 fp so
với 102. Sửa được đúng một ca mình vừa nhìn thấy, trả bằng những ca không nhìn
thấy — đó là cách tệ nhất để chọn ngưỡng.

#### Một món nợ kỹ thuật lộ ra khi làm việc này

Luật quyết định (softmax trên nhãn hợp lệ → ngưỡng → biên so với KEEP) hiện nằm
ở **bốn** bản chép tay: `onnxEngine.js`, `evaluate.py::_gate`,
`false_alarm.py::alarms`, `consonant_eval.py::decide`. Thí nghiệm này phải viết
bản thứ năm. Đổi cổng mà quên một bản là phép đo và sản phẩm tách nhau ra âm
thầm — đúng hạng mục lỗi mà test parity `vi.js`/`vi.py` được dựng ra để chặn.
Chưa gộp, vì đợt này kết luận là **không đổi cổng**; nhưng lần sau ai định đụng
vào ngưỡng thì gộp trước, đo sau.

---

### 29. Ngưỡng riêng cho lớp phụ âm — ngưỡng chấp nhận ghi TRƯỚC khi đo

Việc số 4 của bàn giao. Ý tưởng và bằng chứng đã có từ quyết định 27:

* `consonant_diagnose.py` đo được **244 ca** d/gi/r mà nhãn đúng **đã dẫn đầu**
  nhưng chưa vượt ngưỡng, trong đó **32 ca ở p ≥ 0,90** và **56 ca ở p ≥ 0,80**.
* Ví dụ đầu bảng của README — `anh đã dành được phần quà` — model xếp
  `dành→giành` ở **p = 0,835**, tức nó đã biết, chỉ chưa dám nói.
* Báo oan của v4 đang ở **1,30% / 1,00%**, thấp hơn cả v3 lẫn v1, nên chỗ trống
  rộng hơn lúc quyết định 26 thử hướng này.

#### Vì sao đây KHÔNG phải việc quyết định 26 đã làm rồi

Quyết định 26 có thử ngưỡng theo lớp, nhưng theo **chiều ngược lại**: thanh điệu
0,85 / phụ âm 0,95. Nó ra 1,60%/1,75% báo oan và bị bỏ — *và kết luận của chính
nó* là "báo oan tăng **không** do phụ âm mà do phải hạ ngưỡng thanh điệu".

Chiều đúng là **giữ thanh điệu ở 0,95, hạ riêng phụ âm**. Chưa ai đo.

#### Và vì sao nó cũng KHÔNG phải hướng quyết định 28 vừa bác

Quyết định 28 bác việc nới cổng cho **token phi từ** — một tiêu chí dựa vào *từ
điển*. Cái đó hỏng vì ở những vị trí ấy model không thiếu tự tin, nó thiếu đáp
án: p của nhãn đúng có trung vị 0,0014.

Lần này tiêu chí dựa vào **lớp nhãn**, và số liệu ngược hẳn: ở lớp d/gi/r, nhãn
đúng **đã dẫn đầu** trong 244 ca với p trung vị 0,257, và 32 ca đã ở trên 0,90.
Đây là chỗ model *biết mà chưa dám*, không phải chỗ nó *không biết*. Hai tình
huống khác nhau, nên kết quả của 28 không định đoạt được kết quả của 29.

Nếu kết quả vẫn ra hình dạng của 28 — recall được tí chút, precision trả nhiều
— thì dừng, và ghi lại là lớp nhãn cũng không phải tiêu chí đúng.

#### Việc phải làm trước: gộp cổng về một bản

Đã làm ở `331654c`. Luật quyết định từng có **bốn** bản chép tay; đổi ngưỡng
trên bốn bản là cách chắc chắn nhất để phép đo và sản phẩm tách nhau ra. Giờ
phía Python có `gate.py`, phía JS có `onnxEngine.js`, và `test/gate.test.mjs`
canh hai bên bằng 1.200 ca — đã kiểm là test **thật sự đổ** khi cố tình làm lệch
ngưỡng JS đi 0,02.

#### Một tính chất của phép đo này, phải nói trước

Hạ ngưỡng cho một lớp chỉ **thêm** chỗ báo, không bao giờ bớt. Nên:

* recall chỉ có thể **tăng hoặc đứng yên**
* precision chỉ có thể **giảm hoặc đứng yên**
* báo oan chỉ có thể **tăng hoặc đứng yên**

Tức "recall tăng" ở đây **không** là bằng chứng của gì cả — nó là điều hiển
nhiên về mặt toán học. Câu hỏi duy nhất là phần recall thêm được có đáng cái giá
precision hay không. Đừng báo cáo phần tăng mà quên phần trả.

#### Ngưỡng chấp nhận

Mốc nền là v4 đang ship, đo ở ngưỡng dùng chung 0,95. Quét ngưỡng phụ âm ở
**0,90 / 0,85 / 0,80**, thanh điệu giữ nguyên 0,95.

| Thước đo | v4 hiện tại | Điều kiện để đổi | Vì sao mốc đó |
|---|---|---|---|
| precision VSEC trong tầm | 0,9749 | **≥ 0,9500** | ranh giới cứng từ quyết định 25 và 27. Đây là thứ không được phá |
| báo oan văn bản đúng | 1,30% / 1,00% | **≤ 1,50%** cả hai nguồn | v3 đã ship ở 1,45%/1,25%; quyết định 26 bác một cấu hình ở 1,65%/1,75%. 1,50% giữ ta không tệ hơn bản đã ship |
| recall phụ âm (n=1796) | 43,3% | **≥ 46,3%** (+3 điểm) | σ = 1,2 điểm, +3 là ~2,5σ |
| recall d/gi/r (n=596) | 28,5% | **≥ 32,5%** (+4 điểm) | σ = 1,9 điểm, +4 là ~2σ |
| sửa sai d/gi/r | 5,2% | **≤ 8,0%** | mức của v3, tức không được lùi về chỗ cũ |

Trong số mức nào qua hết, chọn mức **thấp nhất về báo oan**, không phải mức cao
nhất về recall — precision quan trọng hơn recall (quyết định 8). Không mức nào
qua thì **giữ nguyên 0,95 dùng chung**, và ghi kết quả lại y như khi nó thành
công.

#### Kết quả: cả ba mức đều qua, chọn 0,90 theo luật đã ghi trước

| Thước đo | 0,95 dùng chung | **phụ âm @0,90** | @0,85 | @0,80 | Ngưỡng |
|---|---|---|---|---|---|
| precision VSEC | 0,9749 | **0,9709** | 0,9697 | 0,9672 | ≥ 0,9500 |
| recall VSEC | 0,7426 | **0,7457** | 0,7500 | 0,7521 | — |
| F1 VSEC | 0,8430 | **0,8436** | 0,8458 | 0,8462 | — |
| báo oan | 1,30% / 1,00% | **1,35% / 1,05%** | 1,35% / 1,10% | 1,35% / 1,20% | ≤ 1,50% |
| recall phụ âm | 43,32% | **48,16%** | 51,00% | 52,45% | ≥ 46,30% |
| recall d/gi/r | 28,52% | **33,89%** | 36,58% | 37,92% | ≥ 32,50% |
| sửa sai d/gi/r | 5,20% | **5,54%** | 6,21% | 7,05% | ≤ 8,00% |

Cả ba mức qua cả năm điều kiện. Luật chọn đã ghi trước là **thấp nhất về báo
oan**, nên chọn **0,90**: đổi **0,4 điểm precision** và **0,05 điểm báo oan**
lấy **4,8 điểm recall phụ âm**.

`@0,80` cho F1 cao hơn (0,8462 so với 0,8436) và có người sẽ chọn nó. Không
giấu chuyện đó. Nhưng luật viết trước nói precision quan trọng hơn recall, và
đổi luật *sau khi nhìn số* thì việc ghi luật trước chẳng còn nghĩa gì.

Và mọi nhóm phụ âm đều lên, không nhóm nào trả giá cho nhóm nào — khác hẳn
quyết định 27, nơi d/gi/r tăng bằng cách lấy của bốn nhóm kia:

| Nhóm | trước | sau | |
|---|---|---|---|
| d/gi/r | 28,5% | 33,9% | +5,4 |
| ch/tr | 46,7% | 52,5% | +5,8 |
| c/t | 62,1% | 67,5% | +5,4 |
| l/n | 39,6% | 44,6% | +5,0 |
| n/ng | 60,8% | 64,2% | +3,3 |
| s/x | 44,2% | 47,5% | +3,3 |

Hợp lý: đây không phải cân lại dữ liệu giữa các lớp, chỉ là nới cổng cho đúng
một lớp. Số ca sửa sai trong cả tập 1.796 ca chỉ tăng từ **56 lên 59**.

Ở lớp d/gi/r, ngưỡng mới bắn thêm **34 ca: 32 đúng, 2 sai** — tỷ lệ 16:1. Ví dụ
thật:

```
Rao động về hình dáng từ cây bụi rậm rạp...   Rao→Dao   p = 0,927   (cũ: im lặng)
...có ngày dỗ Giỗ Đầu Giỗ Hết...              dỗ→giỗ    p = 0,932
GIan no ura                                    GIan→Dan  p = 0,922
```

Hai ca sai cũng ghi ra: `gianh` (đáp án `ranh`) ở p = 0,911 và `rây` (đáp án
`giây`) ở p = 0,944 — model bắn nhưng bắn nhầm nhãn.

#### Ví dụ đầu bảng của README thì VẪN chưa bắt

`anh đã dành được phần quà` đứng ở **p = 0,835**, dưới cả 0,90. Nó là lý do đợt
này được khởi động, và nó **không** được đợt này giải quyết. Phải xuống 0,80 mới
bắt, mà 0,80 thì trượt luật chọn.

Ghi rõ chỗ này vì nó dễ bị kể thành "đã sửa được ví dụ đầu bảng": chưa.

#### Hai lỗi trong chính công cụ đọc kết quả, suýt đọc sai

Cả hai nằm ở `threshold_report.py`, tức ở tầng *đọc* số chứ không phải tầng đo.

1. **File mốc nền không cùng quy ước tên** (`fa_v4_0.95.json` chứ không phải
   `fa_v4.json`). Công cụ lặng lẽ bỏ cột mốc nền đi, khiến cột `@0,90` trượt vào
   vị trí mốc nền — mà cột mốc nền thì **không được chấm theo ngưỡng**. Kết quả:
   `@0,90` hiện ra không một dấu tích nào, trông như chưa được xét, trong khi nó
   qua cả năm điều kiện. Giờ thiếu file thì script **dừng hẳn**, không bỏ cột.

2. **Luật chọn đúng vì tình cờ.** Luật là "thấp nhất về báo oan", cài bằng `min`
   trên **max** của hai nguồn — mà cả ba mức đều hoà 1,35% ở nguồn wikipedia,
   nên `min` trả về phần tử ĐẦU DANH SÁCH chứ không phải mức tốt nhất. Đáp án
   vẫn là 0,90 nhưng vì thứ tự xếp, không vì luật. Đổi sang cộng hai nguồn:
   2,40% / 2,45% / 2,55%, và 0,90 thắng vì nó thật sự thấp nhất.

Bài học: dự án này đã đo sai nhiều lần ở tầng *đo*. Đây là lần đầu suýt sai ở
tầng *đọc*, và nó cũng nguy hiểm y như vậy — một cấu hình QUA bị báo là không
có dấu tích nào thì cũng bị bỏ đi như một cấu hình trượt.

#### Kiểm chứng mặc định của sản phẩm KHỚP với cấu hình đã đo

Không đủ khi chỉ đo `@0,90` rồi sửa hằng số và tin là xong — đó đúng là khoảng
cách mà cả dự án này lấy làm luận điểm. Nên sau khi đổi mặc định, chạy lại ba
phép đo **không truyền một cờ ngưỡng nào**:

```
VSEC   @0,90 tường minh : P 0,9709  R 0,7457  F1 0,8436   tp 701  fp 21
VSEC   mặc định         : P 0,9709  R 0,7457  F1 0,8436   tp 701  fp 21
phụ âm @0,90 / mặc định : 0,481626 / 0,481626
báo oan @0,90 / mặc định: 1,35%/1,05% / 1,35%/1,05%
```

Trùng từng con số. Và kiểm trong trình duyệt thật qua wasm: `Rao→Dao` ở 92,7%
im lặng dưới cấu hình cũ, báo dưới cấu hình mới.

---

### 30. Chấm theo CÂU: một nửa số câu có lỗi thì sản phẩm im lặng hoàn toàn

Ảnh chụp màn hình của người dùng ở quyết định 28 để lại một khoảng trống mà lúc
đó tôi chỉ đặt tên chứ chưa lấp:

> Mọi phép đo của dự án đều chấm từng lỗi một, không cái nào đo "một câu người
> thật gõ thì bao nhiêu phần được sửa".

`evaluate.py` cộng tp/fp/fn trên toàn bộ vị trí. `consonant_eval.py` chấm mỗi ca
một vị trí. Cả hai trả lời "trong tất cả lỗi, bao nhiêu phần trăm được sửa" —
một câu hỏi đúng, nhưng không phải câu hỏi người dùng sống cùng. Người dùng gõ
một **câu** rồi nhìn.

#### Năm rổ

`sentence_eval.py` chia 1.483 câu VSEC giữ kín **có ít nhất một lỗi** thành:

| Rổ | Tầng model | Cả hai tầng |
|---|---|---|
| SẠCH HẲN | 38,8% | **39,2%** |
| HẾT PHẦN TRONG TẦM | 3,1% | 3,0% |
| SỬA MỘT PHẦN | 1,1% | 1,3% |
| **KHÔNG ĐỤNG** | 49,8% | **49,0%** |
| CÓ SỬA SAI | 7,1% | 7,6% |

Rổ CÓ SỬA SAI xếp cuối và tách riêng vì nó tệ nhất với người dùng: một câu vừa
sửa đúng hai lỗi vừa gạch oan một chỗ vẫn vào rổ đó, vì gạch chân nhầm một lần
là người ta gỡ cài (quyết định 8).

**Con số đáng nhìn nhất là 49,0%.** Một nửa số câu có lỗi, người dùng gõ xong và
sản phẩm không làm gì cả. Đó chính xác là thứ ảnh chụp Facebook cho thấy, và giờ
nó có một con số thay vì một giai thoại.

#### "Recall 0,7457" và "40,8%" là cùng một model

Phép đo theo câu tính ra tỷ lệ lỗi được sửa là **40,8%**, trong khi mọi tài liệu
của dự án đang ghi recall **0,7457**. Không mâu thuẫn:

    0,7457  x  0,545  =  0,406
    ^recall    ^phần VSEC mà bộ nhãn với tới được

`evaluate.py` khối B cố ý chỉ chấm phần trong tầm, và nói rõ điều đó. Khối C đã
báo sẵn con số toàn bộ. Nhưng **0,7457 là con số bị trích ra khỏi ngữ cảnh nhiều
nhất**, và người đọc CV sẽ hiểu nó là "sửa được 74,6% lỗi tôi mắc" — trong khi
con số đó là 40,8%.

Không phải lỗi tính toán. Là lỗi **chọn con số nào để đặt lên đầu**, và nó cùng
họ với mọi lần dự án này tự lừa mình.

#### Câu càng nhiều lỗi càng ít cửa

| Số lỗi trong câu | Câu | SẠCH HẲN | HẾT PHẦN TRONG TẦM |
|---|---|---|---|
| 1 | 1.292 | 42,5% | 0,0% |
| 2 | 163 | 13,5% | 26,4% |
| 3 | 19 | 15,8% | 15,8% |
| 4+ | 9 | 33,3% | 11,1% |

Xác suất một câu sạch hẳn là **tích** xác suất của từng lỗi. Recall 74,6% mỗi
lỗi thì câu hai lỗi còn ~56%, ba lỗi ~42% — và đó là chưa tính lỗi ngoài tầm bộ
nhãn, thứ làm câu **không bao giờ** sạch được. Câu người dùng gõ trên Facebook
có bốn chữ ba sai, trong đó `đuồng→đồng` nằm ngoài tầm vĩnh viễn. Câu đó không
có cửa nào.

#### Tầng luật gỡ lại được bao nhiêu — và vì sao phải hỏi

`sentence_eval.py` là Python nên **chỉ chạy được tầng model**; tầng luật là JS.
Báo cáo con số tầng model như con số sản phẩm thì đúng là kiểu nhầm mà cả dự án
này lấy làm luận điểm. Nên `dev/sentence-eval.html` chạy **cả hai tầng**, gộp
đúng thứ tự `content/index.js` gộp, trên đúng bộ câu đó.

Kết quả: tầng luật cứu thêm **13 câu** khỏi rổ KHÔNG ĐỤNG và đẩy **7 câu** vào
rổ CÓ SỬA SAI. Gần như không đổi được kết cục.

**Đừng đọc thành "tầng luật vô dụng".** VSEC thu lỗi người **gõ**, còn 137 luật
cụm nhắm lỗi **kiến thức** (`nổ lực`, `chia sẽ`) — đây đúng là quần thể mà tầng
luật được dùng tới ít nhất. Quyết định 14 đã nói chuyện này một lần rồi, và nó
áp cho cả tầng luật chứ không riêng tầng model.

#### Lại tự mắc bẫy của chính dự án, lần này ở tầng đọc dữ liệu

Lần chạy đầu cho ra tầng luật làm **tệ đi** rõ rệt: CÓ SỬA SAI 7,1% → 9,0%, SẠCH
HẲN tụt 12 câu. Kết luận sẽ là "tầng luật đang phá sản phẩm".

Sai, và sai vì cách đo. Luật **cụm** trả về một issue trải nhiều từ —
`mạnh mẻ → mạnh mẽ` trải hai từ — còn tôi so `suggestion` với **một âm tiết**
trong câu đúng. Mọi luật cụm vì thế bị đếm thành "sửa sai". Sửa cách so — ánh xạ
`[start, end)` về dải chỉ số từ rồi so với đúng dải đó — thì ra 7,6%.

Phát hiện được vì con số trông vô lý nên đi kiểm cấu trúc dữ liệu trước khi kết
luận, chứ không phải vì có test nào bắt. Cùng họ với bẫy số 11: sai ở tầng đọc
số nguy hiểm y như sai ở tầng đo.

#### Việc này đổi cách báo cáo

Từ đây mọi chỗ báo recall phải kèm mẫu số. "Recall 0,7457 trên phần bộ nhãn biểu
diễn được (54,5% lỗi VSEC), tức 40,8% tổng số lỗi" — dài hơn, và đúng. Và con số
theo câu nên đứng cạnh nó, vì nó mới là thứ người dùng gặp.

---

### 31. Model cắt cụt văn bản dài — và phép đo độ trễ che mất chuyện đó

Yêu cầu ban đầu chỉ là "đo chính xác độ trễ tầng model". Con số cũ trong tài
liệu — p50 18–24ms — đo bằng 30 lượt trên **đúng một câu 65 ký tự** ở
`dev/onnx-test.html`. Đo lại trên nhiều cỡ văn bản thì ra chuyện khác.

#### Độ trễ theo cỡ văn bản

| Độ dài | p50 | p95 | subword |
|---|---|---|---|
| 80 ký tự — một câu | 20–22ms | 26–30ms | 21 |
| 280 ký tự — bài đăng ngắn | **51–58ms** | 63–87ms | 68 |
| 700 ký tự — bài đăng dài | 73–77ms | 82–112ms | **96** |
| 2.000 ký tự | 71–80ms | 73–87ms | **96** |
| 6.000 ký tự | 71–79ms | 83–88ms | **96** |

Con số 18–24ms đang được ghi khắp tài liệu là số của **một câu**, không phải
của một bài đăng. Bài đăng thật tốn gấp ba.

Lượt suy luận **đầu tiên: 55–126ms**, và nó rơi đúng vào lúc người dùng gõ câu
đầu tiên. Gộp nó vào p50 là giấu mất đúng khoảnh khắc người dùng gặp.

Phân rã một lượt: `session.run` **98,8%**, `bpe.js` mã hoá 0,2%, giải mã và lọc
ứng viên 1,0%. Không có gì để tối ưu ngoài chính model.

#### Cột `subword` đứng yên ở 96 — và đó là một lỗi, không phải một thành tích

Nhìn bảng trên thì dễ kết luận "6.000 ký tự vẫn 71ms, model co giãn tốt". Sai.
`OnnxEngine.check()` **không chia đoạn**: nó nhét cả văn bản vào `maxLen` = 96
subword rồi cắt cụt, từ nào vượt quá thì `firstSubwordIndex` trả `-1` và vòng
lặp `continue` — không lỗi, không cảnh báo, không đếm.

| Độ dài | Tổng từ | Model xét | **Bỏ qua** | Phủ |
|---|---|---|---|---|
| 80 ký tự | 18 | 18 | 0 | 100% |
| 280 ký tự | 62 | 62 | 0 | 100% |
| **700 ký tự** | 156 | 91 | **65** | **58%** |
| **2.000 ký tự** | 448 | 91 | **357** | **20%** |
| **6.000 ký tự** | 1.342 | 92 | **1.250** | **7%** |

Với một bài đăng Facebook cỡ trung bình, **model chỉ soát nửa đầu**. Độ trễ
trông đẹp *chính vì* nó bỏ qua phần còn lại.

Đây lại đúng luận điểm của cả dự án, lần này suýt mắc ngay trong phép đo vừa
được yêu cầu: **đo một con số hoàn toàn đúng — của một đường dẫn mà sản phẩm
không đi hết.** Đo độ trễ mà không đo phạm vi phủ là tự khen một con số sinh ra
từ một lỗi.

#### Việc này sửa lại cách đọc quyết định 30

Quyết định 30 đo "49% số câu có lỗi thì sản phẩm im lặng" trên **từng câu lẻ**
của VSEC — đều ngắn, đều dưới 96 subword, nên **chưa bao giờ chạm tới chỗ cắt**.
Người dùng thật không gõ từng câu lẻ; họ gõ bài đăng nhiều câu. Với bài đăng
700 ký tự, con số thật phải tệ hơn 49%, và không phép đo nào hiện có nói được
tệ hơn bao nhiêu.

#### Cái giá của việc sửa, đo thật chứ không ước

Chia văn bản thành nhiều đoạn ≤96 subword rồi chạy từng đoạn:

| Độ dài | Số đoạn | Chia đoạn | Hiện nay |
|---|---|---|---|
| 80 ký tự | 1 | 19,8ms | 19,7ms |
| 280 ký tự | 1 | 48,7ms | 57,7ms |
| 700 ký tự | 2 | **123,9ms** | 72,9ms |
| 2.000 ký tự | 5 | **353,8ms** | 70,5ms |
| 6.000 ký tự | 15 | **1.127,9ms** | 71,4ms |

Phủ hết thì trả tuyến tính theo độ dài. Nhưng ba điều làm cái giá này dễ chịu
hơn vẻ ngoài của nó:

1. Tầng model chạy **async**, sau tầng luật. Người dùng thấy gạch chân của tầng
   luật trong 0,05ms; gạch chân của model đến sau, và đến chậm hơn thì cũng
   không chặn việc gõ.
2. `run()` đã bị **debounce 400ms**, nên nó không chạy mỗi phím gõ.
3. Bài đăng ≤300 ký tự **không đổi gì cả** — đã phủ 100% rồi. Cái giá chỉ phát
   sinh đúng ở chỗ hiện đang hỏng.

Trường hợp xấu thật sự là dán 6.000 ký tự rồi sửa liên tục: 1,1 giây CPU cho
mỗi lần debounce nhả. Muốn ship thì nên kèm một trong hai: chỉ chạy lại đoạn
có thay đổi, hoặc chạy đoạn chứa con trỏ trước rồi mới tới các đoạn khác.

#### Chưa sửa, và vì sao ghi lại thay vì sửa ngay

Đổi từ cắt cụt sang chia đoạn là **đổi hành vi sản phẩm kèm một cái giá độ
trễ**, đúng loại thay đổi mà dự án này đòi ghi ngưỡng chấp nhận trước rồi mới
đo (quyết định 27 và 29). Nên mục này ghi lại phát hiện và cái giá; việc sửa để
một đợt riêng, có ngưỡng chấp nhận viết trước.

Điều phải nói ngay: **`maxLen = 96` hiện đang là một hằng số đi ra từ lúc train,
chứ không phải một quyết định sản phẩm có ghi lại.** Nó quyết định sản phẩm bỏ
qua bao nhiêu phần văn bản của người dùng, và cho tới mục này thì không ai từng
đo con số đó.
