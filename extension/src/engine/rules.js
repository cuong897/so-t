/**
 * Cơ sở tri thức lỗi chính tả tiếng Việt — tầng 1 và tầng 2.
 *
 * Hai loại luật, cố tình tách rời vì độ tin cậy khác nhau:
 *
 *   PHRASE_RULES  — dạng sai KHÔNG BAO GIỜ đúng trong tiếng Việt.
 *                   Khớp là báo, không cần ngữ cảnh. Độ tin cậy ~1.0.
 *
 *   CONTEXT_RULES — cặp đồng âm mà CẢ HAI dạng đều là từ đúng.
 *                   Chỉ báo khi có bằng chứng dương cho dạng còn lại.
 *                   Đây chính là lớp lỗi mà từ điển và Hunspell bó tay.
 *
 * Nguyên tắc xuyên suốt: THÀ BỎ SÓT CÒN HƠN BÁO SAI. Gạch chân nhầm một lần
 * là người dùng gỡ cài; bỏ sót một lỗi thì họ không biết. Vì vậy mọi luật ở
 * đây đều được viết chặt, và phần recall để dành cho model ở tầng 3.
 */

// ---------------------------------------------------------------------------
// TẦNG 1 — dạng sai tuyệt đối
// [ sai, đúng, nhóm, giải thích ]
// ---------------------------------------------------------------------------

