/**
 * Worker chạy model — MỘT bản cho cả trình duyệt (quyết định 38).
 *
 * Trước đây content script nạp model ở mọi tab: mỗi tab thêm 279 MB bộ nhớ, kể cả tab
 * không có ô nhập liệu nào (quyết định 37). Giờ model nạp một lần ở đây, lần đầu một ô
 * đủ điều kiện được focus trên bất kỳ trang nào.
 *
 * OnnxEngine KHÔNG đổi một dòng: cùng ngưỡng, cùng chấm theo câu, cùng F2, cùng cache —
 * chỉ là cache giờ dùng chung cho mọi tab.
 */

import { OnnxEngine } from '../engine/onnxEngine.js';
import { createCheckService } from './checkService.js';

// Worker không có chrome.runtime.getURL. Thư mục gốc extension suy ra từ URL của chính
// file này: src/offscreen/worker.js -> ../../
const base = new URL('../../', import.meta.url).href;

const t0 = performance.now();
const engine = new OnnxEngine();
const ready = engine.load({
  ort: base + 'vendor/ort.wasm.bundle.min.mjs',
  wasmDir: base + 'vendor/',
  model: base + 'models/soat.int8.onnx',
  tokenizer: base + 'models/tokenizer.json',
  lexicon: base + 'models/lexicon.json',
  meta: base + 'models/soat.meta.json',
});

// Hai con số để kiểm từ bên ngoài rằng model KHÔNG bị nạp lại: offscreen bị Chrome đóng
// rồi tạo lại thì `instance` đổi (quyết định 38, điều kiện 8).
const instance = Math.random().toString(36).slice(2, 10);
let loadMs = null;
ready.then(() => { loadMs = Math.round(performance.now() - t0); });

const service = createCheckService(engine, ready);

self.onmessage = async (e) => {
  const { id, key, seq, text } = e.data;
  const result = await service.handle({ key, seq, text });
  self.postMessage({ id, ...result, instance, loadMs });
};
