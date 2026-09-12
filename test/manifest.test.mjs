/**
 * Mọi tài nguyên content script nạp qua chrome-extension:// PHẢI được khai báo
 * web-accessible.
 *
 * Bài test này sinh ra từ một lỗi thật, và là loại lỗi tệ nhất trong dự án
 * này: không crash, chỉ mất một tầng.
 *
 * `web_accessible_resources` liệt kê `src/engine/*.js`, `src/content/*.js` và
 * `models/*` — quên mất `vendor/*`. Content script gọi
 * `import(base + 'vendor/ort.wasm.bundle.min.mjs')`, Chrome chặn vì tài nguyên
 * không web-accessible, `load()` bắt lỗi rồi ghi một dòng warn, và extension
 * chạy tiếp bằng tầng luật như không có chuyện gì.
 *
 * Hậu quả: extension vẫn cài được, vẫn gạch chân được, vẫn trông như đang
 * hoạt động — chỉ là tầng model 78MB không bao giờ sống. Người dùng không thể
 * biết. Mọi phép đo offline cũng không thể biết, vì chúng nạp model thẳng từ
 * đĩa chứ không đi qua luật web-accessible của Chrome.
 *
 * Chỉ cài thật vào Chrome và mở trang chrome://extensions mới thấy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
const indexSrc = readFileSync(join(root, 'extension/src/content/index.js'), 'utf8');

/** Gom mọi pattern web-accessible, bất kể khai báo trong bao nhiêu khối. */
const patterns = (manifest.web_accessible_resources || []).flatMap((w) => w.resources || []);

/** Chrome cho `*` khớp mọi ký tự, kể cả dấu gạch chéo. */
function covers(pattern, path) {
  const rx = new RegExp(
    '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
  );
  return rx.test(path);
}

const covered = (path) => patterns.some((p) => covers(p, path));

/**
 * Đường dẫn extension mà index.js dựng bằng `base + '...'`. Quét tĩnh bắt được
 * phần này; phần runtime tự nối thì phải liệt kê tay ở dưới.
 */
function staticPaths() {
  return [...indexSrc.matchAll(/base \+ '([^']+)'/g)]
    .map((m) => m[1])
    .filter((p) => p && !p.endsWith('/'));   // `base + 'vendor/'` là thư mục
}

/**
 * File onnxruntime TỰ nối đường dẫn rồi tải lúc chạy, từ `wasmPaths`. Không
 * quét tĩnh nào thấy được chúng — quên khai báo thì model chết im lặng y hệt.
 */
const RUNTIME_FETCHED = [
  'vendor/ort-wasm-simd-threaded.wasm',
  'vendor/ort-wasm-simd-threaded.mjs',
];

test('web_accessible_resources phủ mọi module content script import', () => {
  const paths = staticPaths();
  assert.ok(paths.length >= 6, `quét được quá ít đường dẫn (${paths.length}) — regex hỏng?`);

  const missing = paths.filter((p) => !covered(p));
  assert.deepEqual(missing, [],
    `thiếu trong web_accessible_resources: ${missing.join(', ')}\n` +
    `Chrome sẽ chặn import và extension im lặng tụt xuống chỉ còn tầng luật.`);
});

test('web_accessible_resources phủ cả file onnxruntime tự tải lúc chạy', () => {
  const missing = RUNTIME_FETCHED.filter((p) => !covered(p));
  assert.deepEqual(missing, [],
    `thiếu trong web_accessible_resources: ${missing.join(', ')}`);
});

test('không khai báo thừa cả thư mục gốc', () => {
  // `*` hay `*.js` trơ trọi sẽ phơi TOÀN BỘ extension ra mọi trang web — vừa
  // là bề mặt vân tay, vừa là thứ đội duyệt store hỏi tới.
  const tooBroad = patterns.filter((p) => p === '*' || p === '*.*' || p === '/*');
  assert.deepEqual(tooBroad, [], `pattern quá rộng: ${tooBroad.join(', ')}`);
});

test('manifest đủ điều kiện nộp store', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length <= 132,
    `description ${manifest.description.length} ký tự, store giới hạn 132`);
  assert.ok(manifest.name.length <= 75);
  for (const size of ['16', '48', '128']) {
    assert.ok(manifest.icons?.[size], `thiếu icon ${size}px`);
  }
  // ::highlight() chỉ có từ Chrome 105. Thiếu mốc này thì người dùng Chrome cũ
  // cài được nhưng không thấy gạch chân nào, và không có gì báo cho họ biết.
  assert.ok(Number(manifest.minimum_chrome_version) >= 105);
  // Lời hứa của sản phẩm: không gọi mạng được, do Chrome thi hành chứ không
  // do tác giả tự giác.
  assert.equal(manifest.host_permissions, undefined,
    'xin host_permissions là phá vỡ lời hứa "không một ký tự nào rời khỏi trình duyệt"');
});
