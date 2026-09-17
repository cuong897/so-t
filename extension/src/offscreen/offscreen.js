/**
 * Offscreen document — cầu nối giữa service worker và Worker chạy model.
 *
 * Trang offscreen chỉ dùng được chrome.runtime, còn Worker thì không dùng được chrome.*
 * nào. Nên trang này làm đúng một việc: nhận lượt chấm service worker chuyển tới,
 * đưa vào Worker, trả kết quả về. Hàng đợi và huỷ lượt cũ nằm trong Worker
 * (checkService.js), cạnh engine.
 *
 * Lý do khai với Chrome là WORKERS, và đó là sự thật: suy luận chạy trong Worker bên
 * dưới, không phải trên luồng của trang này.
 */

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

let nextId = 0;
const pending = new Map();

worker.onmessage = (e) => {
  const { id, ...result } = e.data;
  const reply = pending.get(id);
  pending.delete(id);
  if (reply) reply(result);
};

// Worker chết (import hỏng, wasm không tạo được) thì mọi lượt đang đợi phải được trả
// lời — không thì content script đợi mãi và tầng model biến mất không một dấu vết.
worker.onerror = (e) => {
  const error = `Worker hỏng: ${e.message || 'không rõ'}`;
  for (const reply of pending.values()) reply({ ok: false, error });
  pending.clear();
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'soat:offscreen:check') return false;
  const id = ++nextId;
  pending.set(id, sendResponse);
  worker.postMessage({ id, key: msg.key, seq: msg.seq, text: msg.text });
  return true;
});
