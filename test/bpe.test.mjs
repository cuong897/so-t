import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { BpeTokenizer } from '../extension/src/engine/bpe.js';

const MODELS = path.join(import.meta.dirname, '..', 'extension', 'models');
const specPath = path.join(MODELS, 'tokenizer.json');
const casesPath = path.join(MODELS, '_parity_cases.json');

// Fixture do ml/export_tokenizer.py sinh ra. Chưa chạy nó thì bỏ qua nhóm test
// này thay vì fail — repo mới clone không có sẵn file model.
const hasFixtures = fs.existsSync(specPath) && fs.existsSync(casesPath);

test('bpe.js mã hoá GIỐNG HỆT tokenizer PhoBERT bên Python', { skip: !hasFixtures }, () => {
  const tok = new BpeTokenizer(JSON.parse(fs.readFileSync(specPath, 'utf8')));
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));

  let tokens = 0;
  let mismatch = null;
  for (const c of cases) {
    const { ids, wordIds } = tok.encodeWords(c.words, 96);
    tokens += ids.length;
    if (!mismatch && (ids.length !== c.ids.length || ids.some((v, i) => v !== c.ids[i]))) {
      const at = ids.findIndex((v, i) => v !== c.ids[i]);
      mismatch = `câu "${c.words.join(' ').slice(0, 50)}…" lệch tại vị trí ${at}: `
        + `js=${ids[at]} python=${c.ids[at]}`;
    }
    if (!mismatch && wordIds.some((v, i) => v !== c.wordIds[i])) {
      mismatch = `wordIds lệch ở câu "${c.words.join(' ').slice(0, 50)}…"`;
    }
  }

  assert.equal(mismatch, null, mismatch ?? '');
  assert.ok(tokens > 5000, `mới kiểm ${tokens} token, quá ít để tin`);
});

test('quy ước hậu tố: subword còn tiếp gắn @@, subword cuối để trơn',
  { skip: !hasFixtures }, () => {
    const tok = new BpeTokenizer(JSON.parse(fs.readFileSync(specPath, 'utf8')));
    // Từ một token: không có dấu nào
    assert.deepEqual(tok.bpe('nổ'), ['nổ']);
    // Từ nhiều token: mọi phần trừ phần cuối mang '@@'
    const pieces = tok.bpe('nguyễn');
    assert.ok(pieces.length > 1);
    assert.ok(pieces.slice(0, -1).every((p) => p.endsWith('@@')));
    assert.ok(!pieces[pieces.length - 1].endsWith('@@'));
  });

test('firstSubwordIndex trỏ đúng subword đầu của mỗi từ',
  { skip: !hasFixtures }, () => {
    const tok = new BpeTokenizer(JSON.parse(fs.readFileSync(specPath, 'utf8')));
    const words = ['Cả', 'nhóm', 'đã', 'nguyễn', 'lực'];
    const { ids, wordIds } = tok.encodeWords(words, 96);
    const first = tok.firstSubwordIndex(wordIds, words.length);

    assert.equal(first.length, words.length);
    for (let w = 0; w < words.length; w++) {
      assert.ok(first[w] > 0, `từ ${words[w]} không có subword`);
      assert.equal(wordIds[first[w]], w);
      // phải là subword ĐẦU TIÊN, tức trước nó không thuộc cùng từ
      assert.notEqual(wordIds[first[w] - 1], w);
    }
    assert.equal(ids[0], tok.bosId);
    assert.equal(ids[ids.length - 1], tok.eosId);
  });

test('từ bị cắt vì vượt maxLen thì báo -1 chứ không trỏ bừa',
  { skip: !hasFixtures }, () => {
    const tok = new BpeTokenizer(JSON.parse(fs.readFileSync(specPath, 'utf8')));
    const words = Array.from({ length: 50 }, () => 'nghiêng');
    const { wordIds } = tok.encodeWords(words, 12);
    const first = tok.firstSubwordIndex(wordIds, words.length);
    assert.ok(first.slice(-10).every((i) => i === -1));
  });

// --- phân nhóm nhãn hiển thị ---------------------------------------------

test('tagGroup phân biệt hỏi/ngã với thiếu dấu và sai dấu', async () => {
  const { tagGroup } = await import('../extension/src/engine/onnxEngine.js');

  // Lỗi KIẾN THỨC: cả hai đều có dấu, và đều thuộc {hỏi, ngã}
  assert.equal(tagGroup('TONE_NGA', 'nổ', 'nỗ'), 'hoi-nga');
  assert.equal(tagGroup('TONE_HOI', 'trãi', 'trải'), 'hoi-nga');

  // Lỗi GÕ PHÍM: gốc không dấu -> thêm dấu vào
  assert.equal(tagGroup('TONE_HOI', 'giam', 'giảm'), 'thieu-dau');
  assert.equal(tagGroup('TONE_NANG', 'luc', 'lực'), 'thieu-dau');

  // Đặt nhầm sang thanh khác, không dính tới hỏi/ngã
  assert.equal(tagGroup('TONE_SAC', 'lùc', 'lúc'), 'sai-dau');
  assert.equal(tagGroup('TONE_HUYEN', 'nhiếu', 'nhiều'), 'sai-dau');

  // Phụ âm và âm cuối giữ nguyên như cũ
  assert.equal(tagGroup('CH_TR', 'chân', 'trân'), 'ch-tr');
  assert.equal(tagGroup('S_X', 'sử', 'xử'), 's-x');
  assert.equal(tagGroup('D_GI', 'dành', 'giành'), 'd-gi-r');
  assert.equal(tagGroup('N_NG', 'hoàn', 'hoàng'), 'n-ng');
});
