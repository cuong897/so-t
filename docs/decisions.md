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

Đã làm ở `9c31587`. Luật quyết định từng có **bốn** bản chép tay; đổi ngưỡng
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

Phủ hết thì trả tuyến tính theo độ dài. Hai điều làm cái giá này dễ chịu hơn vẻ
ngoài của nó:

1. `run()` đã bị **debounce 400ms**, nên nó không chạy mỗi phím gõ.
2. Bài đăng ≤300 ký tự **không đổi gì cả** — đã phủ 100% rồi. Cái giá chỉ phát
   sinh đúng ở chỗ hiện đang hỏng.

> **Ở đây từng có điều thứ ba, và nó SAI.** Mục này viết "tầng model chạy async
> nên đến chậm hơn thì cũng không chặn việc gõ". Quyết định 32 đo thẳng chuyện
> đó: không có Web Worker nào, `ort.env.wasm.proxy` không bật, và `session.run`
> giữ **luồng chính của trang** suốt lượt chạy. Mười lăm đoạn nối tiếp nhau giữ
> luồng **1.013ms liền**, không nhả một nhịp nào. `async` trong JavaScript nói
> về thứ tự, không nói về việc ai đang giữ luồng — đọc chữ `await` rồi kết luận
> "không chặn" là suy từ cú pháp ra hành vi. Cách sửa rẻ có thật, nhưng nó phải
> được **viết ra** chứ không tự có: nhả luồng giữa hai đoạn, xem quyết định 32.

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


---

### 32. Câu đứng MỘT MÌNH và câu nằm trong BÀI ĐĂNG — mọi con số của dự án là số của vế đầu

Yêu cầu ban đầu chỉ là "xem xét lại việc sửa model cắt cụt văn bản", tức việc
số 4 của bàn giao. Xem xét cái giá của việc chia đoạn thì lòi ra hai chuyện lớn
hơn cả việc cắt cụt.

#### Chuyện thứ nhất: "async nên không chặn việc gõ" là sai

Quyết định 31 lập luận rằng cái giá độ trễ của việc chia đoạn dễ chịu vì tầng
model chạy async. `onnxEngine.js` cũng ghi ở đầu file là nó "Chạy trong Web
Worker". Không có Worker nào trong repo này, và `ort.env.wasm.proxy` không được
bật, nên `session.run` giữ luồng chính của trang suốt lượt chạy.

`dev/bench-blocking.html` đo bằng nhịp đập MessageChannel — không dùng
`requestAnimationFrame`, vì tab ở nền thì rAF không chạy và phép đo sẽ ra "đứng
hình" ở cả trường hợp lành:

| | tổng | nhịp đập nhận được | đứng hình lâu nhất |
|---|---|---|---|
| `sleep(300ms)` — async thật | 300,2ms | 88.103 | 3,3ms |
| `check()` một bài 280 ký tự | 47,5ms | **0** | **47,5ms** |
| `check()` 6.000 ký tự (cắt cụt) | 70,4ms | **0** | **70,4ms** |
| 15 đoạn, chạy liền một mạch | 1.013,8ms | **0** | **1.013,8ms** |
| 15 đoạn, **nhả luồng** giữa hai đoạn | 1.004,2ms | 15 | **67,8ms** |

Dòng cuối là cách sửa: nhả luồng giữa hai lượt chạy gần như không tốn thêm tổng
thời gian và cắt lần giữ luồng lâu nhất đi 15 lần. Nhưng nó phải được viết ra —
`await` không tự nhả luồng cho ai cả.

Ba chỗ trong repo cùng khai chuyện này và cả ba đều suy từ cú pháp ra hành vi:
thấy `await` thì kết luận "không giữ luồng". Đã sửa cả ba ở `13d385f`.

#### Chuyện thứ hai, lớn hơn: khoảng cách đã có sẵn TRƯỚC khi chia đoạn

Việc chia đoạn đặt ra một câu hỏi mà quyết định 31 không hỏi: một từ đứng ở
**chỗ khác** trong cửa sổ thì model có quyết định khác không? Quyết định 31 đo
cái giá của việc chia đoạn **chỉ bằng độ trễ**.

`dev/bench-context.html` chấm 863 câu VSEC (940 lỗi trong tầm) bằng nhãn vàng,
cùng model, cùng ngưỡng, chỉ đổi đúng một thứ: cái nằm quanh câu đó. Chữ nằm
quanh là câu VSEC **đã sửa đúng**, nên nó không mang thêm lỗi vào.

| điều kiện | đúng | sửa sai | báo oan | recall | precision |
|---|---|---|---|---|---|
| **A.** câu đứng một mình | 698 | 18 | 7 | **0,7426** | **0,9654** |
| **E.** câu đứng đầu cửa sổ, ngữ cảnh bên phải | 673 | 19 | 5 | 0,7160 | 0,9656 |
| **C.** ngữ cảnh hai bên | 665 | 17 | 9 | 0,7074 | 0,9624 |
| **B.** ngữ cảnh trái, câu nằm cuối cửa sổ | 583 | 19 | 7 | 0,6202 | 0,9573 |
| **D.** câu bị **chỗ nối cắt đôi** | 570 | 28 | **36** | **0,6064** | **0,8991** |

So có cặp với A, sai số chuẩn tính trên số ca **bất đồng** (McNemar) chứ không
trên tổng, vì hai cột không độc lập:

| | A bắt, kia sót | kia bắt, A sót | chênh recall | ± 1 SE |
|---|---|---|---|---|
| B | 139 | 24 | −0,1223 | 0,0136 |
| C | 54 | 21 | −0,0351 | 0,0092 |
| E | 47 | 22 | −0,0266 | 0,0088 |
| D | 156 | 28 | −0,1362 | 0,0144 |

Cả bốn đều vượt 2 SE. Và A = 0,7426 khớp con số 0,7457 mà `evaluate.py` báo —
đó là phép kiểm rằng bộ đo này không lệch khỏi bộ đo cũ.

**Điều kiện A là thứ mọi phép đo offline của dự án đang đo.** Đã kiểm cả bốn:
`evaluate.py`, `consonant_eval.py`, `sentence_eval.py`, `false_alarm.py` đều
nhận vào **một câu** rồi chạy một lượt suy luận.

**Điều kiện B và C là thứ sản phẩm đang làm.** `run()` trong `content/index.js`
lấy **cả ô nhập liệu** rồi đưa thẳng cho `check()`. Từ câu thứ hai trở đi, mọi
từ đều đang được chấm trong điều kiện B hoặc C.

Nên recall thật khi người ta gõ một bài đăng nằm đâu đó trong khoảng **0,62 –
0,71**, không phải 0,7426. Lại đúng họ lỗi của dự án này, lần này ở chỗ đắt
nhất: **đo một con số hoàn toàn đúng — của một đường dẫn mà sản phẩm không đi.**
Khác mấy lần trước ở chỗ nó không nằm trong một phép đo lẻ nào, nó nằm trong
**hình dạng chung của cả bộ đo**.

**Giới hạn của phép đo này:** "bài đăng" ở đây là các câu VSEC không liên quan
nối với nhau, không phải một bài viết mạch lạc. Ngữ cảnh thật có thể giúp model
nhiều hơn chữ nối ngẫu nhiên. Nhưng khoảng cách E–B dưới đây có **cùng lượng**
chữ ngẫu nhiên ở hai bên, nên nó không giải thích được bằng giới hạn đó.

#### Thủ phạm chính là VỊ TRÍ trong cửa sổ

Thứ tự A > E ≈ C > B xếp theo vị trí của câu đích trong cửa sổ: E và B có cùng
lượng ngữ cảnh, chỉ khác câu đích nằm ở đầu hay ở cuối, mà chênh nhau 9,6 điểm
recall. Ngữ cảnh tự nó cũng tốn một ít (A so với E: 2,7 điểm), nhưng phần lớn
cái mất nằm ở vị trí.

Giải thích khớp với cách train: câu VSEC có trung vị 30 subword, `max_len` là
96, nên trong lúc fine-tune các vị trí từ 60 tới 94 hầu như chỉ có **đệm**. Model
ít khi học đọc chữ thật ở chỗ sâu của cửa sổ. Đây là giả thuyết khớp số liệu,
chưa phải điều đã chứng minh — muốn chứng minh phải đếm phân bố vị trí của token
thật trong `train.jsonl`.

Đó cũng là lý do **nới `max_len`** không cứu được: model chạy được ở 192 và 256
(`max_position_embeddings` 258, trục seq của ONNX là động), nhưng
`dev/bench-chunking.html` đo ra lệch khỏi mốc nhiều hơn — 51,1% ở 256 so với
45,4% ở 96. Cửa sổ rộng hơn chỉ đẩy thêm chữ vào vùng model chưa học.

#### Hệ quả: chấm theo CÂU thắng ở mọi cột trừ tổng CPU

Nếu chỗ tệ là vị trí sâu trong cửa sổ, thì cách chia tốt nhất là cách giữ mọi từ
ở vị trí **nông**. Một câu một lượt chạy làm đúng thế — và nó cũng là đường mà
mọi phép đo offline đang đi, nên lần đầu tiên số đo và sản phẩm nói cùng một thứ.

Đo trên văn bản có dấu câu, cả ba chiến lược đều nhả luồng giữa hai lượt:

| cỡ văn bản | chiến lược | lượt | tổng | đứng lâu nhất |
|---|---|---|---|---|
| 280 | hiện nay — một lượt | 1 | 48,9ms | 48,8ms |
| 280 | **từng câu một** | 3 | 59,1ms | **30,3ms** |
| 2.000 | hiện nay — một lượt, cắt cụt | 1 | 70,3ms | 70,3ms (phủ **20%**) |
| 2.000 | gói nhiều câu trọn vào cửa sổ 96 | 6 | 347,0ms | 64,6ms |
| 2.000 | **từng câu một** | 16 | 390,9ms | **37,1ms** |
| 6.000 | hiện nay — một lượt, cắt cụt | 1 | 70,8ms | 70,8ms (phủ **7%**) |
| 6.000 | gói nhiều câu trọn vào cửa sổ 96 | 18 | 1.093,6ms | 74,1ms |
| 6.000 | **từng câu một** | 48 | 1.168,3ms | **42,4ms** |

Chấm theo câu tốn thêm 7–13% tổng thời gian so với gói đoạn, đổi lại chất lượng
bằng đúng điều kiện A và **lần giữ luồng lâu nhất thấp hơn cả bản đang ship**.
Không câu nào trong 3.146 câu thử vượt nổi cửa sổ 96 (dài nhất 64 subword).

#### Gộp LÔ: đã thử, đã bác

Trục `batch` của ONNX cũng động, nên gộp nhiều câu vào một lượt là hướng hiển
nhiên để bù phần tốn kém cố định. `dev/bench-batch.html` kiểm **đúng trước, nhanh
sau**: lô cho kết quả gần như trùng chạy lẻ (3–5 chỗ lệch trên ~80, do INT8 làm
p rung tới 3,5e-2 và đẩy ca sát ngưỡng qua lại) — nhưng **chậm hơn**: 26,7ms một
câu khi chạy lẻ, so với 33,9 / 36,3 / 41,1ms ở lô 4 / 8 / 16. Đệm tới câu dài
nhất trong lô tốn nhiều hơn phần tiết kiệm được.

Lần chạy đầu của phép đo này báo "113 chỗ lệch trên 129" và suýt thành kết luận.
Nguyên nhân: khoá so sánh gồm cả xác suất làm tròn tới số lẻ thứ tư, nên p rung
ở đuôi bị đếm thành **quyết định khác**. Lỗi ở thước đo, không ở thứ được đo —
đúng hạng mục của bẫy số 11.

#### Một lỗi nhỏ nhưng thật: `bpe.js` cắt GIỮA một từ

`encodeWords` kiểm tra `maxLen` **bên trong** vòng lặp subword, nên khi cửa sổ
đầy giữa chừng một từ nhiều subword, từ đó vẫn có `firstSubwordIndex >= 0` và
vẫn **bị chấm** — dù model chỉ thấy `nguy@@` thay vì `nguyễn`:

```
words    = [6 x 'nghiêng', 'nguyễn', 'sau', 'đó'],  maxLen = 9
wordIds  = [-1, 0, 1, 2, 3, 4, 5, 6, -1]
firstIdx[6] = 7   ->  'nguyễn' ĐƯỢC CHẤM, từ đúng một mảnh 'nguy@@'
```

Đo trên văn bản thật: 3% số văn bản bị cắt rơi vào chỗ này — hiếm, vì phần lớn
âm tiết tiếng Việt là một subword. Nhưng nó hiếm **một lần cho mỗi văn bản**;
chia đoạn ngây thơ sẽ nhân nó lên **một lần cho mỗi đoạn**. `test/bpe.test.mjs`
chỉ canh phần đuôi trả `-1`, không canh từ cuối cùng có trọn vẹn không.
`ml/encoding.py` có đúng cùng một dòng.

#### Ba thứ phải làm hoặc đo trước khi ship, không suy ra được

1. **Văn bản không có dấu câu.** Bài Facebook thường không chấm câu, và lúc đó
   mọi chiến lược theo câu suy biến về một đoạn khổng lồ. Đường lui sẽ rơi vào
   vùng của điều kiện B hoặc D — phải đo, không được đoán.
2. **Chia mảng `spans`, không chia chuỗi.** Phép đo cái giá ở quyết định 31 nối
   lại bằng `words.join(' ')`, đường đó **mất offset gốc** nên không vẽ gạch chân
   được. Cái giá đo ra vẫn đúng, nhưng là cái giá của một đường mà bản sửa thật
   sẽ không đi.
3. **Bộ nhớ đệm theo câu.** Sửa một câu trong bài 6.000 ký tự thì chỉ nên chạy
   lại một câu (~27ms) thay vì 48 câu (~1.168ms).

---

### 33. Chấm theo CÂU thay cho cắt cụt — ngưỡng chấp nhận ghi TRƯỚC khi viết code

Lần thứ ba theo nếp của `ae3aec0` và `821229d`. Nhưng lần này phải nói thẳng một
chỗ khác hai lần trước: **phép đo thăm dò đã chạy rồi** (quyết định 32), và chính
nó chọn ra hướng chấm theo câu. Nên ngưỡng dưới đây không che được việc chọn
hướng sau khi nhìn số. Thứ nó che được là bước tiếp theo: **bản cài đặt thật**,
đi qua đúng `OnnxEngine.check()` mà extension gọi, chưa ai đo.

