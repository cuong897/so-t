# Đọc tay 54 lần gạch chân oan

Số máy đo được là **chặn trên**, không phải tỷ lệ báo động giả thật. Lý do:
văn bản "sạch" không sạch. Wikipedia có lỗi chính tả thật, và câu đã-sửa-đúng
của VSEC vẫn còn lỗi người gán nhãn bỏ qua. Model bắt đúng những chỗ đó thì
máy đếm là "báo oan", còn thực tế nó làm đúng việc của nó.

Nên phải đọc tay từng lần. Bảng dưới là **phán đoán của tôi**, không phải chân
lý — để nguyên ngữ cảnh ở đây chính là để ai đọc lại cũng phán được lần nữa.

| nhãn | nghĩa |
|---|---|
| `ĐÚNG` | văn bản sai thật, model bắt đúng — **không phải** báo động giả |
| `NỬA` | chỗ đó có sai thật, nhưng đề xuất của model sai — gạch chân có cớ, sửa thì vô dụng |
| `OAN` | văn bản đúng, model báo bậy — **báo động giả thật** |
| `?` | ngữ cảnh cắt cụt, không phán được |


## A. Wikipedia sạch (test, model chưa từng thấy)

29 lần gạch chân — **OAN 17**, ĐÚNG 8, NỬA 3, ? 1