export const PHRASE_RULES = [
  // --- hỏi/ngã: dạng sai không phải là từ ---
  ['trãi', 'trải', 'hoi-nga', '"trãi" không phải từ tiếng Việt'],
  ['xãy', 'xảy', 'hoi-nga', '"xãy" không phải từ tiếng Việt'],
  ['sẳn', 'sẵn', 'hoi-nga', '"sẳn" không phải từ tiếng Việt'],
  ['hảy', 'hãy', 'hoi-nga', '"hảy" không phải từ tiếng Việt'],
  ['dỉ nhiên', 'dĩ nhiên', 'hoi-nga', 'từ Hán–Việt "dĩ" viết dấu ngã'],
  ['mổi', 'mỗi', 'hoi-nga', '"mỗi" viết dấu ngã'],
  ['chuẫn', 'chuẩn', 'hoi-nga', '"chuẩn" viết dấu hỏi'],
  ['cẫn thận', 'cẩn thận', 'hoi-nga', '"cẩn" viết dấu hỏi'],
  ['hiễu', 'hiểu', 'hoi-nga', '"hiểu" viết dấu hỏi'],
  ['dể', 'dễ', 'hoi-nga', '"dễ" viết dấu ngã'],
  ['nghỉa', 'nghĩa', 'hoi-nga', '"nghĩa" viết dấu ngã'],
  ['kỹ niệm', 'kỷ niệm', 'hoi-nga', '"kỷ" (ghi nhớ) viết dấu hỏi'],
  ['kỹ luật', 'kỷ luật', 'hoi-nga', '"kỷ" (phép tắc) viết dấu hỏi'],
  ['thế kỹ', 'thế kỷ', 'hoi-nga', '"kỷ" (đơn vị thời gian) viết dấu hỏi'],
  ['kỷ thuật', 'kỹ thuật', 'hoi-nga', '"kỹ" (khéo, tinh) viết dấu ngã'],
  ['kỷ năng', 'kỹ năng', 'hoi-nga', '"kỹ" (khéo, tinh) viết dấu ngã'],
  ['kỷ lưỡng', 'kỹ lưỡng', 'hoi-nga', '"kỹ" (khéo, tinh) viết dấu ngã'],
  ['kỷ sư', 'kỹ sư', 'hoi-nga', '"kỹ" (khéo, tinh) viết dấu ngã'],

  // --- hỏi/ngã: dạng sai là từ có thật, nhưng sai trong kết hợp này ---
  ['nổ lực', 'nỗ lực', 'hoi-nga', '"nỗ" là gắng sức; "nổ" là phát nổ'],
  ['chia sẽ', 'chia sẻ', 'hoi-nga', '"sẻ" là san bớt; "sẽ" chỉ thì tương lai'],
  ['san sẽ', 'san sẻ', 'hoi-nga', '"sẻ" là san bớt cho người khác'],
  ['suy nghỉ', 'suy nghĩ', 'hoi-nga', '"nghĩ" là tư duy; "nghỉ" là ngừng làm việc'],
  ['sữa chữa', 'sửa chữa', 'hoi-nga', '"sửa" là làm lại cho đúng; "sữa" là đồ uống'],
  ['sữa chửa', 'sửa chữa', 'hoi-nga', 'cả hai âm tiết đều sai dấu'],
  ['sửa chửa', 'sửa chữa', 'hoi-nga', '"chữa" viết dấu ngã'],
  ['bỗ sung', 'bổ sung', 'hoi-nga', '"bổ" viết dấu hỏi'],
  ['đãm bảo', 'đảm bảo', 'hoi-nga', '"đảm" viết dấu hỏi'],
  ['đảm bão', 'đảm bảo', 'hoi-nga', '"bảo" viết dấu hỏi'],
  ['vẽ vang', 'vẻ vang', 'hoi-nga', '"vẻ" (dáng vẻ) viết dấu hỏi'],
  ['giã sử', 'giả sử', 'hoi-nga', '"giả" (giả định) viết dấu hỏi'],
  ['lảng phí', 'lãng phí', 'hoi-nga', '"lãng" viết dấu ngã'],
  ['rỏ ràng', 'rõ ràng', 'hoi-nga', '"rõ" viết dấu ngã'],
  ['vội vả', 'vội vã', 'hoi-nga', '"vã" viết dấu ngã'],
  ['dử dội', 'dữ dội', 'hoi-nga', '"dữ" viết dấu ngã'],
  ['giử gìn', 'giữ gìn', 'hoi-nga', '"giữ" viết dấu ngã'],
  ['bải bỏ', 'bãi bỏ', 'hoi-nga', '"bãi" viết dấu ngã'],
  ['cãi thiện', 'cải thiện', 'hoi-nga', '"cải" (thay đổi) viết dấu hỏi'],
  ['cải nhau', 'cãi nhau', 'hoi-nga', '"cãi" (tranh luận) viết dấu ngã'],
  ['tranh cải', 'tranh cãi', 'hoi-nga', '"cãi" (tranh luận) viết dấu ngã'],
  ['cải vã', 'cãi vã', 'hoi-nga', '"cãi" (tranh luận) viết dấu ngã'],
  ['hổ trợ', 'hỗ trợ', 'hoi-nga', '"hỗ" (giúp nhau) viết dấu ngã'],
  ['hổn loạn', 'hỗn loạn', 'hoi-nga', '"hỗn" viết dấu ngã'],
  ['hỗ thẹn', 'hổ thẹn', 'hoi-nga', '"hổ" (xấu hổ) viết dấu hỏi'],
  ['quãng cáo', 'quảng cáo', 'hoi-nga', '"quảng" (rộng) viết dấu hỏi'],
  ['quảng đường', 'quãng đường', 'hoi-nga', '"quãng" (đoạn) viết dấu ngã'],
  ['khoãng', 'khoảng', 'hoi-nga', '"khoảng" viết dấu hỏi'],
  ['mảnh liệt', 'mãnh liệt', 'hoi-nga', '"mãnh" (mạnh) viết dấu ngã'],
  ['mãnh vỡ', 'mảnh vỡ', 'hoi-nga', '"mảnh" (miếng) viết dấu hỏi'],
  ['mạnh mẻ', 'mạnh mẽ', 'hoi-nga', '"mẽ" viết dấu ngã'],
  ['dủng cảm', 'dũng cảm', 'hoi-nga', '"dũng" viết dấu ngã'],
  ['ũng hộ', 'ủng hộ', 'hoi-nga', '"ủng" viết dấu hỏi'],
  ['hưỡng', 'hưởng', 'hoi-nga', '"hưởng" viết dấu hỏi'],
  ['ảnh hưỡng', 'ảnh hưởng', 'hoi-nga', '"hưởng" viết dấu hỏi'],
  ['nổi buồn', 'nỗi buồn', 'hoi-nga', '"nỗi" (cảm xúc) viết dấu ngã'],
  ['nổi đau', 'nỗi đau', 'hoi-nga', '"nỗi" (cảm xúc) viết dấu ngã'],
  ['nổi nhớ', 'nỗi nhớ', 'hoi-nga', '"nỗi" (cảm xúc) viết dấu ngã'],
  ['nổi lo', 'nỗi lo', 'hoi-nga', '"nỗi" (cảm xúc) viết dấu ngã'],
  ['nổi sợ', 'nỗi sợ', 'hoi-nga', '"nỗi" (cảm xúc) viết dấu ngã'],
  ['nổi niềm', 'nỗi niềm', 'hoi-nga', '"nỗi" (cảm xúc) viết dấu ngã'],
  ['nỗi tiếng', 'nổi tiếng', 'hoi-nga', '"nổi" (trội lên) viết dấu hỏi'],
  ['nỗi bật', 'nổi bật', 'hoi-nga', '"nổi" (trội lên) viết dấu hỏi'],
  ['nỗi dậy', 'nổi dậy', 'hoi-nga', '"nổi" (trội lên) viết dấu hỏi'],
  ['nỗi loạn', 'nổi loạn', 'hoi-nga', '"nổi" (trội lên) viết dấu hỏi'],
  ['nỗi giận', 'nổi giận', 'hoi-nga', '"nổi" (trội lên) viết dấu hỏi'],
  ['cỗ vũ', 'cổ vũ', 'hoi-nga', '"cổ" viết dấu hỏi'],
  ['cổ máy', 'cỗ máy', 'hoi-nga', '"cỗ" (bộ, chiếc) viết dấu ngã'],
  ['cơn bảo', 'cơn bão', 'hoi-nga', '"bão" (thời tiết) viết dấu ngã'],
  ['bảo táp', 'bão táp', 'hoi-nga', '"bão" (thời tiết) viết dấu ngã'],
  ['bão vệ', 'bảo vệ', 'hoi-nga', '"bảo" (giữ gìn) viết dấu hỏi'],
  ['bão đảm', 'bảo đảm', 'hoi-nga', '"bảo" (giữ gìn) viết dấu hỏi'],
  ['bão hiểm', 'bảo hiểm', 'hoi-nga', '"bảo" (giữ gìn) viết dấu hỏi'],
  ['bão dưỡng', 'bảo dưỡng', 'hoi-nga', '"bảo" (giữ gìn) viết dấu hỏi'],
  ['chán nãn', 'chán nản', 'hoi-nga', '"nản" viết dấu hỏi'],
  ['nãn lòng', 'nản lòng', 'hoi-nga', '"nản" viết dấu hỏi'],
  ['buồn bả', 'buồn bã', 'hoi-nga', '"bã" viết dấu ngã'],
  ['vất vã', 'vất vả', 'hoi-nga', '"vả" viết dấu hỏi'],
  ['mệt mõi', 'mệt mỏi', 'hoi-nga', '"mỏi" viết dấu hỏi'],
  ['thoãi mái', 'thoải mái', 'hoi-nga', '"thoải" viết dấu hỏi'],
  ['kiên nhẩn', 'kiên nhẫn', 'hoi-nga', '"nhẫn" viết dấu ngã'],
  ['nhẩn nại', 'nhẫn nại', 'hoi-nga', '"nhẫn" viết dấu ngã'],
  ['có lẻ', 'có lẽ', 'hoi-nga', '"lẽ" (lí lẽ) viết dấu ngã'],
  ['lẻ ra', 'lẽ ra', 'hoi-nga', '"lẽ" (lí lẽ) viết dấu ngã'],
  ['điều chĩnh', 'điều chỉnh', 'hoi-nga', '"chỉnh" viết dấu hỏi'],

  // --- ch / tr ---
  ['chân trọng', 'trân trọng', 'ch-tr', '"trân" (quý) viết tr'],
  ['trân thành', 'chân thành', 'ch-tr', '"chân" (thật) viết ch'],
  ['chân quý', 'trân quý', 'ch-tr', '"trân" (quý) viết tr'],
  ['bắt trước', 'bắt chước', 'ch-tr', '"chước" viết ch, không liên quan "trước/sau"'],
  ['chăn trở', 'trăn trở', 'ch-tr', '"trăn trở" viết tr'],
  ['chăn chở', 'trăn trở', 'ch-tr', '"trăn trở" viết tr'],
  ['che trở', 'che chở', 'ch-tr', '"chở" ở đây là che chắn, viết ch'],
  ['chót lọt', 'trót lọt', 'ch-tr', '"trót lọt" viết tr'],
  ['chuyên trở', 'chuyên chở', 'ch-tr', '"chở" (vận chuyển) viết ch'],
  ['trau truốt', 'trau chuốt', 'ch-tr', '"chuốt" viết ch'],
  ['chở thành', 'trở thành', 'ch-tr', '"trở" (biến thành) viết tr'],
  ['chung thành', 'trung thành', 'ch-tr', '"trung" (giữa, thẳng) viết tr'],
  ['tre chở', 'che chở', 'ch-tr', '"che chở" viết ch cả hai âm tiết'],

  // --- s / x ---
  ['suất sắc', 'xuất sắc', 's-x', '"xuất" (ra, vượt) viết x'],
  ['sơ xuất', 'sơ suất', 's-x', '"suất" ở đây viết s'],
  ['xử dụng', 'sử dụng', 's-x', '"sử" (dùng) viết s'],
  ['sử lý', 'xử lý', 's-x', '"xử" (giải quyết) viết x'],
  ['sử lí', 'xử lí', 's-x', '"xử" (giải quyết) viết x'],
  ['suất hiện', 'xuất hiện', 's-x', '"xuất" (ra) viết x'],
  ['suất phát', 'xuất phát', 's-x', '"xuất" (ra) viết x'],
  ['suất khẩu', 'xuất khẩu', 's-x', '"xuất" (ra) viết x'],
  ['sản suất', 'sản xuất', 's-x', '"xuất" (ra) viết x'],
  ['xúc tích', 'súc tích', 's-x', '"súc" (chứa đựng) viết s'],
  ['cọ sát', 'cọ xát', 's-x', '"xát" (chà) viết x'],
  ['sắc xảo', 'sắc sảo', 's-x', '"sảo" ở đây viết s'],
  ['xoi mói', 'soi mói', 's-x', '"soi" viết s'],
  ['sáng lạn', 'xán lạn', 's-x', 'từ đúng là "xán lạn" (rực rỡ)'],
  ['sáng lạng', 'xán lạn', 's-x', 'từ đúng là "xán lạn" (rực rỡ)'],

  // --- d / gi / r ---
  ['che dấu', 'che giấu', 'd-gi-r', '"giấu" (giữ kín) viết gi; "dấu" là vết tích'],
  ['dấu diếm', 'giấu giếm', 'd-gi-r', '"giấu giếm" viết gi cả hai âm tiết'],
  ['giấu diếm', 'giấu giếm', 'd-gi-r', '"giếm" viết gi'],
  ['giấu vết', 'dấu vết', 'd-gi-r', '"dấu" (vết tích) viết d'],
  ['dành giật', 'giành giật', 'd-gi-r', '"giành" (tranh lấy) viết gi'],
  ['tranh dành', 'tranh giành', 'd-gi-r', '"giành" (tranh lấy) viết gi'],
  ['để giành', 'để dành', 'd-gi-r', '"dành" (cất giữ) viết d'],
  ['giành dụm', 'dành dụm', 'd-gi-r', '"dành" (cất giữ) viết d'],
  ['dục giã', 'giục giã', 'd-gi-r', '"giục" (thúc) viết gi'],

  // --- âm cuối n / ng, c / t ---
  ['hoàng toàng', 'hoàn toàn', 'n-ng', 'cả hai âm tiết kết thúc bằng n'],
  ['lãng mạng', 'lãng mạn', 'n-ng', '"mạn" kết thúc bằng n'],
  ['nhất quáng', 'nhất quán', 'n-ng', '"quán" kết thúc bằng n'],
  ['chính chắn', 'chín chắn', 'n-ng', '"chín" (đủ độ) kết thúc bằng n'],

  // --- dùng sai từ Hán–Việt ---
  ['thăm quan', 'tham quan', 'tu-vung', '"tham quan" nghĩa là xem tận nơi'],
  ['chuẩn đoán', 'chẩn đoán', 'tu-vung', '"chẩn" (xem bệnh), không phải "chuẩn"'],
  ['vô hình chung', 'vô hình trung', 'tu-vung', 'thành ngữ đúng là "vô hình trung"'],
  ['tựu chung', 'tựu trung', 'tu-vung', 'thành ngữ đúng là "tựu trung"'],
  ['nhận chức', 'nhậm chức', 'tu-vung', '"nhậm chức" là nhận nhiệm vụ chức quan'],
  ['sát nhập', 'sáp nhập', 'tu-vung', '"sáp" (cắm vào) mới đúng'],
  ['chín mùi', 'chín muồi', 'tu-vung', 'từ đúng là "chín muồi"'],
  ['bạc mạng', 'bạt mạng', 'tu-vung', 'từ đúng là "bạt mạng"'],
  ['đường xá', 'đường sá', 'tu-vung', '"sá" trong "đường sá" viết s'],
  ['bàng quang', 'bàng quan', 'tu-vung', '"bàng quan" là thờ ơ; "bàng quang" là bọng đái'],
  ['yếu điểm', 'điểm yếu', 'tu-vung', '"yếu điểm" nghĩa là điểm quan trọng, không phải nhược điểm'],

  // --- chính tả chung ---
  ['nghành', 'ngành', 'chinh-ta', '"ngh" chỉ đứng trước e, ê, i'],
  ['í kiến', 'ý kiến', 'chinh-ta', '"ý" viết bằng y'],
];

