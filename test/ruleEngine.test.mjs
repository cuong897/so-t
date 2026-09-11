import test from 'node:test';
import assert from 'node:assert/strict';
import { checkText, applyCase, dedupe, RULE_STATS } from '../extension/src/engine/ruleEngine.js';

/** Tiện ích: trả về danh sách "sai->đúng" cho dễ đọc trong assert. */
const fixes = (text) => checkText(text).map((i) => `${i.original}->${i.suggestion}`);

test('bắt được lỗi cụm tuyệt đối', () => {
  assert.deepEqual(fixes('Cả nhóm đã nổ lực rất nhiều.'), ['nổ lực->nỗ lực']);
  assert.deepEqual(fixes('Mình xin chia sẽ kinh nghiệm.'), ['chia sẽ->chia sẻ']);
  assert.deepEqual(fixes('Anh ấy bắt trước y hệt.'), ['bắt trước->bắt chước']);
  assert.deepEqual(fixes('Xin chân trọng cảm ơn.'), ['chân trọng->trân trọng']);
  assert.deepEqual(fixes('Kết quả rất suất sắc.'), ['suất sắc->xuất sắc']);
  assert.deepEqual(fixes('Bác sĩ chuẩn đoán sai.'), ['chuẩn đoán->chẩn đoán']);
});

test('bắt nhiều lỗi trong một câu, đúng thứ tự', () => {
  const out = fixes('Tôi đã nổ lực chia sẽ những trãi nghiệm của mình.');
  assert.deepEqual(out, ['nổ lực->nỗ lực', 'chia sẽ->chia sẻ', 'trãi->trải']);
});

test('giữ hoa/thường của bản gốc', () => {
  assert.deepEqual(fixes('Nổ lực hết mình.'), ['Nổ lực->Nỗ lực']);
  assert.deepEqual(fixes('NỔ LỰC hết mình.'), ['NỔ LỰC->NỖ LỰC']);
  assert.equal(applyCase('Trãi', 'trải'), 'Trải');
  assert.equal(applyCase('TRÃI', 'trải'), 'TRẢI');
});

test('offset trỏ đúng vào chuỗi gốc', () => {
  const text = 'Cả nhóm đã nổ lực rất nhiều.';
  const [issue] = checkText(text);
  assert.equal(text.slice(issue.start, issue.end), 'nổ lực');
  assert.equal(issue.tag, 'hoi-nga');
  assert.ok(issue.why.length > 0);
});

test('cụm dài thắng cụm ngắn nằm trong nó', () => {
  // 'sữa chửa' phải khớp trọn cụm, không tách thành hai lỗi rời.
  const out = checkText('Tiệm sữa chửa xe máy.');
  assert.equal(out.length, 1);
  assert.equal(out[0].original, 'sữa chửa');
  assert.equal(out[0].suggestion, 'sửa chữa');
});

// ---------------------------------------------------------------------------
// Cặp đồng âm — cả hai dạng đều là từ đúng, chỉ ngữ cảnh mới phân biệt được.
// Đây là lớp lỗi mà từ điển và Hunspell không thể xử lý.
// ---------------------------------------------------------------------------

test('dành / giành phân biệt theo ngữ cảnh', () => {
  assert.deepEqual(fixes('Đội tuyển đã dành chiến thắng.'), ['dành->giành']);
  assert.deepEqual(fixes('Tôi giành thời gian cho gia đình.'), ['giành->dành']);
});

test('chuyện / truyện phân biệt theo ngữ cảnh', () => {
  assert.deepEqual(fixes('Tôi thích đọc chuyện tranh.'), ['chuyện->truyện']);
  assert.deepEqual(fixes('Có truyện gì xảy ra vậy?'), ['truyện->chuyện']);
});

test('nửa / nữa phân biệt theo ngữ cảnh', () => {
  assert.deepEqual(fixes('Đợi thêm nửa lần xem sao.'), ['nửa->nữa']);
  assert.deepEqual(fixes('Còn đúng một nữa tiếng.'), ['nữa->nửa']);
});

test('nghỉ / nghĩ phân biệt theo ngữ cảnh', () => {
  assert.deepEqual(fixes('Tôi suy nghỉ về chuyện đó.'), ['suy nghỉ->suy nghĩ']);
  assert.deepEqual(fixes('Cuối tuần được nghĩ ngơi.'), ['nghĩ->nghỉ']);
});

