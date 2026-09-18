/**
 * Quyết định 39 — trần cache theo SỐ DÒNG LOGIT thay vì số mục.
 *
 * Chạy bằng node, không cần model: thứ đang đo là **kế toán cache**, không phải chất
 * lượng model. Session giả giống `test/windowcache.test.mjs` — logit phụ thuộc token hai
 * bên và vị trí, đủ để một cache trả nhầm là kết quả lệch ngay.
 *
 * Bốn kịch bản (2.000 và 6.000 ký tự, có và không dấu câu) × 60 lần sửa liên tiếp, xoay
 * vòng đủ NĂM kiểu sửa — trong đó có xoá và chèn nguyên một từ, hai kiểu mà phép đếm
 * thiết kế của quyết định 35 đã bỏ sót và vì thế kết luận sai.
 *
 * Chạy:  node dev/bench-cachecap.mjs
 *        node --expose-gc dev/bench-cachecap.mjs   (số byte mỗi dòng sạch hơn)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OnnxEngine } from '../extension/src/engine/onnxEngine.js';
import { BpeTokenizer } from '../extension/src/engine/bpe.js';
import { TAG_NAMES } from '../extension/src/engine/vi.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'extension', 'models');
const need = ['tokenizer.json', 'lexicon.json', '_sentence_cases.json'].map((f) => path.join(MODELS, f));
if (!need.every((f) => fs.existsSync(f))) {
  console.error('thiếu fixture trong extension/models — chạy ml/export_tokenizer.py trước');
  process.exit(1);
}

const nTags = TAG_NAMES.length;
const tokenizerJson = JSON.parse(fs.readFileSync(need[0], 'utf8'));
const lexicon = new Set(JSON.parse(fs.readFileSync(need[1], 'utf8')));
const cases = JSON.parse(fs.readFileSync(need[2], 'utf8'));

/** Engine với session giả — cùng công thức logit với test/windowcache.test.mjs. */
function fakeEngine(opts) {
  const e = new OnnxEngine(opts);
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
          out[j * nTags + t] = t === 0 ? (h % 7) : ((h % 97) === 0 ? 14 : (h % 9));
        }
      }
      return { logits: { data: out } };
    },
  };
  e.tokenizer = new BpeTokenizer(tokenizerJson);
  e.lexicon = lexicon;
  e.ready = true;
  return e;
}

const key = (xs) => xs.map((x) => `${x.start}:${x.end}:${x.suggestion}:${x.confidence}`).join('|');

/** Văn bản người thật (VSEC), dài xấp xỉ `chars`, có hoặc không dấu câu. */
function makeWords(chars, seed) {
  const words = [];
  let len = 0;
  for (let k = 0; len < chars; k++) {
    for (const w of cases[(seed * 97 + k * 13) % cases.length].wrong) {
      if (!/^[\p{L}\p{M}]+$/u.test(w)) continue;
      words.push(w);
      len += w.length + 1;
      if (len >= chars) break;
    }
  }
  return words;
}

/** Nối thành văn bản: có dấu câu thì chấm mỗi ~12 từ. */
const join = (words, punctuated) => (punctuated
  ? words.map((w, i) => (i % 12 === 11 ? `${w}.` : w)).join(' ')
  : words.join(' '));

/** Năm kiểu sửa, xoay vòng — hai kiểu cuối là hai kiểu quyết định 35 từng bỏ sót. */
function edit(words, kind, n) {
  const m = Math.floor(words.length / 2) + (n % 7);
  const w = words[m] || 'bàn';
  switch (kind) {
    case 0: return [...words, ['nhé', 'ạ', 'nha'][n % 3]];                       // thêm cuối
    case 1: return [...words.slice(0, m), `nguyễn${n % 5}`, ...words.slice(m + 1)]; // thay một từ
    case 2: return [...words.slice(0, m), w.replace(/a/, 'á').replace(/o/, 'ò') + (w.includes('a') || w.includes('o') ? '' : 'ị'), ...words.slice(m + 1)]; // đổi dấu
    case 3: return [...words.slice(0, m), ...words.slice(m + 1)];                // XOÁ một từ
    default: return [...words.slice(0, m), 'thêm', ...words.slice(m)];           // CHÈN một từ
  }
}

const scenarios = [];
for (const chars of [2000, 6000]) {
  for (const punctuated of [true, false]) {
    scenarios.push({ name: `${chars} ký tự, ${punctuated ? 'có' : 'không'} dấu câu`, chars, punctuated });
  }
}

