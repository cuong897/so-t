// Cache theo cửa sổ (quyết định 35) không bao giờ được đổi KẾT QUẢ, chỉ đổi thời gian.
//
// Model thật không chạy trong Node, nên dùng một session giả mà logit của mỗi vị trí
// phụ thuộc token bên trái, chính nó, token bên phải và VỊ TRÍ. Cache trả nhầm một
// cửa sổ — khoá thiếu một từ, ghép nhầm offset, lấy cửa sổ kém "ở giữa" — thì kết quả
// lệch khỏi lượt chạy không cache. Test không dựa vào việc model giả đúng hay sai.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { OnnxEngine } from '../extension/src/engine/onnxEngine.js';
import { BpeTokenizer } from '../extension/src/engine/bpe.js';
import { TAG_NAMES } from '../extension/src/engine/vi.js';

const MODELS = path.join(import.meta.dirname, '..', 'extension', 'models');
const need = ['tokenizer.json', 'lexicon.json', '_sentence_cases.json'].map((f) => path.join(MODELS, f));
const hasFixtures = need.every((f) => fs.existsSync(f));

function fakeEngine(opts) {
  const e = new OnnxEngine(opts);
  const nTags = TAG_NAMES.length;
  e.ort = { Tensor: class { constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims; } } };
  e.session = {
    async run(feeds) {
      const ids = Array.from(feeds.input_ids.data, Number);
      const out = new Float32Array(ids.length * nTags);
      for (let j = 0; j < ids.length; j++) {
        const l = ids[j - 1] ?? 7; const r = ids[j + 1] ?? 11;
        for (let t = 0; t < nTags; t++) {
          let h = (Math.imul(ids[j] + 31, 2654435761) ^ Math.imul(l + 17, 40503) ^ Math.imul(r + 5, 9973) ^ (j * 131) ^ (t * 7919)) >>> 0;
          h = (h ^ (h >>> 13)) >>> 0;
          // KEEP hay thấp, thỉnh thoảng một nhãn vọt lên — đủ để cổng 0,95 có lúc mở
          out[j * nTags + t] = t === 0 ? (h % 7) : ((h % 97) === 0 ? 14 : (h % 9));
        }
      }
      return { logits: { data: out } };
    },
  };
  e.tokenizer = new BpeTokenizer(JSON.parse(fs.readFileSync(need[0], 'utf8')));
  e.lexicon = new Set(JSON.parse(fs.readFileSync(need[1], 'utf8')));
  e.ready = true;
  return e;
}

const key = (xs) => xs.map((x) => `${x.start}:${x.end}:${x.suggestion}:${x.confidence}`).join('|');

function flatTexts() {
  const cases = JSON.parse(fs.readFileSync(need[2], 'utf8'));
  const out = [];
  for (let d = 0; d < 6; d++) {
    const words = [];
    for (let k = 0; words.length < 250 + d * 60; k++) {
      for (const w of cases[(d * 97 + k * 13) % cases.length].wrong) if (/^[\p{L}\p{M}]+$/u.test(w)) words.push(w);
    }
    out.push(words);
  }
  return out;
}

test('sửa văn bản dài không dấu câu: kết quả có cache GIỐNG HỆT chạy lạnh', { skip: !hasFixtures }, async () => {
  let totalIssues = 0; let windowHits = 0; let compared = 0;
  for (const words of flatTexts()) {
    const warm = fakeEngine({ windowCacheSize: 256 });
    const m = Math.floor(words.length / 2);
    const versions = [
      words,
      [...words, 'nhé'],                                        // gõ thêm ở cuối
      [...words.slice(0, m), 'nguyễn', ...words.slice(m + 1)],  // thay một từ giữa bài, đổi số subword
      [...words.slice(0, m), ...words.slice(m + 1)],            // xoá một từ giữa bài
      ['Hôm', 'nay', ...words],                                 // chèn ở đầu — mọi vị trí đều dịch
      words,                                                    // quay về bản đầu
    ];
    for (const v of versions) {
      const text = v.join(' ');
      const got = await warm.check(text);
      const cold = await fakeEngine({ windowCacheSize: 0 }).check(text);
      assert.equal(key(got), key(cold), `lệch sau khi sửa, văn bản ${v.length} từ`);
      totalIssues += cold.length; compared++;
    }
    windowHits += warm.stats.windowHits;
  }
  assert.equal(compared, 36);
  assert.ok(totalIssues > 20, `model giả chỉ sinh ${totalIssues} issue — test gần như vô nghĩa`);
  assert.ok(windowHits > 100, `chỉ ${windowHits} lần trúng cache cửa sổ — test không chạm tới cache`);
});

test('câu nhiều cửa sổ không nằm trong cache theo câu khi đã bật cache cửa sổ', { skip: !hasFixtures }, async () => {
  const words = flatTexts()[5];
  const on = fakeEngine({ windowCacheSize: 32 });
  const off = fakeEngine({ windowCacheSize: 0 });
  for (let k = 0; k < 30; k++) {
    // mỗi vòng một phiên bản khác: thay một từ ở 100, xoá một từ ở vị trí 200+k
    const v = [...words.slice(0, 100), k % 2 ? 'bàn' : 'ghế', ...words.slice(101)];
    const edited = [...v.slice(0, 200 + k), ...v.slice(201 + k)];
    await on.check(edited.join(' '));
    await off.check(edited.join(' '));
  }
  // bản tắt giữ nguyên cả bài cho MỖI phiên bản — tăng theo số lần sửa, tới 400 bản
  assert.ok(off.cacheRows() > 25 * words.length * 0.9, `bản tắt giữ ${off.cacheRows()} dòng`);
  // bản bật không lưu câu nhiều cửa sổ ở mức câu...
  assert.equal(on._cache.size, 0, 'câu dài vẫn bị lưu cả câu');
  // ...và cửa sổ có trần: <= windowCacheSize cửa sổ, mỗi cửa sổ <= 64 subword nên <= 64 từ
  assert.ok(on._wcache.size <= 32);
  assert.ok(on.cacheRows() <= 32 * 64, `bật giữ ${on.cacheRows()} dòng, trần 2.048`);
});

test('cache cửa sổ có trần: không vượt windowCacheSize cửa sổ', { skip: !hasFixtures }, async () => {
  const e = fakeEngine({ windowCacheSize: 8 });
  for (const words of flatTexts()) await e.check(words.join(' '));
  assert.ok(e._wcache.size <= 8, `${e._wcache.size} cửa sổ trong cache`);
});
