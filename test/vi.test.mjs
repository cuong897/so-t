import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setTone, getTone, stripTone, toAscii, tonePosition,
  splitSyllable, setInitial, getFinal, setFinal,
  applicableTags, tokenize, TONE,
} from '../extension/src/engine/vi.js';

test('đặt dấu thanh: có âm cuối thì dấu rơi vào nguyên âm cuối', () => {
  assert.equal(setTone('buôn', TONE.HUYEN), 'buồn');
  assert.equal(setTone('tiêng', TONE.SAC), 'tiếng');
  assert.equal(setTone('nguyên', TONE.NGA), 'nguyễn');
  assert.equal(setTone('quyên', TONE.HOI), 'quyển');
  assert.equal(setTone('hoan', TONE.NANG), 'hoạn');
});

test('đặt dấu thanh: không âm cuối thì dấu rơi vào nguyên âm áp chót', () => {
  assert.equal(setTone('mua', TONE.HUYEN), 'mùa');
  assert.equal(setTone('cuôi', TONE.SAC), 'cuối');
  assert.equal(setTone('ngươi', TONE.HUYEN), 'người');
  assert.equal(setTone('giay', TONE.HUYEN), 'giày');
  assert.equal(setTone('khuyu', TONE.HOI), 'khuỷu');
  assert.equal(setTone('cua', TONE.HOI), 'của');
});

test('nguyên âm lướt của qu/gi không mang dấu', () => {
  assert.equal(setTone('qua', TONE.HUYEN), 'quà');
  assert.equal(setTone('giưa', TONE.NGA), 'giữa');
  assert.equal(setTone('quôc', TONE.SAC), 'quốc');
});

test('đổi qua lại hỏi ↔ ngã', () => {
  assert.equal(setTone('nổ', TONE.NGA), 'nỗ');
  assert.equal(setTone('trãi', TONE.HOI), 'trải');
  assert.equal(setTone('hổ', TONE.NGA), 'hỗ');
  assert.equal(setTone('nữa', TONE.HOI), 'nửa');
  assert.equal(getTone('nghĩ').tone, TONE.NGA);
  assert.equal(getTone('nghỉ').tone, TONE.HOI);
});

test('tách phụ âm đầu, khớp dài nhất trước', () => {
  assert.deepEqual(splitSyllable('nghiêng'), { initial: 'ngh', rime: 'iêng' });
  assert.deepEqual(splitSyllable('giết'), { initial: 'gi', rime: 'ết' });
  assert.deepEqual(splitSyllable('quan'), { initial: 'qu', rime: 'an' });
  assert.deepEqual(splitSyllable('trong'), { initial: 'tr', rime: 'ong' });
  assert.deepEqual(splitSyllable('ăn'), { initial: '', rime: 'ăn' });
});

test('đổi phụ âm đầu giữ ràng buộc chính tả c/k, g/gh, ng/ngh', () => {
  assert.equal(setInitial('chân', 'tr'), 'trân');
  assert.equal(setInitial('sử', 'x'), 'xử');
  assert.equal(setInitial('dành', 'gi'), 'giành');
  assert.equal(setInitial('lăm', 'n'), 'năm');
  // 'k' trước nguyên âm sau phải quay về 'c'
  assert.equal(setInitial('cần', 'k'), 'cần');
  // 'ng' trước nguyên âm trước phải thành 'ngh'
  assert.equal(setInitial('ngan', 'ngh'), 'ngan');
  assert.equal(setInitial('nghe', 'ng'), 'nghe');
});

test('giữ hoa/thường khi thay phụ âm đầu', () => {
  assert.equal(setInitial('Chân', 'tr'), 'Trân');
  assert.equal(setInitial('Sử', 'x'), 'Xử');
});

test('âm cuối', () => {
  assert.equal(getFinal('hoàn'), 'n');
  assert.equal(getFinal('hoàng'), 'ng');
  assert.equal(getFinal('cách'), 'ch');
  assert.equal(setFinal('hoàn', 'ng'), 'hoàng');
  assert.equal(setFinal('các', 't'), 'cát');
});

test('bỏ dấu', () => {
  assert.equal(stripTone('nỗ lực'), 'nô lưc');
  assert.equal(toAscii('Đường phố Hà Nội'), 'Duong pho Ha Noi');
});

test('sinh nhãn áp dụng được, có lọc theo từ điển', () => {
  const tags = applicableTags('nổ');
  assert.ok(tags.includes('KEEP'));
  assert.ok(tags.includes('HOI_NGA'));

  // Từ điển loại bỏ ứng viên không phải từ: 'lổ' không có trong từ điển.
  const lex = new Set(['nổ', 'nỗ']);
  const filtered = applicableTags('nổ', lex);
  assert.deepEqual(filtered, ['KEEP', 'HOI_NGA']);
});

test('mọi nhãn đều sinh ra chuỗi khác chuỗi gốc', () => {
  const lex = null;
  for (const w of ['chân', 'sử', 'dành', 'lực', 'hoàn', 'các']) {
    for (const tag of applicableTags(w, lex)) {
      if (tag === 'KEEP') continue;
      assert.notEqual(w, null);
    }
  }
});

test('tokenize giữ đúng offset gốc', () => {
  const text = 'Cả nhóm đã nổ lực.';
  const toks = tokenize(text);
  assert.equal(toks.length, 5);
  assert.equal(toks[3].text, 'nổ');
  assert.equal(text.slice(toks[3].start, toks[3].end), 'nổ');
  assert.equal(toks[4].text, 'lực');
  assert.equal(text.slice(toks[4].start, toks[4].end), 'lực');
});

test('tonePosition không nổ với chuỗi không có nguyên âm', () => {
  assert.equal(tonePosition('ngh'), -1);
  assert.equal(getTone('...'), null);
});