console.log('quyết định 39 — trần cache theo số dòng logit, 60 lần sửa mỗi kịch bản');
console.log(`trần đang đặt: ${new OnnxEngine().maxCacheRows} dòng${' '.repeat(2)}(mục: ${new OnnxEngine().cacheSize})`);
console.log('');

let compared = 0; let lech = 0; let issues = 0;
const rows = [];
for (const [si, s] of scenarios.entries()) {
  const capped = fakeEngine({});
  const uncapped = fakeEngine({ maxCacheRows: Infinity });
  let words = makeWords(s.chars, si + 1);
  let maxCapped = 0; let maxUncapped = 0;

  for (let n = 0; n < 60; n++) {
    words = n === 0 ? words : edit(words, n % 5, n);
    const text = join(words, s.punctuated);
    const a = await capped.check(text);
    const b = await uncapped.check(text);
    compared++;
    if (key(a) !== key(b)) lech++;
    issues += a.length;
    maxCapped = Math.max(maxCapped, capped.cacheRows());
    maxUncapped = Math.max(maxUncapped, uncapped.cacheRows());
  }
  rows.push({
    name: s.name,
    maxCapped, maxUncapped,
    runsCapped: capped.stats.runs, runsUncapped: uncapped.stats.runs,
    ratio: capped.stats.runs / uncapped.stats.runs,
    hits: capped.stats.cacheHits,
  });
}

console.log('| kịch bản | dòng cao nhất: CÓ trần | KHÔNG trần | lượt model: có / không | tỷ số |');
console.log('|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.name} | ${r.maxCapped.toLocaleString('vi')} | ${r.maxUncapped.toLocaleString('vi')} `
    + `| ${r.runsCapped.toLocaleString('vi')} / ${r.runsUncapped.toLocaleString('vi')} | x${r.ratio.toFixed(3)} |`);
}
console.log('');

// Điều kiện 4: bao nhiêu byte một dòng — để biết 16.384 dòng là bao nhiêu MB.
const sample = [];
const gc = globalThis.gc;
if (gc) gc();
const before = process.memoryUsage().heapUsed;
const N = 50000;
for (let i = 0; i < N; i++) {
  sample.push({ logits: new Float32Array(nTags), allowed: ['KEEP', 'TONE_HUYEN', 'TONE_SAC'] });
}
if (gc) gc();
const perRow = (process.memoryUsage().heapUsed - before) / N;
console.log(`một dòng logit ≈ ${Math.round(perRow)} byte${gc ? '' : ' (chạy với --expose-gc cho số sạch hơn)'}`
  + ` → trần 16.384 dòng ≈ ${(perRow * 16384 / 2 ** 20).toFixed(1)} MB, trần cũ 400 mục × ~1.340 dòng ≈ ${(perRow * 536000 / 2 ** 20).toFixed(0)} MB`);
console.log(`(giữ ${sample.length} mẫu để tối ưu hoá không xoá mất phép đo)`);
console.log('');

// Tự chấm theo điều kiện đã ghi ở quyết định 39.
const CAP = new OnnxEngine().maxCacheRows;
const c1 = lech === 0 && compared === 240;
const c2 = rows.every((r) => r.maxCapped <= CAP);
const c3 = rows.every((r) => r.ratio <= 1.10);
console.log(`${c1 ? 'qua ' : 'TRƯỢT'} 1 đồng nhất: ${compared - lech} / ${compared} phiên bản giống hệt bản không trần (${issues.toLocaleString('vi')} issue)   (cần 240/240)`);
console.log(`${c2 ? 'qua ' : 'TRƯỢT'} 2 trần: cao nhất ${Math.max(...rows.map((r) => r.maxCapped)).toLocaleString('vi')} dòng   (cần ≤ ${CAP.toLocaleString('vi')})`);
console.log(`${c3 ? 'qua ' : 'TRƯỢT'} 3 chi phí: tỷ số lượt model lớn nhất x${Math.max(...rows.map((r) => r.ratio)).toFixed(3)}   (cần ≤ 1,10)`);
console.log(c1 && c2 && c3 ? 'Luật: SHIP trần theo dòng.' : 'Luật: KHÔNG SHIP — đọc lại số ở trên.');
process.exitCode = c1 && c2 && c3 ? 0 : 1;