Các ngưỡng đặt quanh mốc A của quyết định 32 (câu đứng một mình), vì A là đường
mà bản sửa định đi theo. Sai số chuẩn tính trên đúng cỡ mẫu đó: recall trên 940
lỗi SE ≈ 0,0143; precision trên ~723 chỗ báo SE ≈ 0,0068.

#### Thiết kế đem ra đo — cố định từ bây giờ

1. `check(text)` tách `spans` của cả văn bản như cũ, rồi chia **mảng spans** (không
   chia chuỗi) thành câu ở dấu `.` `!` `?` `…` và xuống dòng. Offset gạch chân
   lấy thẳng từ `spans` gốc.
2. Mỗi câu một lượt `session.run`. **Nhả luồng** giữa hai lượt.
3. Bộ nhớ đệm theo **nội dung câu** (chuỗi các từ), kích thước giới hạn. Kết quả
   lưu theo chỉ số từ trong câu, cộng offset lúc trả ra.
4. Có thể huỷ giữa chừng: `check()` nhận tín hiệu huỷ và dừng sau lượt đang chạy
   — `run()` đã có `s.seq`, nhưng hôm nay nó chỉ vứt kết quả **sau khi** đã đốt
   xong CPU.
5. **`encodeWords` không bao giờ cắt giữa một từ.** Từ không vừa trọn thì bỏ cả
   từ. Sửa cả `bpe.js` lẫn `ml/encoding.py`, và thêm test cho đúng trường hợp
   `nguyễn` ở quyết định 32.
6. **Đường lui** cho một "câu" dài hơn cửa sổ (văn bản không dấu câu): đo đúng
   hai ứng viên, không thêm:
   * **F1** — cắt cứng ở ranh giới từ, mỗi mảnh ≤ 40 subword.
   * **F2** — cửa sổ trượt 64 subword, bước 32; mỗi từ lấy kết quả từ cửa sổ mà
     nó nằm **gần giữa nhất**.

   Luật chọn: trong số ứng viên qua điều kiện 4 dưới đây, lấy ứng viên **ít báo
   oan hơn**; hoà thì lấy F1 vì rẻ hơn. Không ứng viên nào qua thì văn bản không
   dấu câu **giữ nguyên hành vi hiện nay** (chỉ chấm cửa sổ đầu) và ghi lại.

#### Tám điều kiện

Đo bằng một trang mới chạy thẳng `check()` trên bài đăng dựng từ câu VSEC giữ kín:
câu có lỗi xen giữa câu đã sửa đúng, chấm bằng nhãn vàng.

| # | điều kiện | mốc | phải đạt |
|---|---|---|---|
| 1 | phủ, bài có dấu câu, 280/700/2.000/6.000 ký tự | 100/58/20/7% | **100%** mọi cỡ |
| 2 | precision, bài có dấu câu | A = 0,9654 | **≥ 0,9550** (A − 1,5 SE) |
| 3 | recall trong tầm, bài có dấu câu | A = 0,7426 | **≥ 0,7140** (A − 2 SE) |
| 4 | precision, bài KHÔNG dấu câu | — | **≥ 0,9500** (ranh giới cứng, quyết định 25) |
| 5 | câu sạch bị gạch oan, bài toàn câu đúng | `false_alarm.py` 1,05% | **≤ 1,50%** |
| 6 | đứng hình lâu nhất, mọi cỡ, có và không dấu câu | hôm nay 70,8ms | **≤ 100ms** |
| 7 | sửa MỘT câu trong bài 6.000 ký tự đã chấm xong | chấm lại cả bài | lượt chạy lại **≤ 100ms tổng** |
| 8 | văn bản chỉ có một câu ngắn | bản đang ship | kết quả **giống hệt từng issue** |

Cộng thêm, không tính là điều kiện vì không có chỗ thương lượng: `npm run test:all`
pass, và test parity `gate.test.mjs` không đổi — bản sửa không đụng vào phép quyết
định, chỉ đổi thứ được đưa vào nó.

**Luật ship:** qua cả tám thì ship. Trượt 2, 3 hoặc 5 thì **không ship** gì cả,
giữ cắt cụt, ghi lại. Trượt đúng 4 thì ship phần có dấu câu, văn bản không dấu
câu giữ hành vi cũ — luật đã ghi ở mục 6 phía trên. Trượt 1, 6, 7 hoặc 8 là lỗi
cài đặt, sửa rồi đo lại **toàn bộ**, không đo lại riêng điều kiện đã trượt.

#### Ghi trước ba điều để sau không tự lừa mình

* **Điều kiện 3 qua là chuyện dễ đoán**, vì mỗi câu đi đúng đường của mốc A. Nó
  có mặt để bắt lỗi cài đặt (offset lệch, cache trả nhầm câu), không phải để
  chứng minh hướng này đúng. Điều kiện khó thật là 4 và 6.
* **So với bản đang ship thì recall trên bài dài chắc chắn tăng**, vì bản đang ship
  bỏ qua 80–93% văn bản. "Recall tăng gấp mấy lần" không phải kết quả, nó hiển
  nhiên. Đừng đưa nó lên README như một thành tích.
* **Mọi con số hiệu năng đang ghi trong README và bàn giao là số của câu đứng một
  mình.** Nếu bản này ship, chúng lần đầu tiên đúng với sản phẩm. Nếu không ship,
  chúng phải được ghi chú lại theo quyết định 32 — việc đó làm bất kể kết quả.

#### Kết quả — `dev/bench-accept.html`, chạy qua đúng `OnnxEngine.check()`

216 bài đăng dựng từ 863 câu VSEC có lỗi, xen giữa câu đã sửa đúng, trung bình
1.619 ký tự. Ba lượt chạy: một lượt **bỏ dở** vì lộ lỗi thước đo (mục dưới), rồi
**hai lượt đầy đủ**. Giữa hai lượt đầy đủ chỉ đổi đường lui mặc định và thêm mốc
đứng hình của bản cũ; mọi con số chất lượng ra trùng khít.

**Bài đăng có dấu câu** — đường chính:

| # | điều kiện | lượt 1 | lượt 2 | cần | |
|---|---|---|---|---|---|
| 1 | phủ, mọi cỡ | 100% | 100% | 100% | qua |
| 2 | precision | 0,9669 | 0,9669 | ≥ 0,9550 | qua |
| 3 | recall trong tầm | 0,7457 | 0,7457 | ≥ 0,7140 | qua |
| 5 | câu sạch bị gạch oan | 0,98% | 0,98% | ≤ 1,50% | qua |
| 6 | đứng hình lâu nhất | 82,0ms | 81,9ms | ≤ 100ms | qua |
| 7 | sửa một câu trong bài 6.000 | 36,4ms, 1 lượt | 32,2ms, 1 lượt | ≤ 100ms | qua |
| 8 | văn bản một câu, so bản cũ | 486/486 | 486/486 | giống hệt | qua |

Recall 0,7457 trùng **đúng tới số lẻ thứ tư** con số `evaluate.py` báo cho câu
đứng một mình. Đó là thứ quyết định 32 muốn: sản phẩm giờ đi đúng đường của phép
đo. Cùng các bài đó, bản cắt cụt được recall **0,1553** — nó bỏ qua phần lớn bài.
Như đã ghi trước, con số đó hiển nhiên chứ không phải thành tích.

**Bài đăng KHÔNG dấu câu** — đường lui:

| | recall | precision | câu sạch bị gạch | đứng lâu nhất, lượt 1 / lượt 2 |
|---|---|---|---|---|
| F1 — cắt cứng 40 | 0,7149 | **0,9465** ✗ | 2,26% | 65,0 / **110,3ms** ✗ |
| F2 — trượt 64 bước 32 | 0,7202 | 0,9671 | 0,87% | **110,0 / 134,2ms** ✗ |
| `none` — giữ như cũ | 0,1553 | **0,9419** ✗ | 0,23% | — / **157,8ms** ✗ |

Không ứng viên nào qua đủ điều kiện. Theo luật ghi trước: **văn bản không dấu câu
giữ hành vi cũ**, `DEFAULT_FALLBACK = 'none'`. F1 và F2 vẫn nằm trong code, chọn
được qua `opts.fallback`, để đợt sau đo mà không phải viết lại.

#### Hai chỗ sửa trong thước đo

1. **Một issue lạc suýt bị bỏ đi** — sửa trước lượt đầy đủ thứ nhất. Token VSEC
   như `dâng,thời` hay `Mac-côp-nhi-côp` được `tokenize()` tách thành nhiều từ,
   và mảnh bên trong không có trong bảng offset của trang đo. Lượt bỏ dở đếm nó
   là "không khớp" rồi thôi, ra precision 0,9682. Lỗi VSEC không bao giờ nằm trên
   token kiểu đó (đếm: 0 ca), nên nó là **báo oan** — giờ tính chống lại mình:
   0,9669. May là trang đo in bộ đếm "không khớp" ra thay vì lặng lẽ nuốt. Bẫy
   số 11, lần hai.
2. **Điều kiện 6 thiếu mốc** — sửa giữa hai lượt đầy đủ. Ngưỡng ghi "hôm nay
   70,8ms", lấy từ một phép đo KHÁC. Lượt hai đo bản cũ cùng lượt, cùng văn bản —
   và xem mục dưới.

#### Điều kiện 6 được đặt SAI, và phải nói ra thay vì lách

Truy vì sao F2 đứng 110ms trong khi một cửa sổ 64 subword chỉ tốn ~50ms: ghi dấu
thời gian từng nhịp đập và từng `session.run`. Khoảng đứng lâu nhất **lần nào
cũng chứa đúng một lượt chạy** — nhả luồng chạy đúng. Cái dao động là chính lượt
chạy đó: cùng một bài 280 ký tự, cùng một lượt duy nhất, lúc 47,7ms lúc 93,5ms.

Lượt hai xác nhận bằng mốc cùng lượt: **bản cũ đang ship cũng trượt** — 130,2ms
trên bài có dấu câu, 125,0ms trên bài không dấu. F1 ở 280 ký tự đứng 51,7ms lượt
một và 110,3ms lượt hai, cho **cùng một lượt chạy duy nhất**.

"Lâu nhất trong 3 lần" của một đại lượng dao động gấp đôi thì đo nhiễu của máy
nhiều hơn đo cấu hình. Điều kiện này không phân biệt được F2 với hiện trạng.

Nhưng **không** vì thế mà ship F2. Đổi cách đọc ngưỡng sau khi thấy số là đúng thứ
mà nếp ghi-trước được dựng ra để chặn. Việc đúng là mở một đợt riêng, với thống
kê đứng hình viết trước và mốc đo cùng lượt — xem việc tiếp theo trong bàn giao.

Còn đường có dấu câu qua điều kiện 6 ở **cả hai** lượt dù nhiễu như vậy, vì mỗi
lượt chạy ở đó chỉ là một câu ngắn (~30 subword). Đó là lý do cấu trúc, không
phải may mắn: lượt chạy ngắn thì đỉnh nhiễu cũng ngắn.

#### Vá sau hai lượt đo — ở chỗ không phép đo nào chạm tới

Tín hiệu huỷ ban đầu chỉ được kiểm **giữa các câu**. Với `none` một câu là một
lượt nên không sao; nhưng bật F1/F2 cho bài 6.000 ký tự không dấu câu thì một lượt
đã lỗi thời vẫn đốt hết ~3,4 giây. Giờ kiểm cả giữa các cửa sổ trong một câu, và
kết quả dở dang không vào cache. Không đổi gì khi không huỷ — kiểm bằng model thật:
câu ngắn 60/60 giống bản cũ, F2 có và không có tín hiệu ra y hệt từng issue, huỷ
sau lượt 2 thì dừng đúng ở 2 lượt (105ms) và cache trống.

---

### 34. Đường lui cho văn bản KHÔNG dấu câu — ngưỡng ghi TRƯỚC, lần này có đối chứng A/A

Việc số 4 của bàn giao sau quyết định 33. Bài đăng viết liền không chấm câu vẫn bị
cắt cụt ở 96 subword, vì không đường lui nào qua đủ ngưỡng của quyết định 33.

#### Cái gì đã biết trước, nói ra để không giả vờ là không biết

* **Chất lượng của F2 đã đo rồi**: precision 0,9671, câu sạch bị gạch 0,87% trên
  216 bài không dấu câu (quyết định 33). Hai điều kiện chất lượng dưới đây vì thế
  không che được gì cho F2 — chúng có mặt vì F2s thì chưa ai đo, và vì mọi thứ
  phải chạy lại trong cùng một trang.
* **F2 trượt quyết định 33 chỉ ở điều kiện đứng hình**, và điều kiện đó đặt sai:
  bản cũ đo cùng lượt cũng trượt. Nên đợt này về thực chất là đặt lại **đúng một
  phép đo**, rồi áp nó cho mọi ứng viên.
* **Về cấu trúc, F2 nên thắng**: mỗi lượt chạy của nó dài 64 subword, của bản cũ
  96. Nếu thước đo dưới đây nói ngược lại thì phải nghi thước đo trước.

#### Hai ứng viên, cố định trong code ở commit này

* **F2** — cửa sổ trượt 64 subword, bước 32. Y hệt quyết định 33.
* **F2s** — cửa sổ trượt 48 subword, bước 24. Lượt chạy ngắn hơn, mọi từ nằm nông
  hơn (quyết định 32 nói vị trí nông tốt hơn), nhưng ít ngữ cảnh hơn. Không đoán
  được cái nào thắng.

F1 không vào đợt này: nó trượt precision (0,9465), và đó là thước đo không có vấn
đề gì.

#### Thước đo đứng hình mới — và vì sao nó phải tự chứng minh được

Quyết định 33 lấy "lâu nhất trong 3 lần" của một đại lượng dao động gấp đôi trên
cùng một văn bản. Ba sửa, cả ba nằm trong `dev/bench-fallback.html` commit cùng
lúc với đoạn này:

1. **Mốc cùng lượt, cùng văn bản.** Mỗi văn bản được chạy qua bản cũ và mọi ứng
   viên, **xoay vòng** ai chạy trước — để rác bộ nhớ của lượt trước không luôn đổ
   lên cùng một cấu hình.
2. **p50 và p90 trên 40 văn bản mỗi cỡ**, không dùng "lâu nhất". Phân vị theo hạng
   gần nhất: p50 là mẫu thứ 20, p90 là mẫu thứ 36.