| # | từ → đề xuất | p | phán | vì sao | ngữ cảnh |
|---|---|---|---|---|---|
| 1 | âm → ẩm | 0.99 | **OAN** | “độ âm” = nhiệt độ dưới 0, đúng trong ngữ cảnh chịu rét | …ó đặc điểm to hơn và chịu được rét đến cả độ âm |
| 2 | trỗ → chỗ | 0.99 | **OAN** | “trỗ bông” là biến thể của “trổ bông”; “chỗ” càng sai | Bên cạnh đó thời tiết giai đoạn lúa trỗ bông khá thuận lợi cùng với công tác bảo vệ … |
| 3 | phong → phòng | 0.93 | **OAN** | “công ty bình phong” là cụm đúng | …khoảng triệu đôla thông qua một công ty bình phong là Alia để có được những hợp đồng cung cấp b… |
| 4 | up → úp | 0.91 | NỬA | gốc là “uy hiếp” bị hỏng thành “up hiếp”; “úp” không sửa được | …ắc của Đại Việt còn Toa Đô đánh lên phía bắc up hiếp vùng Thanh Hóa Nghệ An |
| 5 | hiếp → hiệp | 0.97 | **OAN** | “hiếp” trong “uy hiếp” vốn đúng | …của Đại Việt còn Toa Đô đánh lên phía bắc up hiếp vùng Thanh Hóa Nghệ An |
| 6 | cứ → cư | 0.99 | ĐÚNG | “cứ trú” -> “cư trú”, văn bản sai thật | …à Labrador có dân số hơn một nửa trong số đó cứ trú tại bán đảo Avalon của đảo Newfoundland … |
| 7 | nỗi → nổi | 0.99 | ĐÚNG | “nỗi danh” -> “nổi danh”, văn bản sai thật | …iện có rất nhiều hệ phái võ có những phái võ nỗi danh truyền tụng cũng có những phái âm thầm … |
| 8 | đinh → định | 0.91 | NỬA | phải là “đỉnh tam giác”; model đoán “định” | Đường phân giác đi qua một góc của một đinh tam giác thì chia cạnh đối diện của góc đó n… |
| 9 | thanh → thành | 0.93 | **OAN** | “thanh cái” là thuật ngữ điện lực, đúng | ắc quy được đấu vào thanh cái một chiều song song với thiết bị nạp |
| 10 | Nhủng → Nhũng | 0.94 | **OAN** | “Hoàng Văn Nhủng” là tên riêng | Hoàng Văn Nhủng là liệt sỹ đầu tiên hy sinh ngày tháng năm k… |
| 11 | qua → quá | 1.00 | ĐÚNG | “qua trình” -> “quá trình”, văn bản sai thật | …ia để tái sử dụng vì việc nhân bản trực tiếp qua trình thu thập thông tin web là không được k… |
| 12 | đong → đóng | 0.99 | **OAN** | “đong thóc gạo” đúng — đong là đo thể tích | …uyên con người đã phải đo đạc các thửa ruộng đong thóc gạo khi thu hoạch xây dựng những kim tự… |
| 13 | triền → triển | 1.00 | ĐÚNG | “phát triền” -> “phát triển”, văn bản sai thật | Pearson phát triền các hệ số tương quan được định nghĩa như là … |
| 14 | cỏ → có | 0.98 | **OAN** | “cỏ phát triển quang hợp C4” — đang nói về cây cỏ, đúng | …ng kể khác của chu trình carbon toàn cầu khi cỏ phát triển một cơ chế quang hợp mới là quang… |
| 15 | năm → nằm | 0.97 | **OAN** | “đắm năm …” đúng, năm ở đây là năm tháng | … bị đắm ở quần đảo Hoàng Sa một chiếc bị đắm năm và chiếc kia chìm năm ở nhóm đảo An Vĩnh |
| 16 | tràng → trang | 0.99 | **OAN** | “môn đệ trưởng tràng” là cụm đúng trong võ thuật | …yền lãnh đạo Vovinam cho người môn đệ trưởng tràng của mình là võ sư Lê Sáng |
| 17 | nhưng → những | 0.99 | **OAN** | “nhưng” đúng, là liên từ | Tai của chúng lớn ở bên trong nhưng lỗ ngoài nhỏ và nằm cách sau mỗi mắt khoảng … |
| 18 | nắm → nằm | 0.94 | **OAN** | “nắm … tổng số tài sản” đúng | …ia ở Philippines tại Indonesia thì người Hoa nắm trên tổng số tài sản công ty |
| 19 | vât → vật | 1.00 | ĐÚNG | “thực vât” -> “thực vật”, văn bản sai thật | …o rằng sự phát triển và sinh trưởng của thực vât được điều phối bởi hormone thực vật hoặc các… |
| 20 | Đương → Đường | 0.93 | **OAN** | “Tiểu Đương Giang” là tên riêng | Còn em là Tiểu Đương Giang Đô Hộ Quốc Thần Vương lập đền ở cửa sô… |
| 21 | nhân → nhận | 0.98 | ĐÚNG | “công nhân là” -> “công nhận là”, văn bản sai thật | …máy bia được Hiệp hội Luyện tâm Quốc tế công nhân là nằm tại khu vực văn hoá miền nam Hà Lan |
| 22 | dộng → rộng | 0.99 | NỬA | gốc là “vận động”; model đoán “rộng” | …của Đại học Liên hiệp phụ nữ Mỹ và người vận dộng bình đẳng giới toàn cầu trong giáo dục đã nỗ… |
| 23 | rông → rộng | 0.98 | **OAN** | “bị rông” là cách nói dân gian, đúng | …đốt trong đêm giao thừa người quét nhà sẽ bị rông cả năm rông được hiểu như sự xui xẻo |
| 24 | ờ → ở | 0.98 | ? | ngữ cảnh cắt cụt, không phán được | Cờ tiểu bang Berlin có hình con gấu trên nền tr… |
| 25 | Đảo → Đạo | 0.99 | **OAN** | “Đảo bảo tàng” (Museum Island) là tên riêng | Đảo viện bảo tàng đã được đưa vào danh sách di s… |
| 26 | thị → thì | 0.99 | ĐÚNG | “thị bị chặn” -> “thì bị chặn”, văn bản sai thật | …iến sát tới biên giới tiền chiến của Estonia thị bị Cụm tập đoàn quân Bắc chặn lại |
| 27 | nhẫn → nhận | 1.00 | **OAN** | “Chúa Nhẫn” là tên phim | Chúa nhẫn tên một bộ phim |
| 28 | trang → trạng | 1.00 | ĐÚNG | “trang thái” -> “trạng thái”, văn bản sai thật | …ên tử ngoài cùng hơn là kiếm thêm nữa để đạt trang thái bền tuy nhiên các ion K cũng được biết … |
| 29 | điêu → điều | 1.00 | **OAN** | “điêu bảo” (碉堡) là thuật ngữ công sự, đúng | Năm sau quân Tống sử dụng chiến thuật điêu bảo xây công sự kiên cố phái Từ Hi xây dựng … |

## B. VSEC nửa giữ kín, câu đã sửa đúng

25 lần gạch chân — **OAN 14**, ĐÚNG 6, NỬA 4, ? 1

