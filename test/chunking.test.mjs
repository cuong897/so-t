// Chia văn bản thành lượt chạy cho tầng model (quyết định 32, 33).
//
// Hai hàm ở đây quyết định từ nào được model NHÌN thấy. Sai ở đây không làm gì
// đổ cả — từ bị bỏ sót chỉ lặng lẽ không bao giờ được gạch chân, đúng như lỗi
// cắt cụt đã sống sót hai tuần. Nên điều kiện chung của mọi test dưới đây là:
// mỗi từ phải được ít nhất một lượt chạy phủ tới.

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, planRuns } from '../extension/src/engine/onnxEngine.js';
import { tokenize, isWordLike } from '../extension/src/engine/vi.js';

const spansOf = (text) => tokenize(text).filter(isWordLike);

function assertCovers(runs, n) {
  const seen = new Array(n).fill(false);
  for (const { from, to } of runs) {
    assert.ok(from < to, `lượt rỗng [${from}, ${to})`);
    for (let i = from; i < to; i++) seen[i] = true;
  }
  const miss = seen.findIndex((x) => !x);
  assert.equal(miss, -1, `từ số ${miss} không được lượt chạy nào phủ tới`);
}

test('tách câu ở . ! ? … và xuống dòng, giữ nguyên chỉ số span', () => {
  const text = 'Chào bạn. Mình ở đây!\nOk…vậy nhé? Cuối cùng';
  const spans = spansOf(text);
  const parts = splitSentences(text, spans).map(([a, b]) => spans.slice(a, b).map((s) => s.text));
  assert.deepEqual(parts, [['Chào', 'bạn'], ['Mình', 'ở', 'đây'], ['Ok'], ['vậy', 'nhé'], ['Cuối', 'cùng']]);
});

test('các câu nối liền nhau phủ ĐÚNG MỘT LẦN mọi span', () => {
  const text = 'Một. Hai ba! Bốn, năm sáu… bảy';
  const spans = spansOf(text);
  const parts = splitSentences(text, spans);
  assert.equal(parts[0][0], 0);
  assert.equal(parts[parts.length - 1][1], spans.length);
  for (let i = 1; i < parts.length; i++) assert.equal(parts[i][0], parts[i - 1][1]);
});

test('dấu phẩy không tách câu; dấu chấm trong "3.5" thì CÓ tách', () => {
  const text = 'Giá 3.5 triệu, rất rẻ';
  const spans = spansOf(text);
  // "3.5" không phải từ nên không có span, nhưng dấu chấm của nó nằm trong khoảng
  // trống giữa "Giá" và "triệu". Tách thừa ở đây chấp nhận được (chỉ làm câu
  // ngắn đi) — test này ghi lại hành vi đó cho rõ, không phải để khen nó.
  assert.deepEqual(splitSentences(text, spans), [[0, 1], [1, 4]]);
});

test('văn bản rỗng hay không có từ nào thì không có câu nào', () => {
  assert.deepEqual(splitSentences('', []), []);
  assert.deepEqual(splitSentences('123 !!!', spansOf('123 !!!')), []);
});

test('câu vừa cửa sổ thì chạy đúng một lượt, bất kể đường lui', () => {
  for (const fb of ['F1', 'F2', 'none']) {
    assert.deepEqual(planRuns([1, 2, 1, 1], 94, fb), [{ from: 0, to: 4 }]);
  }
});

test("'none' giữ hành vi cũ: một lượt duy nhất, để encodeWords cắt", () => {
  assert.deepEqual(planRuns(new Array(200).fill(1), 94, 'none'), [{ from: 0, to: 200 }]);
});

test('F1 cắt cứng, mỗi mảnh <= 40 subword, không chia giữa từ, phủ hết', () => {
  const counts = Array.from({ length: 150 }, (_, i) => 1 + (i % 3 === 0));
  const runs = planRuns(counts, 94, 'F1');
  assertCovers(runs, counts.length);
  for (let i = 1; i < runs.length; i++) assert.equal(runs[i].from, runs[i - 1].to, 'F1 không được chồng lấn');
  for (const { from, to } of runs) {
    const sub = counts.slice(from, to).reduce((a, b) => a + b, 0);
    assert.ok(sub <= 40, `mảnh [${from}, ${to}) dài ${sub} subword`);
  }
});

test('F2 cửa sổ <= 64 subword, chồng lấn, phủ hết', () => {
  const counts = Array.from({ length: 150 }, (_, i) => 1 + (i % 4 === 0));
  const runs = planRuns(counts, 94, 'F2');
  assertCovers(runs, counts.length);
  for (const { from, to } of runs) {
    const sub = counts.slice(from, to).reduce((a, b) => a + b, 0);
    assert.ok(sub <= 64, `cửa sổ [${from}, ${to}) dài ${sub} subword`);
  }
  for (let i = 1; i < runs.length; i++) {
    assert.ok(runs[i].from > runs[i - 1].from, 'F2 phải tiến lên');
    assert.ok(runs[i].from < runs[i - 1].to, 'F2 phải chồng lấn với cửa sổ trước');
  }
});

test('một từ dài quá cả mảnh vẫn được phủ, không lặp vô hạn', () => {
  for (const fb of ['F1', 'F2']) {
    const counts = [1, 1, 70, 1, 1, ...new Array(60).fill(1)];
    assertCovers(planRuns(counts, 94, fb), counts.length);
  }
});

test('đường lui lạ thì ném lỗi, không lặng lẽ chọn bừa', () => {
  assert.throws(() => planRuns(new Array(200).fill(1), 94, 'F3'));
});