3. **Đối chứng A/A.** Bản cũ được đo **hai lần** như hai cấu hình riêng. Hai cấu
   hình giống hệt nhau thì tỷ số phải quanh 1. Nếu A/A vượt ngưỡng ở bất kỳ cỡ
   nào, thước đo không đủ phân giải để phân biệt ai với ai — **đợt đo vô hiệu**,
   không phải ứng viên trượt. Chạy lại đúng một lần; lại vô hiệu thì dừng, ghi lại,
   và hướng tiếp theo là `ort.env.wasm.proxy` chứ không phải nới ngưỡng.

Đây là thứ quyết định 33 thiếu: một cách để thước đo nói "tôi không biết" thay vì
nói "trượt".

#### Điều kiện — mỗi ứng viên, trên văn bản không dấu câu

| # | điều kiện | cần |
|---|---|---|
| Q1 | precision, 216 bài dựng như quyết định 33 | ≥ 0,9500 |
| Q2 | câu sạch bị gạch oan | ≤ 1,50% |
| P | phủ, 280 / 700 / 2.000 / 6.000 ký tự | 100% |
| R | số câu có dấu câu có kế hoạch chạy khác `none` | 0 |
| S | đứng hình, **mỗi cỡ**: p50 ứng viên / p50 bản cũ, và p90 / p90 | cả hai ≤ **1,25** |

Không có sàn recall, và nói rõ vì sao: mọi ứng viên đọc hết văn bản còn `none` chỉ
đọc 96 subword đầu, nên recall hơn `none` là hiển nhiên. Recall được **báo**, không
dùng để **chọn**.

1,25 chứ không phải 1,0: F2 chạy nhiều lượt hơn bản cũ, mỗi lượt có một lần nhả
luồng, và đỉnh của lượt ngắn vẫn dính nhiễu như lượt dài. Ngưỡng cho phép tệ hơn
bản cũ tới 25% ở cái người dùng cảm thấy, không hơn.

#### Luật

* **A/A trượt** → vô hiệu, chạy lại một lần, lại trượt thì dừng.
* **Trong các ứng viên qua hết**: chọn ít câu sạch bị gạch oan nhất; hoà tuyệt đối
  thì ít báo oan trên câu đích hơn; vẫn hoà thì F2 (ít lượt hơn). Đổi
  `DEFAULT_FALLBACK` sang ứng viên đó.
* **Không ứng viên nào qua** → giữ `none`, ghi lại.
* Trang đo tự chấm và tự áp luật ở dòng TỔNG KẾT. Nó chưa từng được chạy lúc
  commit. Nếu nó đổ khi chạy thật thì sửa chỗ đổ — không sửa ngưỡng, không sửa
  luật — và ghi lại đã sửa gì.

#### Kèm theo trong commit này, không đổi hành vi

`onnxEngine.js` có hai byte NUL thật trong mã nguồn — khoá cache ở `86d9eb4` viết
`\u0000` nhưng công cụ sửa file ghi thành ký tự NUL. Chạy vẫn đúng, nhưng `grep`
coi cả file là nhị phân và chỉ in "Binary file matches" — người sau tìm trong
file sẽ không thấy gì. Đã thay bằng chuỗi thoát; khoá cache vẫn y hệt.