// ---------------------------------------------------------------------------
// TẦNG 2 — cặp đồng âm, quyết định bằng ngữ cảnh
//
// Cue CÓ HƯỚNG, vì vị trí mới là tín hiệu thật:
//   `before` — từ đứng TRƯỚC dạng này  ("một" trong "một nửa")
//   `after`  — từ đứng SAU  dạng này   ("tiếng" trong "nửa tiếng")
//
// Không dùng cue vô hướng: trong câu "một nửa tiếng nữa", các từ "một" và
// "tiếng" nằm gần CẢ HAI dạng, nên cue vô hướng sẽ báo sai ở "nữa".
//
// `strict` — dạng chỉ sống trong vài kết hợp rất hẹp. Không có cue nào ở
//            cạnh thì gần như chắc chắn người viết muốn dạng kia.
// ---------------------------------------------------------------------------

export const CONTEXT_RULES = [
  {
    tag: 'hoi-nga',
    forms: {
      'nửa': {
        gloss: 'một phần hai',
        before: ['một', 'quá', 'gần', 'đúng', 'chia', 'mất'],
        after: ['tiếng', 'giờ', 'ngày', 'đêm', 'đường', 'chừng', 'vời', 'năm', 'kia', 'phần', 'buổi', 'đời', 'chặng'],
      },
      'nữa': {
        gloss: 'thêm, tiếp tục',
        before: ['lần', 'thêm', 'còn', 'không', 'gì', 'đâu', 'ai', 'nào', 'chút', 'ít', 'tí'],
        after: ['là', 'thì', 'rồi', 'đi', 'nhé', 'thôi', 'chứ'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'nghỉ': {
        gloss: 'ngừng làm việc',
        before: ['được', 'xin', 'ngày', 'kỳ', 'kì', 'tạm', 'cho', 'nghỉ'],
        after: ['ngơi', 'học', 'việc', 'hưu', 'phép', 'mát', 'lễ', 'trưa', 'ốm', 'giải', 'tay', 'chân'],
      },
      'nghĩ': {
        gloss: 'tư duy',
        before: ['suy', 'ngẫm', 'đang', 'thử', 'cứ'],
        after: ['rằng', 'về', 'ra', 'đến', 'kỹ', 'ngợi', 'bụng', 'thầm', 'lại', 'sao', 'mà'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'sửa': {
        gloss: 'làm lại cho đúng',
        before: ['đi', 'mang', 'cần', 'phải', 'đem', 'thợ', 'tiệm', 'chỉnh'],
        after: ['chữa', 'xe', 'lỗi', 'bài', 'đổi', 'sang', 'soạn', 'nhà', 'máy', 'lại', 'chính'],
      },
      'sữa': {
        gloss: 'đồ uống từ bò, mẹ',
        before: ['hộp', 'ly', 'cốc', 'uống', 'bột', 'hũ', 'bịch', 'ống', 'bú'],
        after: ['tươi', 'chua', 'bò', 'mẹ', 'đặc', 'công', 'ong', 'tắm', 'rửa', 'bột'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'bảo': {
        gloss: 'giữ gìn, dặn dò',
        before: ['che', 'ai', 'người', 'mẹ', 'đã', 'anh', 'chị'],
        after: ['vệ', 'đảm', 'hiểm', 'tồn', 'quản', 'trì', 'dưỡng', 'mật', 'lãnh', 'ban', 'rằng', 'là'],
      },
      'bão': {
        gloss: 'thời tiết dữ dội',
        before: ['cơn', 'trận', 'siêu', 'mùa', 'sau', 'trước'],
        after: ['táp', 'lũ', 'số', 'tố', 'đổ', 'bộ', 'lụt', 'hòa', 'giật'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'cũ': {
        gloss: 'không mới',
        before: ['đồ', 'bạn', 'người', 'xe', 'nhà', 'quần', 'áo', 'sách', 'máy', 'chuyện'],
        after: ['kỹ', 'kĩ', 'mới', 'rích', 'càng'],
      },
      'củ': {
        gloss: 'phần rễ cây',
        before: ['một', 'vài', 'mấy', 'luộc', 'gọt'],
        after: ['khoai', 'cải', 'hành', 'tỏi', 'gừng', 'nghệ', 'sắn', 'riềng', 'cà'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'mở': {
        gloss: 'làm cho không đóng',
        before: ['đã', 'vừa', 'cần', 'hãy', 'đang', 'chưa'],
        after: ['cửa', 'ra', 'đầu', 'rộng', 'màn', 'khóa', 'lời', 'đường', 'bài', 'quán', 'mang'],
      },
      'mỡ': {
        gloss: 'chất béo',
        before: ['thịt', 'miếng', 'lớp', 'nhiều', 'béo', 'dầu'],
        after: ['lợn', 'màng', 'bụng', 'heo', 'gan', 'hành', 'máu'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'đổ': {
        gloss: 'làm tràn, sụp',
        before: ['làm', 'bị', 'xô', 'sụp', 'sập'],
        after: ['nước', 'vỡ', 'xăng', 'máu', 'mồ', 'nát', 'bộ', 'lỗi', 'dồn'],
      },
      'đỗ': {
        gloss: 'dừng lại, thi đạt',
        before: ['thi', 'chỗ', 'bãi', 'hạt', 'đậu', 'điểm'],
        after: ['xe', 'đạt', 'xanh', 'đen', 'tương', 'đại', 'trượt'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'rảnh': {
        gloss: 'không bận',
        before: ['lúc', 'khi', 'đang', 'hơi', 'được', 'thời', 'nào'],
        after: ['rỗi', 'tay', 'rang', 'việc'],
      },
      'rãnh': {
        gloss: 'đường lõm dài',
        before: ['cái', 'con', 'đường', 'một', 'đào'],
        after: ['nước', 'thoát', 'mương', 'sâu'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'lỡ': {
        gloss: 'bỏ mất, trót',
        before: ['bị', 'đã', 'chẳng', 'may', 'nhỡ'],
        after: ['hẹn', 'tay', 'dở', 'chuyến', 'làng', 'thì', 'miệng', 'mất', 'lời'],
      },
      'lở': {
        gloss: 'sạt, loét',
        before: ['sạt', 'đất', 'bị', 'núi'],
        after: ['đất', 'loét', 'núi', 'bờ', 'mồm'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'hũ': {
        gloss: 'đồ đựng',
        before: ['cái', 'một', 'chiếc', 'trong'],
        after: ['gạo', 'rượu', 'mắm', 'đựng', 'tương', 'vàng'],
      },
      'hủ': {
        gloss: 'cũ nát — chỉ dùng trong "hủ tục, hủ hóa, hủ nho"',
        before: [],
        after: ['tục', 'hóa', 'lậu', 'nho', 'bại'],
        strict: true,
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'vẻ': {
        gloss: 'dáng, bề ngoài',
        before: ['dáng', 'có', 'ra', 'phong', 'đầy', 'làm'],
        after: ['đẹp', 'mặt', 'ngoài', 'vang', 'duyên', 'như', 'buồn'],
      },
      'vẽ': {
        gloss: 'tạo hình bằng nét',
        before: ['bức', 'đang', 'biết', 'tập', 'hình', 'học'],
        after: ['tranh', 'hình', 'vời', 'đồ', 'bản', 'họa', 'bậy'],
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'cũng': { gloss: 'từ nối, biểu thị tương đồng', before: [], after: [] },
      'củng': {
        gloss: 'chỉ dùng trong "củng cố"',
        before: [],
        after: ['cố'],
        strict: true,
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'đã': { gloss: 'chỉ thì quá khứ', before: [], after: [] },
      'đả': {
        gloss: 'đánh — chỉ dùng trong "đả kích, đả đảo, đả thương"',
        before: [],
        after: ['kích', 'đảo', 'thương', 'phá', 'động'],
        strict: true,
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'ngủ': { gloss: 'trạng thái nghỉ', before: [], after: [] },
      'ngũ': {
        gloss: 'năm — chỉ dùng trong "ngũ cốc, đội ngũ, ngã ngũ"',
        before: ['ngã', 'đội', 'đấu', 'hàng'],
        after: ['cốc', 'quan', 'hành', 'vị', 'sắc'],
        strict: true,
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'vẫn': { gloss: 'tiếp tục như trước', before: [], after: [] },
      'vẩn': {
        gloss: 'đục — chỉ dùng trong "vẩn đục, vẩn vơ"',
        before: [],
        after: ['đục', 'vơ'],
        strict: true,
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'lãng': {
        gloss: 'buông thả, hoang phí',
        before: [],
        after: ['phí', 'mạn', 'quên', 'du', 'tử'],
      },
      'lảng': {
        gloss: 'né tránh — "lảng tránh, nói lảng"',
        before: ['nói', 'lấp'],
        after: ['tránh', 'vảng'],
        strict: true,
      },
    },
  },
  {
    tag: 'hoi-nga',
    forms: {
      'dở': {
        gloss: 'không tốt, chưa xong',
        before: ['hơi', 'quá', 'rất', 'khóc'],
        after: ['dang', 'tệ', 'khóc', 'chứng', 'ẹ', 'òm', 'hơi'],
      },
      'dỡ': {
        gloss: 'tháo xuống — "dỡ hàng, tháo dỡ"',
        before: ['tháo', 'bốc'],
        after: ['hàng', 'xuống', 'nhà', 'bỏ'],
        strict: true,
      },
    },
  },
  {
    tag: 'd-gi-r',
    forms: {
      'dành': {
        gloss: 'cất giữ, để riêng cho',
        before: ['để', 'ưu', 'phần', 'riêng'],
        after: ['thời', 'gian', 'dụm', 'riêng', 'tặng', 'cho', 'sẵn', 'lại'],
      },
      'giành': {
        gloss: 'tranh lấy về mình',
        before: ['tranh', 'đi', 'cùng'],
        after: ['chiến', 'thắng', 'giật', 'lấy', 'quyền', 'độc', 'giải', 'ngôi', 'huy'],
      },
    },
  },
  {
    tag: 'ch-tr',
    forms: {
      'chuyện': {
        gloss: 'sự việc, lời kể',
        before: ['câu', 'kể', 'nói', 'trò', 'có', 'những', 'mọi', 'vụ'],
        after: ['gì', 'này', 'đó', 'ấy', 'riêng', 'tình', 'cũ', 'lạ'],
      },
      'truyện': {
        gloss: 'tác phẩm viết ra',
        before: ['đọc', 'cuốn', 'quyển', 'viết', 'tập', 'bộ', 'xem'],
        after: ['tranh', 'ngắn', 'cổ', 'tích', 'dài', 'kiếm', 'ma'],
      },
    },
  },
  {
    tag: 'd-gi-r',
    forms: {
      'dở': {
        gloss: 'không tốt, chưa xong',
        before: ['hơi', 'quá', 'rất'],
        after: ['dang', 'tệ', 'ẹ', 'òm'],
      },
      'giở': {
        gloss: 'mở ra, bày ra — "giở sách, giở trò"',
        before: [],
        after: ['sách', 'trang', 'trò', 'ra', 'vở', 'sổ'],
        strict: true,
      },
    },
  },
];

/** Cửa sổ ngữ cảnh (số token mỗi bên) khi tìm cue. */
export const CUE_WINDOW = 3;
