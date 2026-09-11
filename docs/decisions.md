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