Và nó lặp lại ngay lúc viết đoạn này: chuỗi `\u0000` trong chính đoạn trên và
trong commit message cũng bị ghi thành byte NUL. Git từ chối commit ("a NUL byte
in commit log message not allowed") — chỉ nhờ thế mà lộ. Trước khi commit
bất cứ thứ gì có chuỗi thoát, đếm byte NUL trong file.

Nguyên nhân thật tìm ra sau hai lần sửa hụt: chuỗi thoát bị giải mã thành NUL
**ngay trong tham số của lệnh gọi công cụ**, trước cả khi shell hay Python nhìn
thấy nó — nên sửa bằng một script có chứa chuỗi thoát cũng lại đẻ ra NUL. Cách
an toàn là dựng dấu gạch ngược bằng `chr(92)`.

Quét toàn bộ file văn bản được theo dõi thì lòi thêm một chỗ **có từ commit đầu
tiên** (`5cb2df9`): `bpe.js` dùng byte NUL thật làm dấu ngăn trong khoá bảng
merge, ở cả chỗ ghi lẫn chỗ đọc. Chạy đúng từ đầu tới giờ, nhưng đó chính là lý
do `grep` luôn báo "Binary file ./extension/src/engine/bpe.js matches" thay vì
in dòng khớp. Đã thay; test parity `bpe.js` ↔ PhoBERT Python vẫn xanh.

#### Kết quả — `dev/bench-fallback.html`, lần chạy đầu tiên và duy nhất

Trang chạy hết không đổ, không phải sửa gì. Tự chấm ra:

**Chất lượng**, 216 bài không dấu câu:

| | đúng | sửa sai | báo oan | recall | precision | câu sạch bị gạch |
|---|---|---|---|---|---|---|
| **F2** | 677 | 17 | 6 | 0,7202 | **0,9671** | **0,87%** |
| F2s | 671 | 18 | 11 | 0,7138 | 0,9586 | 1,16% |
| cũ (`none`) | 146 | 6 | 3 | 0,1553 | 0,9419 | 0,23% |

F2 ra **đúng tới số lẻ thứ tư** số của quyết định 33 — phép đo chất lượng tất định,
như phải thế. Cả hai ứng viên phủ 100% mọi cỡ, và 0 / 2.589 câu có dấu câu bị đổi
kế hoạch chạy.

Cửa sổ nhỏ hơn thua ở chất lượng: F2s báo oan gần gấp đôi. Vị trí nông có lợi
(quyết định 32), nhưng ở 48 subword phần ngữ cảnh mất đi nặng hơn.

**Đứng hình**, 40 văn bản mỗi cỡ, tỷ số so bản cũ đo cùng lượt (p50 / p90):

| cỡ | A/A — đối chứng | F2 | F2s |
|---|---|---|---|
| 280 | x1,01 / x1,03 | x0,98 / x1,09 | x1,00 / x1,04 |
| 700 | x0,89 / x1,04 | x0,83 / x0,75 | x0,71 / x0,63 |
| 2.000 | **x1,23** / x1,04 | x1,02 / x0,84 | x0,81 / x0,67 |
| 6.000 | x0,95 / x0,93 | x1,01 / x0,84 | x0,80 / x0,69 |

A/A qua, **nhưng sát**: ở 2.000 ký tự, cùng một bản cũ đo hai lần mà p50 chênh 23%,
ngưỡng là 25%. Thước đo đủ phân giải cho kết luận này — không ứng viên nào tiến gần
ngưỡng, tỷ số tệ nhất là x1,09 — nhưng nó **không** đủ để phân biệt hai cấu hình
chênh nhau dưới ~25% ở p50. Đừng đọc x0,98 với x1,02 là khác nhau.

Ở 280 ký tự mọi cấu hình làm đúng một lượt chạy giống nhau, và tỷ số ra x0,98–1,09:
đó là độ rộng của nhiễu. Từ 700 ký tự trở lên, p90 của cả hai ứng viên **thấp hơn**
bản cũ, đúng như cấu trúc dự đoán: lượt chạy 64 hay 48 subword ngắn hơn lượt 96.

Và cột "lâu nhất" — thứ quyết định 33 đã dùng — ra 101–156ms cho **bản cũ** ở mọi
cỡ. Nếu đợt này vẫn dùng nó, cả bản cũ lẫn hai ứng viên đều trượt, lần nữa.

**Áp luật:** cả hai qua hết; ít câu sạch bị gạch oan nhất là **F2** (0,87% so với
1,16%). `DEFAULT_FALLBACK = 'F2'`.

F2s đứng hình ít hơn F2 ở mọi cỡ lớn. Luật ghi trước ưu tiên báo oan, nên nó không
được chọn — đúng với nguyên tắc precision quan trọng hơn recall, và càng đúng với
việc 20–30% chênh lệch đứng hình nằm quanh vùng mà thước đo này vừa đủ phân giải.

Kiểm thêm bằng model thật: đoạn thử 494 ký tự của bàn giao, bỏ hết dấu câu và viết
thường — bản mới gạch `cứ→cư` 100%, bản cũ im lặng, không gạch oan chỗ nào.

#### Cái giá còn lại, ghi để không ai bất ngờ

* **Sửa một chữ trong bài không dấu câu là chấm lại cả bài**, vì cả bài là một
  "câu" nên cache theo câu không trúng. Bài 6.000 ký tự tốn ~3,4 giây CPU mỗi lần —
  chia thành những lượt ~100ms có nhả luồng, và bị huỷ ngay khi người dùng gõ tiếp.
  Cache theo **cửa sổ** sẽ cắt phần này; đó là thiết kế mới, đo riêng.
* **Luồng chính vẫn là vấn đề gốc.** Mọi con số đứng hình ở đây tồn tại vì
  `session.run` chạy trên luồng của trang.

---

### 35. Cache theo cửa sổ khi sửa bài dài — ngưỡng ghi TRƯỚC

Việc số 4 của bàn giao sau quyết định 34. Với đường lui F2, sửa một chữ trong bài
6.000 ký tự không dấu câu làm `check()` chấm lại **cả bài** (~43 cửa sổ, ~3,4 giây
CPU), vì cả bài là một "câu" và cache theo câu không trúng.

#### Giả định trong bàn giao đã sai — đếm trước khi thiết kế

Bàn giao viết: "cửa sổ trượt dịch đi khi chèn hay xoá chữ, nên khoá cache không
thể là vị trí", và gợi ý cắt theo nội dung. Trước khi ghi ngưỡng, đếm thuần cấu trúc
(không chạy model): sau một lần sửa, bao nhiêu cửa sổ của kế hoạch mới **chưa** có
trong kế hoạch cũ. 40 văn bản mỗi cỡ, không dấu câu:

| 6.000 ký tự | gõ thêm cuối | thay một từ giữa | đổi dấu một từ giữa | tổng cửa sổ |
|---|---|---|---|---|
| F2 hiện tại | 1,0 | 3,9 | 2,5 | 42,8 |
| cắt theo nội dung (hash từ) | 1,0 | 2,3 | 2,2 | **58,4** |

F2 **tự khớp lại** sau chỗ sửa: mỗi cửa sổ bắt đầu ở từ đầu tiên cách đầu cửa sổ
trước ≥ 32 subword, nên một độ lệch ranh giới tắt dần sau vài cửa sổ. Cắt theo nội
dung chỉ bớt được 1–2 cửa sổ phải chạy lại mà tốn thêm 36% cửa sổ cho mọi lần chấm
lạnh — bỏ. Không có ứng viên cắt mới; chỉ có **một** thay đổi: cache kết quả theo
**nội dung từng cửa sổ**.

Vì kết quả một cửa sổ chỉ phụ thuộc các từ trong nó, thay đổi này **không được đổi
một issue nào**. Rủi ro thật duy nhất là cache trả nhầm — nên điều kiện đầu tiên là
đồng nhất tuyệt đối.

#### Và một lỗi bộ nhớ lộ ra trên đường

Cache theo câu (`86d9eb4`) lưu **cả câu** cho mọi phiên bản. Với bài dài không dấu
câu, mỗi lần sửa thêm một mục ~1.340 dòng logit, trần 400 mục — cỡ nửa triệu dòng,
tăng theo số lần sửa. Khi bật cache cửa sổ, câu nhiều cửa sổ **không** được lưu ở
mức câu nữa; bộ nhớ chặn bởi 256 cửa sổ × ≤ 64 từ.

#### Đã kiểm trước khi commit, không phải điều kiện

* `test/windowcache.test.mjs`: session giả mà logit phụ thuộc token hai bên và vị
  trí; 36 phiên bản văn bản qua 5 kiểu sửa (thêm cuối, thay giữa, xoá giữa, chèn
  đầu, quay về bản cũ) — có cache giống hệt chạy lạnh. Làm hỏng khoá cache (chỉ còn
  độ dài + từ đầu) thì test trượt.
* Code mới với cache **tắt** cho y hệt `6dc20b2` trên 120 văn bản, cùng số lượt
  model — phần tái cấu trúc không đụng hành vi đang ship. Kiểm điều này riêng vì
  trang đo dưới đây so W với F2 **của code mới**, nên không nhìn thấy nó.

#### Điều kiện — `dev/bench-editcache.html`, commit cùng đoạn này, chưa chạy

So `W` (F2 + cache cửa sổ 256) với `F2` đang ship, cùng lượt, cùng văn bản, xoay
vòng thứ tự; `F2-A/A` là một bản F2 thứ hai làm đối chứng.

| # | điều kiện | cần |
|---|---|---|
| 1 | **đồng nhất**: W cache ấm (dùng chung cho mọi bài) so F2 chạy lạnh, 60 bài có dấu câu + 60 bài không dấu câu × 4 phiên bản (gốc, gõ thêm cuối, thay từ giữa, xoá từ giữa), từng issue kể cả confidence | 480 / 480 |
| 2 | chi phí một lần sửa, 20 văn bản 6.000 ký tự không dấu câu, **mỗi kiểu sửa**: tổng thời gian p50 W / F2 | ≤ **0,25** |
| 3 | đứng hình trong lần chấm sau khi sửa, mỗi kiểu sửa: p90 W / F2 | ≤ 1,25 |
| 4 | bộ nhớ: một bài 2.000 ký tự, 60 lần sửa liên tiếp, số dòng logit W giữ cao nhất | ≤ 16.384 |
| A/A | F2-A/A / F2, cả tổng p50 lẫn đứng hình p90, mọi kiểu sửa | ≤ 1,25 |

Không đo đứng hình lúc chấm **lạnh**: W chạy đúng các cửa sổ như F2, thêm một lần
tra `Map` mỗi cửa sổ. Không gate thứ không thể khác.

#### Luật

* A/A trượt → vô hiệu, chạy lại một lần, lại trượt thì dừng.
* Điều kiện 1 lệch dù một issue → **lỗi cài đặt**, không phải ứng viên trượt: sửa
  rồi đo lại toàn bộ.
* Qua hết → `DEFAULT_WINDOW_CACHE = 256`. Trượt 2, 3 hoặc 4 → giữ 0.

#### Ghi trước để không tự lừa mình

* **Điều kiện 2 gần như chắc qua**: đếm cấu trúc ở trên đã nói 1–4 cửa sổ trên 43.
  Nó có mặt để bắt cache không trúng trong thực tế (khoá lệch vì chuỗi tokenize khác
  với chuỗi đếm), không phải để chứng minh ý tưởng.
* **Điều kiện 4 là trần cấu trúc**, cũng gần như chắc qua. Con số đáng đọc ở mục
  đó là **F2** — bộ nhớ của bản đang ship tăng tới đâu.
* **Điều kiện đáng lo thật là 1.** Cache sai thì không đổ, không chậm — chỉ lặng lẽ
  gạch sai chỗ.

#### Kết quả — `dev/bench-editcache.html`, lần chạy đầu tiên: **trượt, giữ 0**

Trang chạy hết không đổ. Tự chấm:

| | kết quả | cần | |
|---|---|---|---|
| A/A | tệ nhất x1,14 | ≤ 1,25 | qua |
| 1 đồng nhất | **240/240 · 240/240**, 3.005 issue, 1.405 lần trúng cache cửa sổ | tất cả | qua |
| 2 chi phí sửa — gõ thêm cuối | **x0,02** (56ms so 3,1 giây), 1 lượt model | ≤ 0,25 | qua |
| 2 chi phí sửa — thay từ giữa | **x0,04**, 2 lượt | ≤ 0,25 | qua |
| 2 chi phí sửa — **xoá từ giữa** | **x0,47**, **22 lượt** trên 43 | ≤ 0,25 | **trượt** |
| 3 đứng hình p90 — ba kiểu sửa | x0,78 / x0,84 / x1,02 | ≤ 1,25 | qua |
| 4 bộ nhớ W | 15.553 dòng | ≤ 16.384 | qua |

Luật: trượt 2 → **`DEFAULT_WINDOW_CACHE` giữ 0.** W giống hệt F2 ở mọi issue, rẻ hơn
ở cả ba kiểu sửa, không đứng hình hơn, có trần bộ nhớ — và vẫn không ship, vì nó
trượt một điều kiện đã ghi. Lần này điều kiện **không** đặt sai: nó bắt đúng một
chỗ thiết kế hỏng.

#### Chỗ hỏng nằm ở phép đếm thiết kế, không ở code

Phép đếm cấu trúc ở đầu mục này thử ba kiểu sửa — thêm cuối, thay một từ, đổi dấu —
và **không thử xoá hay chèn nguyên một từ**. Chạy lại với đủ năm kiểu, 40 văn bản
6.000 ký tự không dấu câu, số cửa sổ phải chạy lại:

| | thêm cuối | thay giữa | đổi dấu | **xoá từ** | **chèn từ** | tổng |
|---|---|---|---|---|---|---|
| F2 | 1,0 | 3,9 | 2,5 | **17,2** | **16,3** | 42,8 |
| cắt theo nội dung | 1,0 | 2,3 | 2,2 | **2,5** | **2,6** | 58,4 |

F2 chỉ tự khớp lại khi **số từ** không đổi. Thêm hay bớt nguyên một từ thì mọi từ
phía sau dời chỉ số, điểm bắt đầu cửa sổ bám theo offset subword rơi lệch một từ, và
độ lệch đó kéo dài tới cuối bài trong khoảng một nửa số ca. Kết luận "F2 tự khớp lại"
trong phần thiết kế — và việc loại phương án cắt theo nội dung — đều rút ra từ một
phép đếm thiếu đúng hai kiểu sửa làm hai phương án khác nhau.

Đây là họ lỗi của cả dự án, ở tầng thấp nhất: **đo đủ trường hợp mình nghĩ tới, trong
khi người dùng xoá chữ còn nhiều hơn thay chữ.** Ngưỡng ghi trước bắt được nó; một
lập luận thiết kế thì không.

#### Hai thứ còn nguyên sau đợt này

* **Lỗi bộ nhớ trong bản đang ship vẫn còn**, vì W không ship. Đo được: 60 lần sửa
  bài 2.000 ký tự không dấu câu, F2 giữ **26.460** dòng logit (60 mục câu, tăng đều
  mỗi lần sửa); trần là 400 mục. Với bài 6.000 ký tự thì 400 × ~1.340 dòng. Chặn cache
  theo câu bằng **số dòng** thay vì số mục là sửa riêng, không đổi issue nào — nhưng
  đổi thời gian ở ca biên, nên vẫn cần đo.
* **Code cache cửa sổ nằm sẵn trong `onnxEngine.js`, tắt.** Đợt sau chỉ cần thêm kế
  hoạch cửa sổ cắt theo nội dung (một ứng viên đường lui mới, `F2c`) rồi đo lại **cả
  chất lượng** — cửa sổ khác thì issue khác, không còn điều kiện "giống hệt" để dựa.

---

### 36. "Model chậm" hoá ra là "dán vào không soát" — và suýt sửa nhầm bằng cả một kiến trúc

Chủ repo thử trên Facebook thật (việc số 1): tầng model **có** gạch `cứ→cư`, nhưng
"mất một lúc mới hiện". Chuỗi giả thuyết của phiên này, theo đúng thứ tự, vì thứ
tự đó là bài học:

1. **"Mỗi trang tự nạp lại model 78MB."** Đúng là code làm vậy (xem dưới), và tôi
   đã đề xuất cả một kiến trúc offscreen document để sửa. Chủ repo bác: *chậm cả khi
   không F5.*
2. **"Phần chấm chạy chậm trên Facebook."** Thêm công cụ đo vào content script. Log
   Console không hiện gì — Console lọc theo ngữ cảnh, content script ở ngữ cảnh
   riêng. Chuyển sang ghi dấu lên DOM.
3. Trước khi có số, chủ repo tự nhận ra: **dán xong thì không hiện, phải gõ thêm.**
   Không phải chậm — là **không được gọi**.

#### Nguyên nhân, đo trên Lexical thật

Ô "Tạo bài viết" của Facebook là Lexical. Trên `playground.lexical.dev`:

| thao tác | sự kiện `input` | thay đổi DOM |
|---|---|---|
| dán 53 ký tự | **0** — Lexical chặn `paste` mặc định (`defaultPrevented = true`) rồi tự chèn | 1 đợt |
| gõ " nhé" | **0** — chỉ có `beforeinput(insertText)` | có |

Content script chỉ nghe `input` và `focusin`. Dán xong không có gì báo văn bản đã
đổi, nên cả tầng luật lẫn tầng model đều không chạy, cho tới khi một phím gõ nào đó
tình cờ sinh ra `input`. Lỗi này nằm **trước** model: dán `chia sẽ` vào cũng không
có gạch.

#### Sửa

Khi một ô `contenteditable` được focus, gắn `MutationObserver` lên chính nó
(`characterData`, `childList`, `subtree`) và gọi `schedule()` khi **chữ** đổi —
so `textContent` với lần trước, vì trang có thể dựng lại node mà nội dung y nguyên,
và mỗi lần như thế tooltip sẽ bị đóng. Không tự kích hoạt vòng lặp: gạch chân trong
`contenteditable` dùng CSS Highlight API, không chèn node nào vào ô; lớp phủ của
textarea nằm ngoài ô. `input` vẫn giữ cho textarea/input, nơi đổi `value` không sinh
mutation.

#### Kiểm

* **Facebook thật, chủ repo:** "ổn rồi" — dán là có gạch, không phải gõ thêm. (Kiểm
  trên bản có công cụ đo **chưa** bị chặn bởi cờ; phần chặn cờ kiểm ở dòng dưới.)
* **`dev/harness-content.html`**: nạp nguyên `content/index.js` với `chrome.*` giả
  lập, thay nội dung ô bằng thao tác DOM trực tiếp — 0 sự kiện `input` — gạch `cứ`
  sau **607ms** = 405ms debounce + 2ms tầng luật + 200ms model (3 lượt). Cờ đo tắt:
  **0** thuộc tính `data-soat-*` trên trang. Giới hạn của trang thử: tab ẩn thì
  `focus()` không bắn `focusin`, phải bắn tay.

#### Công cụ đo giữ lại, TẮT MẶC ĐỊNH

Nó ghi `data-soat-*` lên thẻ `<html>` — trang nào cũng đọc được, tức phát hiện được
người dùng cài Soát và thấy độ dài văn bản họ gõ. Nên nó chỉ bật khi
`chrome.storage.local` có `soatDebug: true`, và **phải gỡ hẳn trước khi nộp store**.
Giữ vì nó là cách duy nhất có số đo thật trong Chrome thật: `soatModel` ghi thời gian
nạp model của trang đó, `soatLog` ghi 8 lượt chấm gần nhất tách theo từng khâu.

#### Bài học

* **"Chậm" do người dùng báo là một triệu chứng, không phải một số đo.** Hai giả
  thuyết đầu đều hợp lý, đều có code chứng minh là *có thể* đúng, và cái đầu tiên đã
  kéo theo một đề xuất kiến trúc. Cả hai sai. Đo trước khi sửa — kể cả khi mình tin
  đã biết nguyên nhân.
* **Họ lỗi quen thuộc, lần này ở tầng DOM:** mọi trang thử (`dev/playground.html`,
  localhost) đưa văn bản vào bằng cách gõ hoặc gán `value`, tức luôn có `input`.
  Người dùng thật **dán** — và trình soạn thảo thật tự quản DOM.
* **Chuyện nạp model mỗi trang vẫn là thật**, chỉ không phải thủ phạm lần này. Chưa
  đo trong Chrome thật; giờ đo được bằng `soatModel`.

---

### 37. Mỗi trang tự nạp model — đo trong Chrome thật, luật chọn ghi TRƯỚC

Việc số 1 của bàn giao. `manifest.json` chèn content script vào `<all_urls>`, và
content script gọi `model.load()` ngay khi trang mở: **mỗi trang** nạp 78MB model +
14MB wasm và tạo một phiên onnxruntime riêng — kể cả trang không có ô nhập liệu nào.
Hai hướng sửa đã nghĩ tới, nạp lười và offscreen document, đều có giá. Quyết định 36
dạy rằng đề xuất kiến trúc trước khi có số là cách sửa nhầm, nên mục này ghi **cách
đo và luật chọn** trước lần đo đầu tiên.

#### Công cụ: `dev/measure-chrome.mjs`

Bàn giao định đo tay (chế độ đo + Shift+Esc): một mẫu cho mỗi ô, không đối chứng.
Thay bằng một script Node lái **Chrome đã cài trên máy** (152) qua CDP bằng pipe,
profile tạm, nạp **gói store giải nén** (`dist/soat-1.0.0.zip`) bằng
`Extensions.loadUnpacked` — cùng đường `chrome-extension://`, cùng content script
người dùng nhận.

Trang thử do script tự phục vụ ở 127.0.0.1; mỗi tab một **site khác nhau**
(`t1.test`…`t8.test`, trỏ về 127.0.0.1) để mỗi tab một renderer riêng như các trang
khác tên miền ngoài đời. Trang có một `textarea`, một ô `contenteditable` và vài đoạn
văn — không script nào khác.

Mỗi lần mở Chrome là một **lượt**, theo thứ tự:

1. **Tuần tự:** mở t1…t4, mỗi tab ở tiền cảnh 10 giây rồi mới mở tab sau.
2. **Bộ nhớ S4:** đợi 5 giây, đọc; rồi ép GC từng tab (`HeapProfiler.collectGarbage`)
   và đọc lần nữa. Đọc = cộng **private bytes** (`PrivateUsage`, thứ cột "Memory
   footprint" của Task Manager Chrome hiện trên Windows) của mọi renderer, **trừ tiến
   trình của chính extension** (`--extension-process`) — đó là chi phí một lần, không
   theo tab.
3. **Đồng thời:** mở t5…t8 cùng lúc (như khôi phục phiên khi mở Chrome), đợi 20 giây,
   đọc **S8** như bước 2.
4. **Dán, chỉ lượt bật:** ở t1, focus ô `contenteditable` rồi thay nội dung bằng thao
   tác DOM — không bắn `input`, như Lexical khi dán — bằng đoạn thử 494 ký tự của bàn
   giao: có dấu câu, rồi không dấu câu, rồi có dấu câu lần nữa (cache ấm). Ghi
   `soatLog`, kiểm gạch nằm đúng dưới `cứ`.

Sáu lượt xen kẽ: tắt, bật, tắt, bật, tắt, bật — **tắt** là không nạp extension. Mỗi
tab ghi ở ngữ cảnh chính của trang (`PerformanceObserver`, cài trước mọi script):
mọi long task trong thời gian đứng của tab, và lúc `soatModel` đổi. Lượt bật đặt
`soatDebug` qua service worker trước khi mở tab đầu.

#### Đại lượng

| | là gì | lấy từ |
|---|---|---|
| **T** | nạp model ở tab mở tuần tự | `soatModel` t2–t4, trung vị 9 mẫu |
| **L** | long task dài nhất một trang phải chịu khi nạp | "long task dài nhất trong 10 giây" của t1–t4, trung vị 12 mẫu |
| **M** | bộ nhớ thêm mỗi tab | (trung vị S4 bật − trung vị S4 tắt) / 4, **sau** ép GC |
| T₁ | nạp model ở tab đầu tiên sau khi mở Chrome | `soatModel` t1, 3 mẫu |
| T∥ | nạp model khi 4 tab mở cùng lúc | `soatModel` t5–t8, 12 mẫu |
| M8, M trước GC | như M | S8 / 8; S4 không ép GC |
| tổng đứng hình | Σ (long task − 50 ms) trong thời gian đứng | t1–t4 |

Chỉ **T, L, M** vào luật. Phần còn lại ghi để hiểu, không để chọn.

#### Đối chứng và điều kiện hợp lệ

* **A/A bộ nhớ:** ba lượt tắt, (max − min của S4 sau GC) / 4 ≤ **10 MB**. Trượt → chạy
  lại cả bộ một lần; lại trượt thì M không đo được và dừng.
* **Trang thử sạch:** trung vị "long task dài nhất" của t1–t4 ở lượt tắt ≤ **50 ms**.
  Trượt → L vô hiệu.
* **Đủ thời gian:** tab nào ở lượt bật chưa `san-sang` khi hết thời gian đứng → nâng
  thời gian đứng lên 30 giây / 60 giây cho **mọi** lượt, cả bật lẫn tắt, và chạy lại
  cả bộ.

#### Luật chọn

| kết quả | điều kiện | làm gì |
|---|---|---|
| **giữ nguyên** | M ≤ 30 MB **và** L ≤ 100 ms **và** T ≤ 1,5 s | không đổi kiến trúc, sang việc số 2 |
| **nạp lười** | không giữ nguyên được, nhưng M ≤ 100 MB **và** L ≤ 200 ms **và** T ≤ 2 s | nạp model khi focus ô đủ điều kiện lần đầu trên trang |
| **offscreen** | còn lại | offscreen document; ghi điều kiện chấp nhận của nó trước khi viết code |

Vì sao những con số này — viết trước khi có số:

* **L ≤ 100 ms để giữ nguyên:** nạp ở mọi trang nghĩa là mỗi lần mở trang, trang đứng
  một lần trong lúc người dùng cuộn hay bấm. 100 ms là ngân sách phản hồi của RAIL.
* **L ≤ 200 ms để nạp lười:** nạp lười dời đúng lần đứng ấy tới **lúc người dùng bắt
  đầu gõ** — nó rơi thẳng vào một tương tác, nên phải nằm trong mức "tốt" của INP.
* **M ≤ 30 MB để giữ nguyên:** trả cho mọi tab, kể cả tab không bao giờ gõ. 10 tab là
  300 MB.
* **M ≤ 100 MB để nạp lười:** chỉ trả cho tab đã gõ. Người dùng mục tiêu mở sẵn
  Facebook, Messenger, Gmail — 3–5 tab, tức ≤ 500 MB.
* **T ≤ 2 s để nạp lười:** lần dán đầu tiên mỗi trang đợi T + 400 ms debounce mới có
  gạch của model.

Offscreen trả nạp và bộ nhớ **một lần cho cả trình duyệt** và không đứng trang nào,
nên nó là nhánh "còn lại" chứ không cần ngưỡng. Giá của nó — quyền mới, văn bản đi
qua message nội bộ, đúng loại thay đổi từng giết tầng model hai tuần (quyết định 24)
— đo riêng khi làm.

#### Ghi trước để không tự lừa mình

* **Dự đoán: giữ nguyên gần như chắc trượt.** Trọng số 78MB nằm trong heap wasm của
  từng tab, M khó dưới 80 MB. Câu hỏi thật là **L**: `InferenceSession.create` tối ưu
  đồ thị bên trong wasm, trên luồng chính — tôi đoán một long task vài trăm ms, tức
  offscreen. Viết ra để nếu số nói khác thì thấy mình đoán sai, không phải để số chiều
  theo.
* **M đọc sau ép GC là chặn dưới:** bộ đệm 78MB vừa tải có thể còn nằm chờ GC trên máy
  người dùng. Nếu M trước và sau GC nằm hai phía một ngưỡng, ghi rõ — người dùng thấy
  số trước GC.
* **Không đo được ở đây:** đĩa lạnh thật (T₁ là tab đầu *sau khi mở Chrome*, file đã
  nằm trong cache hệ điều hành từ lượt trước), máy yếu hơn (máy đo 8 nhân / 16 luồng,
  15,3 GB), và **Facebook** (C của bàn giao — cần đăng nhập; chủ repo đo bằng chế độ
  đo). Người dùng mục tiêu hay dùng laptop yếu hơn, nên T và L ở đây là **chặn dưới**.
* **Cờ Chrome khác người dùng:** `--remote-debugging-pipe`,
  `--enable-unsafe-extension-debugging`, profile trắng, không extension nào khác. Không
  cờ nào đổi cách nạp wasm hay chạy content script.

#### Sửa trước lượt đo chính thức — ghi lại cả số của hai lượt thử

Viết xong `dev/measure-chrome.mjs` thì chạy thử để bắt lỗi công cụ. Thử là **thấy số**,
nên ghi cả số ra đây — để ai đọc cũng biết lượt chính thức chạy sau khi tôi đã thấy gì.
Luật chọn và ngưỡng ở trên **không đổi**.

| lượt thử, 1 tắt + 1 bật | T | L | M sau GC | T∥ |
|---|---|---|---|---|
| có cửa sổ, đứng 10 s / 20 s | 387 ms | 147 ms | 281 MB | 773 ms |
| headless, đứng 4 s / 5 s | 392 ms | 158 ms | 276 MB | 749 ms |

Ba thứ sửa sau khi thử:

1. **Headless.** Chrome bật cửa sổ sáu lần giữa lúc chủ repo đang làm việc, và chủ repo
   yêu cầu dừng. Lượt chính thức chạy `--headless` — cùng `chrome.exe`, cùng
   `Extensions.loadUnpacked`, cùng content script. Hai lượt thử ở bảng trên cho T, L, M
   lệch nhau 1–7%. **Luật thêm:** nếu T, L hoặc M của lượt chính thức lệch quá 25% so
   với lượt thử có cửa sổ thì không kết luận bằng headless, ghi rõ và hỏi chủ repo.
2. **"TỔNG từ input đầu" trong chế độ đo đếm sai.** Chỉ `timing.start()` mới xoá đợt
   input, mà `run()` thoát sớm (ô dưới 12 ký tự, model chưa nạp) thì không gọi nó. Bấm
   vào ô soạn bài rồi vài giây sau mới dán thì TỔNG tính từ **cú bấm**: lượt thử ra 1.444
   ms và 2.856 ms cho một lần dán mà đổi DOM → có log thật chỉ ~600 ms. Phép đo C trên
   Facebook sẽ dính đúng lỗi này. Sửa: `run()` lấy đợt input ngay khi bắt đầu. Chỉ đụng
   code đo, không đụng hành vi.
3. **Tab rời tiền cảnh.** Lượt thử có cửa sổ ghi 2 tab `hidden` lúc đọc. Giờ đầu dò ghi
   mọi lần đổi `visibilityState`, và mẫu nào từng `hidden` trong thời gian đứng thì
   không kết luận.

Không sửa: nhận diện tiến trình extension. Cờ `--extension-process` có thật, nhưng tiến
trình của extension có sẵn trong Chrome tắt khi rảnh, nên số renderer nhỏ (~20 MB) lệch
một hai cái giữa các lượt. Tính ra không quá ~5 MB mỗi tab — A/A sẽ bắt nếu nó lớn hơn.

#### Kết quả — lượt chính thức, headless: **OFFSCREEN**

`node dev/measure-chrome.mjs`, commit `b44e1d0`, sáu lượt xen kẽ, máy Ryzen 9 8945HS
(16 luồng, 15,3 GB). Không điều kiện hợp lệ nào trượt:

| | kết quả | |
|---|---|---|
| A/A bộ nhớ | 0,5 MB/tab | cần ≤ 10 — qua |
| trang thử sạch | long task dài nhất ở lượt tắt: **0 ms** | cần ≤ 50 — qua |
| đủ thời gian | 24/24 tab bật `san-sang` trong thời gian đứng | qua |
| tiền cảnh | 0 tab từng `hidden` | qua |
| headless so lượt thử có cửa sổ | T +5% · L +9% · M −1% | cần ≤ 25% — qua |

| | số | ngưỡng giữ nguyên / nạp lười |
|---|---|---|
| **T** nạp, tab tuần tự | **408 ms** | ≤ 1,5 s / ≤ 2 s — qua cả hai |
| **L** long task dài nhất | **160 ms** | ≤ 100 ms **trượt** / ≤ 200 ms qua |
| **M** bộ nhớ thêm mỗi tab, sau GC | **279 MB** | ≤ 30 **trượt** / ≤ 100 **trượt** |
| T₁ tab đầu sau khi mở Chrome | 495 · 440 · 445 ms | — |
| T∥ 4 tab cùng lúc | 705 ms | — |
| M trước GC · M với 8 tab | 285 MB · 275 MB | — |
| tổng đứng hình mỗi trang | 122 ms | — |

**Luật: offscreen.** Và nó được chọn **chỉ vì bộ nhớ** — T và L qua ngưỡng nạp lười.

Renderer của một tab: **~20 MB** khi tắt, **294–306 MB** khi bật, ổn định tới từng MB
qua ba lượt. 8 tab là **2,2 GB** thêm. Người dùng mở 10 tab thì Soát ăn ~2,8 GB, kể cả
khi không gõ chữ nào.

#### Dự đoán của tôi sai một nửa

Tôi đoán L vài trăm ms và offscreen sẽ thắng nhờ **đứng hình**. Sai: mỗi trang có hai
long task, ~70 ms (nạp module) rồi **~160 ms** (tạo phiên onnxruntime) — dưới ngưỡng
200 ms của nạp lười. Đoán M trên 80 MB thì đúng, mà thấp hơn thật tới 3,5 lần. Nếu M
chỉ ~80 MB như tôi hình dung, luật đã chọn **nạp lười**. Tức kiến trúc được chọn bằng
đúng con số tôi đoán sai — ghi trước là thứ duy nhất cho thấy điều đó.

#### 279 MB nằm ở đâu

Một lượt headless riêng, ép GC rồi đọc `Performance.getMetrics` của tab: **JS heap
8 MB** khi bật, dưới 1 MB khi tắt. ~270 MB còn lại nằm **ngoài JS heap** — bộ nhớ wasm
của onnxruntime, thứ không bao giờ co lại. Model 78 MB chiếm ~3,5 lần kích thước của nó
khi đã nạp. Chưa tách tiếp (bản sao bytes model, trọng số sau đóng gói, arena).

Hai hệ quả:
* **Offscreen vẫn trả ~280 MB, chỉ là một lần.** Đó vẫn là con số lớn cho một extension
  soát chính tả — việc số 6 (giảm dung lượng) giờ đi thẳng vào bộ nhớ, không chỉ vào
  gói tải.
* Chưa biết bao nhiêu phần tỷ lệ thuận với model và bao nhiêu là cố định (arena, bộ nhớ
  wasm đã phình lúc tạo phiên). Đo trước khi hứa "model nhỏ một nửa thì RAM nhỏ một nửa".

#### Dán trong extension thật (không vào luật)

Đoạn thử 494 ký tự, thay DOM không bắn `input`, ba lượt bật, đổi DOM → có log:

| | ms | model |
|---|---|---|
| có dấu câu, lạnh | 606–612 | ~200 ms, 7 lượt |
| không dấu câu (F2), lạnh | 546–559 | ~145 ms, 3 lượt |
| có dấu câu, cache ấm | 418–420 | 0 lượt |

Khớp 607 ms của `dev/harness-content.html` — 400 ms trong đó là debounce. Cả 9 lần gạch
đúng một chỗ dưới `cứ`, không gạch chỗ nào khác. Phép đo C trên Facebook chưa làm; giờ
nên đo trên bản offscreen thay vì bản sắp bị thay.

---

### 38. Offscreen document — điều kiện chấp nhận ghi TRƯỚC khi viết code

Quyết định 37 chọn offscreen vì bộ nhớ: mỗi tab thêm 279 MB. Mục này ghi thiết kế và
điều kiện ship **trước dòng code đầu tiên**.

#### Thiết kế

```
content script (mỗi tab)            service worker            offscreen document         Worker (module)
  tầng luật, vẽ, tooltip  ──check──►  tạo offscreen nếu    ──►  chuyển tiếp, hàng đợi ──►  OnnxEngine
  không còn onnxruntime   ◄─issues──  chưa có (lần đầu)    ◄──  huỷ lượt cũ theo ô    ◄──  y nguyên
```

* **Content script không nạp model nữa.** Nó gửi `chrome.runtime.sendMessage` với văn
  bản của ô và nhận lại đúng mảng Issue mà `check()` trả. Tầng luật vẫn chạy và vẽ ngay
  tại trang như cũ.
* **Offscreen tạo lười**, lần đầu một ô đủ điều kiện được focus — không phải lúc mở
  Chrome. Người không gõ gì trong cả phiên thì không tốn MB nào.
* **Suy luận chạy trong một module Worker** do offscreen tạo. Lý do offscreen khai với
  Chrome là `WORKERS` — và nó phải đúng sự thật: đội duyệt store đọc ô giải trình.
* **Một phiên onnxruntime cho cả trình duyệt**, nên phải có **hàng đợi**; lượt chấm cũ
  của cùng một ô bị huỷ khi có lượt mới, như `signal` hiện nay.
* `OnnxEngine`, ngưỡng, chấm theo câu, F2, cache — **không đổi một dòng**. Cache giờ dùng
  chung cho mọi tab.
* `minimum_chrome_version` 105 → **116** (`chrome.runtime.getContexts` /
  `offscreen.hasDocument`). Bỏ `models/*` và `vendor/*` khỏi `web_accessible_resources`:
  trang offscreen là trang extension, không cần; và hiện trang web nào cũng dò được Soát
  bằng cách fetch `chrome-extension://<id>/models/soat.int8.onnx`.
* Giá: quyền `offscreen`; văn bản đi qua message nội bộ của extension — không rời trình
  duyệt, nhưng chính sách riêng tư phải nói ra.

#### Cách đo — `dev/measure-chrome.mjs` mở rộng, headless

Ba biến thể, chín lượt xen kẽ: **tắt, A, O** × 3. **A** = bản đang ship, gói ở `5ae8e90`
(`dist/soat-A-5ae8e90.zip`). **O** = bản offscreen. Mỗi lượt, A và O chạy y hệt nhau:

1. Mở t1, đứng 10 s.
2. **Dán lạnh** ở t1: bấm vào ô rồi dán ngay đoạn thử **có dấu câu**. Với O, đây là lần
   đầu cả trình duyệt cần model: tạo offscreen, Worker, nạp model.
3. t2–t4 tuần tự, 10 s mỗi tab. **S4** như quyết định 37, cộng private bytes **mọi**
   tiến trình của Chrome.
4. t5–t8 cùng lúc, 20 s. **S8**.
5. **Dán ấm** ở t1: đoạn thử **không dấu câu** (cache lạnh), rồi **có dấu câu** (cache ấm).
   Ghi long task của t1 trong lúc chấm.
6. **Hai tab dán cùng lúc**: t2 đoạn có dấu câu, t3 đoạn không dấu câu.
7. **Sau khi rảnh**: đợi 45 s (service worker tắt sau 30 s rảnh), dán ở t1 **đoạn biến
   thể** — câu cuối thành *"Gần một nửa dân số cứ trú tại vùng đồng bằng ven biển."* để
   không trúng cache. Với O, đọc số lần offscreen đã nạp model.

Bộ nhớ đọc bằng **hiệu S8 − S4**, không nhận diện tiến trình: lượt thử của quyết định 37
cho thấy cờ `--extension-process` không đáng tin khi tiến trình extension có sẵn trong
Chrome tắt lúc rảnh. Hiệu S8 − S4 là giá của 4 tab mở thêm khi mọi thứ dùng chung đã có.

#### Điều kiện

| # | điều kiện | cần |
|---|---|---|
| 1 | **đúng**: O gạch đúng một chỗ dưới `cứ`, không chỗ nào khác, ở mọi lần dán đoạn thử (bước 2, 5, 6 — năm lần mỗi lượt) | **15 / 15** |
| 2 | **bộ nhớ mỗi tab**: [(S8 − S4) của O − (S8 − S4) của tắt] / 4, trung vị, sau GC | ≤ **30 MB** |
| 3 | **bộ nhớ một lần**: (S4 O − S4 tắt) − 4 × số ở điều kiện 2, trung vị, sau GC | ≤ **350 MB** |
| 4 | **đứng hình lúc mở trang**: long task dài nhất trong 10 s của t1–t4, trung vị, O | ≤ **50 ms** |
| 5 | **đứng hình lúc chấm**: long task dài nhất của t1 trong hai lần dán ấm, lớn nhất qua 3 lượt, O | ≤ **50 ms** |
| 6 | **dán ấm**: đổi DOM → có log, từng đoạn, trung vị O − trung vị A | ≤ **+100 ms** |
| 7 | **dán lạnh** của O (bước 2), trung vị | ≤ **2.000 ms** |
| 8 | **sau khi rảnh**: O gạch **giống hệt** A ở đoạn biến thể; offscreen không nạp lại model; thời gian ≤ trung vị dán ấm không dấu câu của O + 300 ms | **3 / 3** |
| A/A | bộ nhớ ba lượt tắt: (max − min của S4 sau GC) / 4 | ≤ 10 MB |

Số 30 MB và 2.000 ms lấy lại từ quyết định 37 (ngưỡng "giữ nguyên" cho bộ nhớ mọi tab,
ngưỡng "nạp lười" cho lần dán đầu phải đợi nạp). 350 MB = 279 MB của A cộng khoảng một
trang extension và một Worker. 50 ms là định nghĩa long task: O không được để lại long
task nào trên trang.

#### Luật

* 1 hoặc 8 trượt → **lỗi cài đặt**, không phải thiết kế trượt: sửa, đo lại toàn bộ. Trượt
  lần hai thì dừng và báo.
* A/A trượt → chạy lại một lần; lại trượt thì dừng.
* 2–7 trượt → **không ship O**; ghi số, cân nhắc lại.
* Qua hết → O thành bản ship. Sửa `privacy-policy.md`, `listing.md`, `nop-store.md`, đóng
  gói lại.

#### Ghi trước để không tự lừa mình

* **2 và 4 gần như chắc qua**: content script chỉ còn tầng luật. Chúng có mặt để bắt việc
  vô tình vẫn import onnxruntime ở trang.
* **3 là điều kiện tôi không chắc**: đoán 300–330 MB, sát ngưỡng.
* **8 là rủi ro thật**: Chrome có đóng offscreen không, service worker ngủ rồi message có
  còn tới offscreen không. Đó đúng là loại lỗi "không crash, chỉ mất một tầng" của quyết
  định 24 — nên điều kiện đòi **gạch giống hệt A**, không chỉ "có gạch".
* **7**: đoán ~1,1 s (400 ms debounce + ~500 ms tạo offscreen, Worker, nạp model + ~200 ms
  chấm).
* Không đo: Facebook (C của bàn giao), máy yếu, Chrome thật sự vừa khởi động lại máy.

#### Cài đặt, và một lỗi chỉ Chrome thật mới thấy

`fe61fc5`. Lần chạy đầu trong Chrome headless: offscreen được tạo, Worker chạy, message
đi về đủ — và log ghi `LỖI model không nạp được`, không gạch nào. CSP mặc định của trang
extension MV3 là `script-src 'self'`, **không cho biên dịch WebAssembly**. Content script
cũ không vướng vì nó không chạy dưới CSP đó. Không crash; tầng luật vẫn gạch; tầng model
im lặng — đúng họ lỗi của quyết định 24. Sửa: `content_security_policy.extension_pages`
thêm `'wasm-unsafe-eval'`, và `manifest.test.mjs` canh nó.

#### Sửa công cụ trước lượt đo chính thức — kèm số của hai lượt thử

Như quyết định 37: thử là thấy số, nên ghi số ra. Mỗi lượt thử một bộ tắt/A/O, đứng 3 s /
4 s, rảnh 35 s. **Điều kiện và ngưỡng không đổi.**

| | 1 | 2 | 3 | 4 | 5 | 6 (không dấu câu / cache ấm) | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| thử 1 — chỉ ép GC các tab | 5/5 | −3,6 MB | **399 MB** | 0 ms | 0 ms | +1 / −4 ms | 600 ms | 1/1 |
| thử 2 — ép GC cả Worker | 5/5 | −3,0 MB | **351 MB** (trước GC 419) | 0 ms | 0 ms | −2 / −1 ms | 597 ms | 1/1 |

A ở cùng các lượt: long task lúc mở trang 149–166 ms, lúc chấm 50–119 ms.

1. **"Sau GC" phải ép GC ở nơi model sống.** Thử 1 chỉ ép GC các tab — đúng cho A, nơi
   model nằm trong tab, nhưng với O thì bộ đệm 78 MB model vừa tải nằm trong **Worker**
   (`backingStorageSize` 78.704.947 byte, về 147.247 sau GC). Công cụ giờ gắn vào trang
   offscreen, tự gắn xuống Worker của nó, và ép GC cả hai; lượt O nào không ép được Worker
   thì không kết luận. Đây là làm đúng định nghĩa đã ghi, không phải đổi nó — nhưng tôi
   **đã thấy** 399 rồi 351, nên kết quả chính thức ghi cả số trước GC.
2. **Thử 2 rơi cách ngưỡng 350 MB đúng 1 MB.** Ngưỡng giữ nguyên. Trung vị ba lượt rơi phía
   nào thì luật áp phía đó.
3. **Bước 6 không kiểm được thứ nó định kiểm.** Cache giờ dùng chung mọi tab, và hai đoạn
   của bước 6 đã được t1 chấm ở bước 2 và 5 — O trả cả hai với **0 lượt model**. Hàng đợi
   chưa hề bị hai tab tranh nhau. Lỗi ở thiết kế phép đo, không ở code: tôi viết điều kiện
   khi còn nghĩ theo kiến trúc cũ, mỗi tab một cache. Thêm **bước 6b, không vào luật**: hai
   tab cùng lúc dán hai đoạn chưa ai chấm (đổi "Tuần trước" và "Hơn một nửa"), so gạch với
   A. Điều kiện 1 vẫn đếm đúng 15 lần dán như đã ghi.

#### Kết quả — lượt chính thức, headless: **qua tám / tám, ship O**

`node dev/measure-chrome.mjs --plan 38`, công cụ ở `2c1c36a`, bản O ở `fe61fc5`, A ở
`5ae8e90`. Chín lượt: tắt / A / O × 3. A/A bộ nhớ ba lượt tắt: **2,3 MB/tab** (cần ≤ 10).

| # | điều kiện | O | A | cần |
|---|---|---|---|---|
| 1 | dán đúng một gạch dưới `cứ` | **15 / 15** | 15 / 15 | 15 / 15 |
| 2 | bộ nhớ mỗi tab | **1,8 MB** | 269,7 MB | ≤ 30 MB |
| 3 | bộ nhớ một lần | **305,5 MB** (trước GC 306,8) | — | ≤ 350 MB |
| 4 | long task lúc mở trang | **0 ms** (12/12 tab) | 150,5 ms | ≤ 50 ms |
| 5 | long task lúc chấm | **0 ms** | 59 ms | ≤ 50 ms |
| 6 | dán ấm so A | **+10 ms** / **+4 ms** | mốc | ≤ +100 ms |
| 7 | dán lạnh | **642 ms** | 616 ms | ≤ 2.000 ms |
| 8 | sau 45 s rảnh | **3 / 3** | mốc | 3 / 3 |

Private bytes của **toàn bộ Chrome**, sau GC, trung vị ba lượt:

| | 4 tab | 8 tab | thêm so với tắt, 8 tab |
|---|---|---|---|
| tắt | 477 MB | 562 MB | — |
| **A** (đang ship) | 1.575 MB | 2.739 MB | **+2.177 MB** |
| **O** (offscreen) | 790 MB | 882 MB | **+320 MB** |

Tám tab: **2,2 GB → 320 MB**, và phần lớn số còn lại là một bản model duy nhất. Tab thứ
chín trở đi gần như miễn phí — 1,8 MB, trong đó có cả tầng luật và lớp vẽ.

**Long task trên trang biến mất hẳn**: 12/12 tab của O không có long task nào lúc mở
trang (A: 129–173 ms), và không có long task nào lúc chấm (A: 53–59 ms khi một tab chấm,
**69–135 ms** ở bước hai tab chấm cùng lúc — mỗi tab một engine, mỗi engine giữ luồng
của trang mình). Suy luận giờ nằm trong Worker của offscreen, không trang nào chịu.

**Sau 45 giây rảnh** (service worker đã bị Chrome tắt): 3/3 lượt gạch **giống hệt A** ở
đoạn biến thể, **1 lượt model** thật (không trúng cache), **cùng mã offscreen** với lần
dán lạnh đầu lượt — offscreen sống, model không nạp lại, và message vẫn tới nơi sau khi
service worker ngủ rồi thức. Đây là điều kiện tôi ghi là rủi ro thật; nó qua.

**Cái giá, đo được:** dán lạnh 642 ms so 616 ms của A — nhưng hai con số không cùng nghĩa.
Ở A, model đã nạp sẵn trong tab từ lúc mở trang (và mỗi tab trả 270 MB cho việc đó). Ở O,
642 ms **đã bao gồm** dựng offscreen, dựng Worker và nạp model lần đầu cho cả trình duyệt
(404–418 ms, chạy song song với 400 ms debounce). Từ lần dán thứ hai trở đi, chênh lệch
là +4 đến +10 ms — hai chặng message.

**6b (không vào luật):** hai tab dán cùng lúc hai đoạn chưa ai chấm — 6/6 gạch giống hệt
A, mỗi tab 2–3 lượt model thật. Hàng đợi chạy đúng dưới tranh chấp thật.

**Không đo:** Facebook (C của bàn giao), máy yếu, Chrome vừa khởi động lại máy, và tình
huống người dùng mở hàng chục tab rồi gõ ở nhiều tab cùng lúc.

#### Thử trên Lexical THẬT — `dev/lexical-check.mjs`

Trang đo của quyết định 38 là một `contenteditable` trần do chính mình viết. Facebook thì
dùng Lexical, thứ đã giết tầng model một lần (quyết định 36). Gần nhất mà không cần tài
khoản: `playground.lexical.dev`, gói store thật, Chrome headless, dán bằng sự kiện `paste`
mang `clipboardData` để chính Lexical chèn nội dung.

Bản offscreen, ô đã có sẵn ~900 ký tự văn bản mẫu của trang:

```
dán 494 ký tự → 0 sự kiện input · DOM đổi 2 đợt · #3 ĐÃ VẼ · model 169–182 ms, 8 lượt
gạch: "chia sẽ" (w 72) · "trãi" (w 35) · "cứ" (w 25) — TỔNG từ input đầu 579–587 ms
đọc lại sau 2 giây, khi Lexical đã dựng lại DOM: y nguyên
```

Đúng chỗ cần đúng: **dán không bắn `input`** mà vẫn soát, và vệt gạch **sống qua lần
Lexical dựng lại DOM**.

**Bẫy mất bốn lượt chạy mới thấy, và nó suýt thành một kết luận sai.** Bốn lượt đầu cho
"dán vào không gạch gì" — trông hệt như quyết định 36 tái phát. Thật ra: **trong headless,
click chuột không bắn `focusin`**. Content script chỉ gắn `MutationObserver` khi có
`focusin`, nên không lượt soát nào chạy. Đặt một đầu dò đếm `focusin` ở ngữ cảnh trang mới
thấy: `focusin: []`. Ép `blur()` rồi `focus()` bằng tay là mọi thứ đúng ngay.

Ba điều rút ra, và điều thứ ba mới là điều đắt:

1. Cùng họ với ghi chú sẵn có của `dev/harness-content.html` ("tab ẩn thì `focus()` không
   bắn `focusin`, phải bắn tay") — bẫy đã biết, ở một chỗ mới, vẫn vấp.
2. Lượt chạy hỏng còn để lại một triệu chứng phụ đánh lạc hướng: các vệt gạch **cũ** tụt
   thành `Range` rỗng, bề rộng 0, sau khi Lexical dựng lại DOM. Nhìn thì tưởng lỗi vẽ; thật
   ra chỉ là không có lượt soát mới nào để vẽ lại.
3. **Đo "không có gì xảy ra" thì phải đo cả việc kích hoạt có xảy ra không.** Bốn lượt đầu
   tôi đọc gạch chân và log — hai thứ ở *cuối* chuỗi. Thứ hỏng nằm ở *đầu* chuỗi, và không
   có dấu vết nào của nó trong hai thứ đó.

**Để yên 5 phút rồi dán lại** (điều kiện 8 chỉ đo được 45 giây): `#5 ĐÃ VẼ · model 205 ms,
4 lượt, 19 câu trúng cache · TỔNG 611 ms`, gạch đúng `cứ`. Cache còn ấm nghĩa là **vẫn
đúng offscreen cũ** — Chrome không đóng nó sau khi service worker chết từ lâu.

#### Dựng lại "Task Manager của Chrome" bằng số — một tiến trình, và nó phình rồi xẹp

Chủ repo bảo kiểm lại chỗ này, và đúng là có một câu tôi nói sai. Đo lại, headless, 3 tab
khác site, dán ở cả ba (cả ba đều gạch đúng `cứ`):

```
   396 MB  renderer CỦA EXTENSION   <- offscreen + Worker, DUY NHẤT một cái
   240 MB  gpu-process              <- tiến trình 296 MB mà lượt đo trên Lexical chưa tách được
    66 MB  browser
 15-22 MB  mỗi renderer tab web     <- tab không giữ model nữa
```

Và nó **phình rồi xẹp**, không ép GC gì cả:

| lúc nào | tiến trình offscreen |
|---|---|
| ngay sau khi nạp model và dán ở 3 tab | **396 MB** |
| để yên 60 giây | **308 MB** |
| để yên 120 giây | 308 MB — đứng yên |

Bộ đệm 78 MB tải model tự được V8 thu hồi trong vòng một phút. Nên **305 MB của điều kiện
3 là con số đúng cho trạng thái ổn định** — ép GC chỉ làm sớm điều sẽ tự xảy ra. Nhưng câu
tôi nói với chủ repo, "Task Manager sẽ hiện một dòng ~300 MB", **sai ở phút đầu**: nó hiện
~390 MB rồi mới xuống. Người dùng mở Task Manager đúng lúc vừa gõ chữ đầu tiên sẽ thấy con
số cao hơn mọi con số trong tài liệu này.

Hai chi tiết nữa cho lần nhìn tận mắt: Chrome liệt kê **hai** dòng của Soát (service worker
~20 MB và trang offscreen ~310 MB), và những renderer extension 19–26 MB khác trong danh
sách là extension có sẵn của Chrome, không phải Soát.

#### Facebook thật — chủ repo xác nhận (18/09/2026)

Bản offscreen cài vào Chrome của chủ repo, dán đoạn thử vào ô "Tạo bài viết":

* **dán là có gạch, đúng một chỗ dưới `cứ`** — tầng model chạy, và chạy từ offscreen;
* **nhiều tab cùng gõ** — hàng đợi một phiên chịu được tranh chấp ngoài đời, không chỉ
  trên trang thử;
* **để yên một lúc rồi gõ lại** — offscreen sống qua lần service worker bị tắt.

**Chưa kiểm:** Task Manager của Chrome (Shift+Esc) để thấy tận mắt Soát chỉ còn **một**
dòng ~300 MB thay vì mỗi tab một dòng — con số đó mới chỉ đo bằng private bytes từ CDP,
chưa ai nhìn thấy nó trong giao diện Chrome. Và **bộ gõ tiếng Việt** (Unikey/EVKey) vẫn
chưa được thử lần nào, ở bất kỳ bản nào.

**`dev/lexical-check.mjs` không thay được việc thử trên Facebook thật**: trang nhẹ, không
React của Facebook, không bộ gõ tiếng Việt, và extension nạp qua CDP chứ không cài như
người dùng.

---

### 39. Cache theo câu chặn nhầm ĐƠN VỊ — ngưỡng ghi TRƯỚC

Quyết định 35 phát hiện ra nó rồi để nguyên vì cache cửa sổ không ship: `_cache` giữ logit
theo câu, trần là **400 MỤC**, mà một mục có thể là một từ hoặc cả một bài 6.000 ký tự
không dấu câu (~1.340 dòng logit). Đo được: 60 lần sửa một bài 2.000 ký tự không dấu câu
giữ **26.460 dòng**; trần lý thuyết 400 × 1.340 ≈ **536.000 dòng**.

Quyết định 38 làm nó nặng hơn theo hai hướng:

* cache giờ **dùng chung cả trình duyệt** và sống trong offscreen — nó không còn chết theo
  tab nữa, mà tích lại suốt phiên làm việc;
* bộ nhớ của offscreen giờ là con số người dùng nhìn thấy ở Task Manager, một dòng duy nhất.

Đây là **lần thứ hai** dự án chặn nhầm đơn vị ở đúng chỗ này. Lần trước (quyết định 35)
ngưỡng ghi trước bắt được; lần này sửa hẳn.

#### Sửa

`OnnxEngine` thêm `maxCacheRows`, mặc định **16.384 dòng** — cùng con số làm trần cho cache
cửa sổ ở quyết định 35. `_cachePut` đuổi LRU cho tới khi cả số mục lẫn **số dòng** nằm dưới
trần. Không đụng ngưỡng, không đụng chấm theo câu, không đụng F2, không bật cache cửa sổ.

#### Cách đo — node, session giả, không cần model

`dev/bench-cachecap.mjs`, viết cùng đoạn này. Session giả của `test/windowcache.test.mjs`
đã đủ: thứ đang đo là **kế toán cache**, không phải chất lượng model. Bốn kịch bản — 2.000
và 6.000 ký tự, có và không dấu câu — mỗi kịch bản 60 lần sửa liên tiếp xoay vòng đủ **năm
kiểu**: thêm cuối, thay một từ, đổi dấu một từ, **xoá một từ**, **chèn một từ** (hai kiểu
cuối là hai kiểu quyết định 35 đã bỏ sót lúc thiết kế).

#### Điều kiện

| # | điều kiện | cần |
|---|---|---|
| 1 | **đồng nhất**: mọi issue, kể cả confidence, giống hệt bản không chặn, cả bốn kịch bản × 60 phiên bản | **240 / 240** |
| 2 | **trần**: số dòng logit cao nhất giữ trong cache, mọi kịch bản | ≤ **16.384** |
| 3 | **chi phí**: tổng số lượt model của bản chặn / bản không chặn, từng kịch bản | ≤ **1,10** |
| 4 | bộ nhớ thật mỗi dòng (đo bằng `process.memoryUsage`), để biết 16.384 dòng là bao nhiêu MB | ghi lại, không gate |

#### Luật

* Điều kiện 1 lệch dù một issue → **lỗi cài đặt**: sửa, đo lại toàn bộ.
* 2 hoặc 3 trượt → không ship, ghi số, nghĩ lại trần.
* Qua hết → `maxCacheRows = 16.384` thành mặc định.

#### Ghi trước để không tự lừa mình

* **Điều kiện 3 là điều kiện đáng lo duy nhất**, và chỉ đáng lo ở bài dài không dấu câu:
  ở đó một mục là cả bài, nên chặn theo dòng đuổi mục nhanh hơn hẳn chặn theo mục. Dự
  đoán: vẫn qua, vì sau mỗi lần sửa thì văn bản mới **không** nằm trong cache ở cả hai bản
  (cả bài là một "câu", đổi một chữ là khoá đổi) — cache theo câu vốn đã gần như vô dụng ở
  ca đó. Nếu dự đoán này sai thì tỷ số sẽ nhảy vọt chứ không nhích, và đó là tín hiệu trần
  16.384 đặt quá thấp.
* **Điều kiện 1 gần như chắc qua** — đuổi cache chỉ được phép làm chậm, không được đổi kết
  quả. Nó có mặt vì đó đúng là thứ hỏng thì im lặng.
* Bài 6.000 ký tự **có dấu câu** sẽ không chạm trần (mỗi câu ~20 dòng), nên điều kiện 2 ở
  kịch bản đó chỉ để đối chứng.

#### Kết quả — `dev/bench-cachecap.mjs`, lần chạy đầu: **qua cả ba, ship**

| kịch bản, 60 lần sửa | dòng cao nhất: CÓ trần | KHÔNG trần | lượt model: có / không | tỷ số |
|---|---|---|---|---|
| 2.000 ký tự, có dấu câu | 1.477 | 1.477 | 128 / 128 | **x1,000** |
| 2.000 ký tự, không dấu câu | **16.377** | 26.467 | 840 / 840 | **x1,000** |
| 6.000 ký tự, có dấu câu | 2.741 | 2.741 | 237 / 237 | **x1,000** |
| 6.000 ký tự, không dấu câu | **15.158** | **82.369** | 2.625 / 2.625 | **x1,000** |

* **1 đồng nhất: 240 / 240** phiên bản giống hệt bản không trần, 40.537 issue.
* **2 trần: 16.377 dòng**, dưới 16.384.
* **3 chi phí: x1,000** ở cả bốn kịch bản — **không một lượt model nào** phải chạy thêm.

**Dự đoán ghi trước đúng, và đó là điều đáng nói:** ở bài dài không dấu câu, cache theo câu
vốn đã gần như vô dụng — cả bài là một "câu", đổi một chữ là khoá đổi, nên bản không trần
giữ 82.369 dòng mà **không trúng thêm một lần nào**. Nó chỉ tích lại. Đây là bộ nhớ trả cho
một thứ không ai dùng.

**Một dòng logit ≈ 264 byte** (đo bằng `process.memoryUsage` với `--expose-gc`, 50.000 dòng
mẫu). Nên:

| | dòng | bộ nhớ |
|---|---|---|
| trần mới | 16.384 | **4,1 MB** |
| đo được ở bài 6.000 ký tự sau 60 lần sửa, chưa trần | 82.369 | 21 MB **và vẫn đang tăng** |
| trần cũ theo mục (400 × ~1.340) | ~536.000 | **135 MB** |

135 MB là bộ nhớ nằm trong offscreen, dùng chung cả trình duyệt, cạnh 305 MB của model —
tức trong ca xấu nhất nó từng có thể **cộng thêm 44%** vào con số người dùng nhìn thấy ở
Task Manager.

#### Test, và hai đột biến

`test/windowcache.test.mjs` thêm ba test: trần theo dòng giữ được qua 20 phiên bản; **đuổi
cache không đổi kết quả**; **một mục dài hơn cả trần vẫn được giữ** (vứt nó là chấm lại cả
bài ngay lượt sau, mà lượt sau gần như chắc chắn cần đúng nó). Bỏ điều kiện đuổi theo dòng
→ trượt 2 test; đuổi cả mục cuối cùng → trượt test thứ ba.

Một test cũ của quyết định 35 khẳng định "bản tắt tăng theo số lần sửa, tới 400 bản" — câu
đó **không còn đúng** sau đợt này. Nó vẫn xanh chỉ vì trần mới nằm trên ngưỡng nó kiểm; đã
sửa lại cho khớp sự thật thay vì để một test xanh nói điều sai.

---

### 40. Xoá blob 311MB khỏi lịch sử git — và ba cái bẫy của việc viết lại lịch sử

`.git` nặng **627 MB** vì hai phiên bản của `extension/models/soat.fp32.onnx.data` (296,5 MB
mỗi bản, thêm ở `16865d6`, đổi ở `40c8111`, gỡ khỏi HEAD ở `c06a09d`). GitHub từ chối file
trên 100 MB, mà bước 2 của `docs/store/nop-store.md` cần repo trên GitHub để có URL chính
sách riêng tư. Tức một file chết chặn việc nộp store.

`git filter-branch -f --index-filter "git rm --cached --ignore-unmatch <đường dẫn>" -- --all`,
rồi bỏ `refs/original`, `reflog expire`, `gc --prune=now`.

| | trước | sau |
|---|---|---|
| `.git` | 627 MB | **2,6 MB** |
| cây của HEAD | `813ab3de…` | **`813ab3de…`** — giống hệt |
| số commit | 88 | 88 |
| md5 chuỗi thông điệp commit | `f6ebe6d8…` | `f6ebe6d8…` |
| blob trên 20 MB | 2 | **0** |
| `npm run test:all` | xanh | xanh (80 test JS + 2 bộ Python) |

Không dùng `--prune-empty`: commit `c06a09d` ("Blob 311MB vẫn nằm trong HEAD — commit trước
chỉ sửa .gitignore") chỉ gỡ file, nên nó sẽ rỗng và biến mất. Thông điệp đó là bằng chứng
của một lần vấp; giữ commit rỗng còn hơn mất nó.

File 311 MB vẫn nằm nguyên trên đĩa, chỉ là không được theo dõi (`.gitignore` đã chặn từ
`a8fa30c` cũ) — bản fp32 vẫn dùng để xuất lại ONNX được.

#### Bẫy 1 — tag KHÔNG phải lưới an toàn

Repo có sẵn tag `backup-before-filter` từ phiên trước, và tôi đặt thêm một tag "trước khi
xoá" nữa. **Cả hai đều vô dụng:** `-- --all` viết lại mọi ref, tag cũng bị viết lại, nên sau
khi chạy thì tag "backup" trỏ vào lịch sử MỚI. Thấy được điều này nhờ chạy thử trên bản sao
trước — trong lần thử, dòng `Ref 'refs/tags/backup-before-filter' was rewritten` hiện ra.

Lưới an toàn thật là một **bản chép nguyên thư mục `.git`** ra ngoài repo
(`D:/soat-git-backup-2026-09-18`, 627 MB). Khôi phục = xoá `.git` rồi chép ngược lại.

#### Bẫy 2 — lịch sử là bằng chứng, mà viết lại lịch sử đổi hết hash

Đây là chỗ đắt nhất, và suýt bỏ sót. Repo này **trích hash commit làm bằng chứng**: "ngưỡng
ghi ở `9dd0d51`, trước khi viết một dòng code". Rewrite đổi hash của mọi commit từ `16865d6`
trở đi — tức mọi trích dẫn ấy thành sai, và **chính cơ chế chứng minh tính trung thực của dự
án bị hỏng**, một cách im lặng.

Bảng ánh xạ của `filter-branch` (`.git/filter-branch/map`) đã bị `gc` dọn mất trước khi kịp
dùng. Dựng lại được nhờ bản chép `.git`: khớp `(thời điểm tác giả, thông điệp)` giữa hai
lịch sử — **88/88 commit khớp** — rồi thay hash ngắn trong toàn bộ tài liệu và mã nguồn: 14
chỗ ở `docs/decisions.md`, 5 ở `HANDOFF.md`, 2 ở `README.md`, 3 ở `dev/measure-chrome.mjs`,
2 ở `dev/bench-accept.html`, 1 ở `onnxEngine.js`, 1 ở `ml/threshold_report.py`. Kiểm lại:
mọi hash còn được trích đều `git cat-file -e` ra một commit thật.

**Bài học:** trước khi viết lại lịch sử, đếm xem có bao nhiêu chỗ đang trích hash. Nếu lịch
sử được dùng làm bằng chứng thì việc sửa tham chiếu là **một phần của thao tác**, không phải
việc dọn dẹp sau đó.

#### Bẫy 3 — ba lần vấp ở tầng "chạy được lệnh"

* **Lệnh bị chặn:** bộ lọc an toàn của môi trường chạy lệnh xếp `git filter-branch` vào
  nhóm phá huỷ và từ chối chạy trên repo thật. Không lách. Thay vào đó: chạy thử trọn vẹn trên
  `git clone --mirror` dùng một lần (biết trước con số sẽ ra), rồi đóng thao tác thành
  `dev/xoa-blob.sh` có kiểm chứng trước và sau, để chủ repo chạy.
* **Dán lệnh dài vào Git Bash vỡ:** terminal chèn mã bracketed-paste `^[[200~` vào đầu dòng,
  bash báo `command not found`. Một lý do nữa để đóng thành script.
* **`bash` trong PowerShell là WSL**, và máy chưa cài distro nào:
  `execvpe(/bin/bash) failed`. Phải gọi thẳng `C:\Program Files\Git\bin\bash.exe`.

`dev/xoa-blob.sh` giữ lại trong repo: nó ghi rõ đã kiểm những gì, và lần sau có file nặng
lọt vào lịch sử thì sửa đường dẫn là chạy được.

---

### 41. Cắt vocab — KHÔNG train lại, và ngưỡng ≥20 của bàn giao là sai hướng

Việc số 6. Bàn giao viết: *"chỉ 23.669/64.001 token PhoBERT xuất hiện; giữ token gặp ≥20 lần
phủ 99,69% số lượt, model về ~40MB. **Nguy hiểm:** `bpe.js` phải dùng đúng id mới"* — và nói
việc này **phải train lại**.

#### Hai chỗ bàn giao sai, đếm trước khi thiết kế

**Một: không phải train lại.** Vocab chỉ đi vào model qua đúng một phép `Gather` trên ma
trận embedding. Đo trên file đang ship: **46,9 MB trên tổng 74,2 MB initializer** là
`word_embeddings.weight_quantized [64001, 768]`. Cắt dòng và đánh số lại id là **phẫu
thuật**, không phải huấn luyện. Đầu ra là 23 nhãn, không dính gì tới vocab.

**Hai: ngưỡng ≥20 mua 7,7 MB bằng một cái giá không ai đo.** "Phủ 99,69% số lượt" đếm theo
**lượt xuất hiện**, mà lượt thì bị thống trị bởi vài trăm token phổ biến. Thứ người dùng
cảm nhận là **câu của họ có dính token bị cắt hay không**. Đếm trên tập train của v4
(11,9 triệu vị trí, 400.000 câu) và đo cái giá trên tập dev — văn bản model chưa hề train:

| ngưỡng | token giữ | phủ lượt | model ước tính | **câu dính `<unk>` (văn bản chưa thấy)** |
|---|---|---|---|---|
| **≥ 1** | **23.132** | 100% | **~44 MB** | **0,43%** |
| ≥ 2 | 21.992 | 99,990% | 43,4 MB | 0,83% |
| ≥ 5 | 19.053 | 99,919% | 41,3 MB | 2,95% |
| ≥ 10 | 16.087 | 99,749% | 39,1 MB | 6,22% |
| ≥ 20 | 12.532 | 99,334% | 36,5 MB | **12,78%** |
| ≥ 100 | 6.013 | 96,789% | 31,7 MB | 41,52% |

Từ ≥1 xuống ≥20 tiết kiệm thêm **7,7 MB** và đổi lấy **gấp 30 lần** số câu dính `<unk>`.
Chọn **≥ 1**: giữ mọi token từng xuất hiện trong tập train của v4, bỏ 40.869 token chưa bao
giờ xuất hiện.

**Rủi ro phải nói thẳng:** token không xuất hiện trong tập train **không** có nghĩa là vô
dụng lúc chạy — embedding của nó do PhoBERT huấn luyện trước, và encoder vẫn đọc được nó
trên văn bản mới. Thay nó bằng `<unk>` là mất phần đó. 0,43% số câu dev dính chuyện này;
điều kiện 1–3 dưới đây đo hậu quả thật.

Chọn ngưỡng bằng **tập train**, không bằng dev hay test — chọn theo tập đánh giá là rò rỉ.

#### Cách làm — đi qua đúng pipeline đang có

PhoBERT đánh số id = 4 + thứ tự dòng trong `vocab.txt` (fairseq dict), bốn token đặc biệt
giữ id 0–3, `<mask>` cuối cùng. Nên:

1. `ml/trim_vocab.py`: đếm token từ `data_ft_dgir/train.tok96.npz`, ghi `vocab.txt` mới (lọc
   dòng, giữ nguyên thứ tự) + `bpe.codes` nguyên vẹn → thư mục tokenizer mới; cắt đúng thứ
   tự ấy các dòng của `word_embeddings.weight` trong checkpoint, `config.vocab_size` mới.
2. `export_onnx.py` trên checkpoint mới → fp32 + int8 (vẫn `per_channel=True`).
3. `export_tokenizer.py --model <thư mục mới>` → `tokenizer.json` mới cho `bpe.js`; nó đọc
   thẳng `tok.get_vocab()` nên id không thể lệch giữa hai phía.

`bpe.js` không đổi một dòng: nó tra id từ `tokenizer.json`, và token nào không còn trong
vocab sẽ rơi về `<unk>` đúng như phía Python.

#### Điều kiện

Mốc so sánh là bản đang ship (`student768_v4` INT8, ngưỡng sản phẩm 0,95 / biên 0,25 / phụ
âm 0,90): P **0,9709** · R **0,7457**, báo oan **1,35% / 1,05%**, recall phụ âm **48,2%**,
riêng d/gi/r **33,9%**, model **78,5 MB**, gói nén **58,6 MB**, bộ nhớ một lần trong Chrome
**305,5 MB**.

| # | điều kiện | cần |
|---|---|---|
| 1 | **precision** VSEC giữ kín | ≥ **0,9679** (giảm ≤ 0,003) |
| 2 | **recall** VSEC giữ kín | ≥ **0,7407** (giảm ≤ 0,005) |
| 3 | **báo động giả** trên văn bản đúng | ≤ **1,45%** và ≤ **1,15%** |
| 4 | **recall phụ âm** / riêng **d/gi/r** | ≥ **47,2%** / ≥ **32,9%** |
| 5 | **kích thước**: model int8 · gói nén | ≤ **50 MB** · ≤ **45 MB** |
| 6 | **bộ nhớ một lần trong Chrome thật** (điều kiện 3 của quyết định 38, cùng công cụ) | ≤ **275 MB** |
| 7 | **parity và đường thật**: `npm run test:all` xanh với fixture sinh lại; `dev/lexical-check.mjs` gạch đúng `cứ` | tất cả |

#### Luật

* Trượt 1, 2, 3 hoặc 4 → **không ship**, giữ vocab đầy đủ. Đây là đánh đổi chất lượng lấy
  dung lượng, mà nguyên tắc của dự án là precision trước.
* Trượt 5 hoặc 6 → không ship: thay đổi này chỉ tồn tại để lấy lại bộ nhớ; không lấy được
  thì nó chỉ là rủi ro không công.
* Trượt 7 → **lỗi cài đặt** (gần như chắc là id lệch): sửa, đo lại toàn bộ.

#### Ghi trước để không tự lừa mình

* **Dự đoán:** model 78,5 → **~44 MB**, gói nén ~35 MB, bộ nhớ một lần 305 → **~265 MB**.
  Chất lượng gần như không đổi, nhưng **không phải không đổi hoàn toàn**: lượng tử hoá chạy
  lại trên ma trận nhỏ hơn nên hệ số tỷ lệ đổi, và 0,43% số câu mất một token. Nếu P hay R
  nhích lên thì đó là nhiễu lượng tử hoá, không phải "cắt vocab làm model tốt hơn".
* **Điều kiện 7 là điều kiện đáng lo nhất**, đúng như bàn giao cảnh báo: sai id thì model
  vẫn chạy, không lỗi nào bật ra, chỉ đọc nhầm embedding và cho kết quả vô nghĩa. Nó phải
  được bắt bởi parity fixture, không phải bởi cảm giác "kết quả trông vẫn ổn".
* Không đụng: ngưỡng, bộ nhãn, chấm theo câu, F2, trần cache, kiến trúc offscreen.

#### Kết quả — qua bảy / bảy, ship

Mốc và bản cắt đo **trong cùng phiên**, cùng script, cùng máy.

| # | điều kiện | cần | vocab đầy đủ | **đã cắt** | |
|---|---|---|---|---|---|
| 1 | precision VSEC giữ kín | ≥ 0,9679 | 0,9709 | **0,9709** | qua |
| 2 | recall | ≥ 0,7407 | 0,7457 | **0,7447** | qua |
| 3 | báo động giả | ≤ 1,45% / 1,15% | 1,35% / 1,05% | **1,35% / 1,10%** | qua |
| 4 | phụ âm · d/gi/r | ≥ 47,2% · ≥ 32,9% | 48,2% · 33,9% | **48,2% · 33,9%** | qua |
| 5 | model int8 · gói nén | ≤ 50 · ≤ 45 MB | 78,5 · 58,6 MB | **47,2 · 40,0 MB** | qua |
| 6 | bộ nhớ một lần, Chrome thật | ≤ 275 MB | 305,3 MB | **208,9 MB** | qua |
| 7 | parity + 15 lần dán trong Chrome | tất cả | mốc | **80/80 test · 15/15 dán** | qua |

Bảng phụ âm giống hệt **từng dòng, từng nhóm** (sửa đúng 865, sửa sai 59, báo oan 14). Cả
recall lẫn precision chỉ nhúc nhích ở một ca duy nhất trên 940 lỗi biểu diễn được — đúng
mức 0,43% số câu mất một token dự đoán từ trước.

Thêm hai con số không nằm trong luật:

* **nạp model 424–478 ms → 336–354 ms**, vì file nhỏ hơn 40%;
* bộ nhớ một lần của bản đầy đủ đo lại ra **305,3 MB**, trùng khít **305,5 MB** của quyết
  định 38 — mốc tự nó kiểm chứng rằng phép đo không trôi.

Dự đoán ghi trước: model ~44 MB (thật: 47,2), gói ~35 MB (thật: 40,0), bộ nhớ ~265 MB
(thật: **208,9** — tốt hơn dự đoán 56 MB). Phần đoán trượt nhiều nhất là bộ nhớ, và nó
trượt theo hướng có lợi: bộ nhớ wasm không chỉ giảm bằng đúng phần trọng số bỏ đi.

#### Cái giá thật của việc cắt vocab, nói thẳng

Trên VSEC giữ kín, **một** lỗi trước đây bắt được giờ bị bỏ sót (tp 701 → 700), và **một**
câu đúng bị gạch thêm (21 → 22 trên 2.000 câu). Đổi lại 31 MB gói cài và 96 MB bộ nhớ. Đây
là đánh đổi, không phải bữa trưa miễn phí — và nó chỉ chấp nhận được vì luật ghi trước nói
precision không được giảm, mà precision **không** giảm.

#### Công cụ của chính repo phá phép đo, và cái sai trông y như thật

Giữa lúc đo, bản CŨ tụt recall phụ âm từ **48,2% xuống 0,1%**. Nếu đọc vội thì kết luận có
sẵn: "cắt vocab phá nát model". Nó sai hoàn toàn, và cái sai đó đứng vững được vì hai lý do
— model cũ bị đo, và con số đủ thảm để không ai nghi phép đo.

Nguyên nhân: `export_tokenizer.py` có dòng `tmp = Path("out/_tok"); tok.save_pretrained(tmp)`
— **đường dẫn cố định**, không đi theo `--out`. Nên lệnh sinh tokenizer cho bản cắt đã **đè
lên `out/_tok`**, đúng thư mục tokenizer mà phép đo mốc đang dùng, **giữa lúc phép đo chạy**.
Từ đó model cũ (64.001 hàng embedding) bị nạp id của vocab mới (23.134) — nó không lỗi, chỉ
đọc nhầm hàng.

Ba dấu vết cho thấy lỗi nằm ở phép đo chứ không ở model, và thứ tự tìm ra chúng là bài học:

1. `evaluate.py` của cùng bản cũ, chạy **trước** lúc bị đè, ra **đúng** số cũ tới từng chữ
   số (P 0,9709 · R 0,7457). Một model không thể vừa nguyên vẹn vừa hỏng.
2. Đổi **thư mục tokenizer** (`out/_tok` -> `out/student768_v4/best`) trên **cùng một file
   model** cho ra 0,0% so với 46,5%. Biến đổi được là biến tokenizer.
3. `out/_tok` in ra `vocab=23.134` — con số của bản cắt, nằm trong thư mục của bản đầy đủ.

Sửa: thư mục tạm đi theo `--out` (`<out>/_tok_src`). Và dựng lại `out/_tok` đầy đủ trước khi
đo lại mốc.

**Bài học, khác với bài học "đo nhầm đường dẫn" đã có ở quyết định 24:** ở đây phép đo đúng
đường, đúng model, đúng script — chỉ có **một artifact dùng chung bị một lệnh khác ghi đè
giữa chừng**. Thứ bảo vệ tôi không phải là cẩn thận, mà là **luôn đo lại mốc trong cùng
phiên**: nếu chỉ so với con số chép trong tài liệu, tôi đã tin bản cắt làm sập recall phụ âm.

#### Và một lỗi im lặng nữa, do MỘT GIÁ TRỊ MẶC ĐỊNH

Lượt đo đầu trong Chrome thật: bản cắt chỉ gạch đúng **9/15** lần dán. Kết luận có sẵn lần
thứ hai trong cùng một quyết định: "cắt vocab làm hỏng đường lui F2". Lại sai.

Chạy A/B — **bản vocab đầy đủ trên cùng code trượt đúng 6 ca ấy**. Nên thủ phạm không nằm
ở vocab. Dấu vết: đoạn không dấu câu 486 ký tự chỉ chạy **1 lượt model** thay vì 3.

`export_onnx.py` đọc `max_len` từ `train_meta.json` trong thư mục model. `trim_vocab.py`
chép `tags.json` mà quên `train_meta.json`, nên export rơi về **mặc định 128** thay vì
**96** của bản train, kèm đúng một dòng in ra: *"mặc định — không thấy train_meta.json,
kiểm tra lại xem có khớp lúc train không"*. Không ai kiểm.

Con số đó đi thẳng vào `soat.meta.json`, và `onnxEngine` đọc nó làm `maxLen`:

```
maxLen 96  -> ngân sách 94 subword -> đoạn 486 ký tự chia 3 cửa sổ F2 -> "cứ" nằm nông -> gạch
maxLen 128 -> ngân sách 126        -> cả đoạn vào MỘT cửa sổ          -> "cứ" nằm cuối  -> im lặng
```

Đúng hiện tượng quyết định 32 đã đo: cùng một từ, nằm sâu trong cửa sổ thì recall tụt từ
0,7426 xuống 0,6202. Ở đây nó không tụt, nó **im hẳn**.

Sửa hai đầu, vì một đầu là chưa đủ:

* `trim_vocab.py` **bắt buộc** chép `train_meta.json`, thiếu thì dừng;
* `export_onnx.py` **không đoán nữa**: thiếu `train_meta.json` mà cũng không có `--max-len`
  thì thoát với lời nhắc, thay vì in một dòng cảnh báo rồi vẫn xuất ra model sai.

**Bài học:** một giá trị mặc định "hợp lý" ở tầng build là một lỗi im lặng chờ sẵn. Nó không
làm gì đổ, không có test nào đỏ — `npm run test:all` xanh 80/80 suốt thời gian sản phẩm mất
gạch — và chỉ lộ ra khi đo **đường thật trong trình duyệt thật**, đúng thứ quyết định 24 đã
nói và quyết định 37–38 đã dựng công cụ để làm.