test('sửa / sữa phân biệt theo ngữ cảnh', () => {
  assert.deepEqual(fixes('Mua hộp sửa tươi.'), ['sửa->sữa']);
  assert.deepEqual(fixes('Mang xe đi sữa lại.'), ['sữa->sửa']);
});

test('dạng hiếm đứng một mình bị nghi ngờ (strict)', () => {
  // 'củng' chỉ sống trong 'củng cố'
  assert.deepEqual(fixes('Cái này củng được mà.'), ['củng->cũng']);
  // nhưng trong 'củng cố' thì phải im lặng
  assert.deepEqual(fixes('Cần củng cố kiến thức.'), []);
});

test('ngũ / ngủ — dạng hiếm', () => {
  assert.deepEqual(fixes('Tối qua tôi ngũ rất ngon.'), ['ngũ->ngủ']);
  assert.deepEqual(fixes('Ngũ cốc rất tốt cho sức khỏe.'), []);
  assert.deepEqual(fixes('Chuyện đã ngã ngũ rồi.'), []);
});

// ---------------------------------------------------------------------------
// KHÔNG ĐƯỢC BÁO SAI — nhóm test quan trọng nhất.
// Một lần gạch chân nhầm là người dùng gỡ cài. Recall để dành cho model.
// ---------------------------------------------------------------------------

test('câu viết đúng thì không báo gì', () => {
  const clean = [
    'Cả nhóm đã nỗ lực rất nhiều.',
    'Mình xin chia sẻ một vài trải nghiệm.',
    'Đội tuyển đã giành chiến thắng thuyết phục.',
    'Tôi dành thời gian cho gia đình.',
    'Tôi thích đọc truyện tranh Nhật Bản.',
    'Có chuyện gì xảy ra vậy?',
    'Cuối tuần được nghỉ ngơi thoải mái.',
    'Tôi suy nghĩ rất kỹ về chuyện đó.',
    'Mua hộp sữa tươi ở siêu thị.',
    'Mang xe đi sửa lại cho chắc.',
    'Cần củng cố kiến thức nền tảng.',
    'Ngũ cốc rất tốt cho sức khỏe.',
    'Còn đúng một nửa tiếng nữa thôi.',
    'Xin trân trọng cảm ơn quý vị.',
    'Kết quả học tập rất xuất sắc.',
    'Bác sĩ chẩn đoán đúng bệnh.',
    'Anh ấy bắt chước rất giống.',
    'Công ty bảo vệ quyền lợi người lao động.',
    'Cơn bão số 3 đổ bộ vào đất liền.',
    'Hỗ trợ kỹ thuật hoạt động 24/7.',
  ];
  for (const s of clean) {
    assert.deepEqual(checkText(s), [], `báo sai ở câu: ${s}`);
  }
});

test('không đụng vào số, mã, tên riêng viết liền', () => {
  assert.deepEqual(checkText('Mã đơn AB123XY, tổng 1.500.000đ'), []);
  assert.deepEqual(checkText('const x = getUserData();'), []);
});

test('văn bản rỗng hoặc không có từ nào', () => {
  assert.deepEqual(checkText(''), []);
  assert.deepEqual(checkText('   \n  '), []);
  assert.deepEqual(checkText('!!! ??? ...'), []);
});

test('từ điển cá nhân: bỏ qua từ người dùng đã từ chối', () => {
  const ignored = new Set(['nổ lực']);
  assert.deepEqual(checkText('Cả nhóm đã nổ lực.', { ignored }), []);
});

test('ngưỡng tin cậy lọc được issue yếu', () => {
  const strict = checkText('Đội tuyển đã dành chiến thắng.', { minConfidence: 0.95 });
  assert.deepEqual(strict, []);
});

test('dedupe bỏ issue chồng lấn, giữ span dài hơn', () => {
  const out = dedupe([
    { start: 0, end: 6, confidence: 0.9, original: 'nổ lực' },
    { start: 0, end: 2, confidence: 0.99, original: 'nổ' },
    { start: 10, end: 14, confidence: 0.9, original: 'trãi' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].end, 6);
});

test('cơ sở luật có kích thước hợp lý', () => {
  assert.ok(RULE_STATS.phrases >= 130, `mới có ${RULE_STATS.phrases} luật cụm`);
  assert.ok(RULE_STATS.contextPairs >= 18);
});