| # | từ → đề xuất | p | phán | vì sao | ngữ cảnh |
|---|---|---|---|---|---|
| 30 | phụ → phủ | 0.99 | **OAN** | “sản phẩm chính phụ” đúng — chính và phụ | Từ sơ đồ phản ứng sản phẩm chính phụ tổ chức cho HS nhận xét rút ra hướng phản ứn… |
| 31 | băng → bằng | 0.96 | **OAN** | “băng hình” là cụm đúng | Cung cấp băng hình một số thí nghiệm khó thời gian làm thí… |
| 32 | sổ → số | 0.99 | **OAN** | “sổ chi tiết” là thuật ngữ kế toán, đúng | … báo cáo tài chính riêng của các công ty con sổ chi tiết theo dõi tài khoản đầu tư vào công … |
| 33 | Đề → Để | 0.91 | **OAN** | “Đề kiểm tra” đúng | PHỤ LỤC 4.1 Đề kiểm tra 45 phút |
| 34 | ich → ích | 0.99 | ĐÚNG | bản gốc VSEC lặp “lợi ich ích”; “ich” sai thật | Cần phải đánh giá các lợi ich ích và chi phí của các biện pháp giảm thiểu … |
| 35 | cấn → cần | 1.00 | ĐÚNG | “tiến hành cấn” -> “cần”, văn bản sai thật | Để tiến hành cấn lựa chọn các chỉ tiêu so sánh điều kiện và m… |
| 36 | ỷ → ý | 0.91 | **OAN** | “ỷ” trong “ỷ lại” vốn đúng — chỗ sai là “nại” | …nhưng bên cạnh đó NSĐP cũng sẽ mang tư tưởng ỷ nại vào NSTƯ điều này sẽ ảnh hưởng lớn đến q… |
| 37 | nại → lại | 1.00 | ĐÚNG | “ỷ nại” -> “ỷ lại”, model bắt đúng chữ sai | …ưng bên cạnh đó NSĐP cũng sẽ mang tư tưởng ỷ nại vào NSTƯ điều này sẽ ảnh hưởng lớn đến quá t… |
| 38 | củ → cũ | 0.94 | NỬA | “chi tiêu củ của” lặp chữ; “cũ” không sửa được | … bảo nguồn thu NSNN đáp ứng nhu cầu chi tiêu củ của Nhà nước |
| 39 | biệt → biết | 1.00 | NỬA | gốc là “đặc biệt”; model đoán “biết” | … nhiều lĩnh vực văn hóa kinh tế xã hội và đã biệt là chính trị của mỗi quốc gia |
| 40 | Dư → Dự | 0.92 | **OAN** | “dư lượng kháng sinh” là thuật ngữ đúng | Dư lượng kháng sinh trong sản phẩm thủy sản xuấ… |
| 41 | dư → dự | 0.94 | **OAN** | chỗ sai là “giả” trong “dư dả”, không phải “dư” | Các chế độ đãi ngộ này tạo cho họ sự dư giả về mặt kinh tế nên đại đa số đưa cả gia … |
| 42 | dám → giám | 0.99 | ĐÚNG | “dám sát” -> “giám sát”, văn bản sai thật | Về Ban kiểm soát mục đích dám sát các vấn đề tài chính kinh doanh trong cô… |
| 43 | no → nó | 0.99 | **OAN** | “no” là từ tiếng Anh trong câu song ngữ | … báo trên thì output là yes có khả năng hoặc no không có khả năng |
| 44 | gi → gì | 1.00 | NỬA | “tích hợp gi giáo dục” hỏng; “gì” không khớp | Phương pháp dạy học tích hợp gi giáo dục bảo vệ môi trường cho học sinh Trun… |
| 45 | Nêu → Nếu | 1.00 | **OAN** | “Nêu được đặc điểm…” đúng, là động từ | Nêu được đặc điểm chung của các quá trình tổng h… |
| 46 | Biều → Biểu | 0.90 | **OAN** | “Thủy Biều” là địa danh ở Huế | Có thể kể ngay đến thanh trà Thủy Biều nếu như những năm trước đây thanh trà mang l… |
| 47 | san → sản | 0.94 | **OAN** | “san sẻ rủi ro” là cụm đúng | Về mặt xã hội do có sự san sẻ rủi ro của BHXH người lao động chỉ phải đ… |
| 48 | vãnh → vành | 1.00 | **OAN** | “vặt vãnh” là từ đúng | …ng cái nhỏ nhặt tầm thường những lo toan vặt vãnh mà chỉ nghĩ đến những gì lớn lao cao cả |
| 49 | động → đồng | 0.98 | NỬA | gốc là “huy động”; “đồng” không sửa được | Khuyến khích thu hút động mọi nguồn lực mọi thành phần kinh tế cùng th… |
| 50 | dòn → dòng | 0.99 | ĐÚNG | “dòn dòng điện” lặp lỗi; “dòn” sai thật | Điện năng là năng lượng của dòn dòng điện |
| 51 | Ôn → Ông | 1.00 | **OAN** | “Ôn các từ…” đúng, là ôn tập | Ôn các từ về các đồ dùng học tập Unit 8 |
| 52 | vơi → với | 0.92 | **OAN** | “vơi đi” là cụm đúng | …g nỗi lo lắng của người lao động chỉ thực sự vơi đi khi tự tin rằng sức lao động của con ngườ… |
| 53 | tính → tỉnh | 0.93 | ? | ngữ cảnh cắt cụt, không phán được | …dẫn thực hiện để được quyết định bởi Nội các tính các quỹ ngân sách quốc gia lợi nhuận cấp vốn… |
| 54 | cua → của | 1.00 | ĐÚNG | “gia vị cua” -> “của”, văn bản sai thật | … toàn như bột mì bột bắp tinh bột sắn gia vị cua đảm bảo về chất lượng |
