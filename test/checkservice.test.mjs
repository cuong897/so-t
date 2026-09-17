// Hàng đợi chấm dùng chung của offscreen (quyết định 38). Engine giả: mỗi "câu" là một
// lượt run có nhả luồng, tôn trọng signal như OnnxEngine.check(), và GHI LẠI lúc nào có
// hai lượt chạy chồng nhau — thứ hàng đợi phải cấm.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckService } from '../extension/src/offscreen/checkService.js';

function fakeEngine({ sentenceMs = 5 } = {}) {
  const e = {
    stats: { runs: 0, cacheHits: 0 },
    active: 0,
    overlaps: 0,
    started: [],
    async check(text, { signal } = {}) {
      e.started.push(text);
      e.active++;
      if (e.active > 1) e.overlaps++;
      try {
        const out = [];
        for (const [i, s] of text.split('.').entries()) {
          if (signal?.aborted) return [];
          await new Promise((r) => setTimeout(r, sentenceMs));
          e.stats.runs++;
          if (s.includes('sai')) out.push({ start: i, end: i + 1, suggestion: 'đúng', source: 'model' });
        }
        return out;
      } finally {
        e.active--;
      }
    },
  };
  return e;
}

test('trả đúng issue và số lượt model của riêng lượt đó', async () => {
  const e = fakeEngine();
  const svc = createCheckService(e, Promise.resolve(true));
  const r = await svc.handle({ key: 'a', seq: 1, text: 'câu một. câu sai. câu ba' });
  assert.equal(r.ok, true);
  assert.equal(r.issues.length, 1);
  assert.equal(r.runs, 3);
});

test('nhiều tab gửi cùng lúc: chạy lần lượt, không bao giờ chồng nhau, ai cũng nhận đúng phần mình', async () => {
  const e = fakeEngine();
  const svc = createCheckService(e, Promise.resolve(true));
  const texts = ['a sai. b. c', 'd. e sai. f sai', 'g. h. i', 'sai. sai. sai. sai'];
  const results = await Promise.all(texts.map((text, i) => svc.handle({ key: `tab${i}`, seq: 1, text })));
  assert.equal(e.overlaps, 0);
  assert.deepEqual(results.map((r) => r.ok), [true, true, true, true]);
  assert.deepEqual(results.map((r) => r.issues.length), [1, 2, 0, 4]);
  assert.deepEqual(results.map((r) => r.runs), [3, 3, 3, 4]);
});

test('lượt mới của CÙNG ô huỷ lượt đang chạy ở lần nhả luồng kế tiếp', async () => {
  const e = fakeEngine({ sentenceMs: 10 });
  const svc = createCheckService(e, Promise.resolve(true));
  const long = Array.from({ length: 20 }, () => 'câu sai').join('. ');
  const first = svc.handle({ key: 'o', seq: 1, text: long });
  await new Promise((r) => setTimeout(r, 25));
  const second = svc.handle({ key: 'o', seq: 2, text: 'ngắn sai' });
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, { ok: false, aborted: true });
  assert.equal(b.ok, true);
  assert.ok(e.stats.runs < 20, `lượt cũ phải dừng sớm, đã chạy ${e.stats.runs} lượt`);
});

test('lượt còn xếp hàng mà đã cũ thì không chạy chút nào', async () => {
  const e = fakeEngine();
  const svc = createCheckService(e, Promise.resolve(true));
  const blocker = svc.handle({ key: 'khác', seq: 1, text: 'x. y. z' });
  const stale = svc.handle({ key: 'o', seq: 1, text: 'bản cũ' });
  const fresh = svc.handle({ key: 'o', seq: 2, text: 'bản mới' });
  const results = await Promise.all([blocker, stale, fresh]);
  assert.deepEqual(results[1], { ok: false, aborted: true });
  assert.equal(results[2].ok, true);
  assert.ok(!e.started.includes('bản cũ'), 'bản cũ không được đụng tới engine');
});

test('lượt khác ô KHÔNG bị huỷ bởi ô khác', async () => {
  const e = fakeEngine();
  const svc = createCheckService(e, Promise.resolve(true));
  const [a, b] = await Promise.all([
    svc.handle({ key: 'tab1:ô', seq: 5, text: 'một sai' }),
    svc.handle({ key: 'tab2:ô', seq: 1, text: 'hai sai' }),
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
});

test('seq tới trễ và nhỏ hơn cái đã nhận thì bị bỏ, không ghi đè seq mới', async () => {
  const e = fakeEngine();
  const svc = createCheckService(e, Promise.resolve(true));
  const fresh = svc.handle({ key: 'o', seq: 3, text: 'mới' });
  const late = svc.handle({ key: 'o', seq: 2, text: 'cũ tới trễ' });
  assert.deepEqual(await late, { ok: false, aborted: true });
  assert.equal((await fresh).ok, true);
});

test('model không nạp được: trả lỗi, không treo, không ném', async () => {
  const e = fakeEngine();
  const svc = createCheckService(e, Promise.resolve(false));
  const r = await svc.handle({ key: 'o', seq: 1, text: 'câu sai' });
  assert.equal(r.ok, false);
  assert.match(r.error, /model/);
});

test('engine ném lỗi ở một lượt: lượt đó báo lỗi, hàng đợi vẫn chạy tiếp', async () => {
  const e = fakeEngine();
  const check = e.check;
  let n = 0;
  e.check = (...args) => (n++ === 0 ? Promise.reject(new Error('wasm hỏng')) : check(...args));
  const svc = createCheckService(e, Promise.resolve(true));
  const [a, b] = await Promise.all([
    svc.handle({ key: 'x', seq: 1, text: 'một' }),
    svc.handle({ key: 'y', seq: 1, text: 'hai sai' }),
  ]);
  assert.deepEqual(a, { ok: false, error: 'wasm hỏng' });
  assert.equal(b.ok, true);
  assert.equal(b.issues.length, 1);
});

test('số ô được nhớ có trần', async () => {
  const e = fakeEngine({ sentenceMs: 0 });
  const svc = createCheckService(e, Promise.resolve(true));
  const all = [];
  for (let i = 0; i < 1100; i++) all.push(svc.handle({ key: `k${i}`, seq: 1, text: 'a' }));
  await Promise.all(all);
  assert.ok(svc.pendingKeys() <= 1000);
});
