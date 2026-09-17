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
 *
 * Quyết định 38 dời model sang offscreen document: content script không còn tải
 * onnxruntime, nên `vendor/*` và `models/*` rời khỏi danh sách web-accessible. Rủi ro
 * cùng họ đổi chỗ: giờ là một chuỗi message gõ sai hay một file offscreen quên đóng
 * gói — vẫn không crash, vẫn chỉ mất tầng model. Các test cuối file canh chỗ đó.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
const src = (p) => readFileSync(join(root, 'extension', p), 'utf8');
const indexSrc = src('src/content/index.js');
const backgroundSrc = src('src/background.js');
const offscreenHtml = src('src/offscreen/offscreen.html');
const offscreenSrc = src('src/offscreen/offscreen.js');
const workerSrc = src('src/offscreen/worker.js');
const packageSrc = readFileSync(join(root, 'ml/package_extension.py'), 'utf8');

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

/** Mọi module content script nạp, kể cả import tĩnh lồng bên trong, đi theo đồ thị. */
function contentModuleGraph() {
  const seen = new Set();
  const queue = staticPaths();
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    seen.add(p);
    const dir = p.split('/').slice(0, -1).join('/');
    for (const m of src(p).matchAll(/^import[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      queue.push(new URL(m[1], `http://x/${dir}/`).pathname.slice(1));
    }
  }
  return [...seen];
}

test('web_accessible_resources phủ mọi module content script import', () => {
  const paths = staticPaths();
  assert.ok(paths.length >= 5, `quét được quá ít đường dẫn (${paths.length}) — regex hỏng?`);

  const missing = contentModuleGraph().filter((p) => !covered(p));
  assert.deepEqual(missing, [],
    `thiếu trong web_accessible_resources: ${missing.join(', ')}\n` +
    `Chrome sẽ chặn import và extension im lặng mất tầng đó.`);
});

test('content script KHÔNG nạp model hay onnxruntime — kể cả gián tiếp', () => {
  // Quyết định 37: nạp ở trang là 279 MB mỗi tab. Một dòng import lỡ tay kéo lại
  // onnxEngine.js vào trang là quay về đúng chỗ đó mà không test nào khác thấy.
  const graph = contentModuleGraph();
  assert.ok(graph.includes('src/engine/ruleEngine.js') && graph.includes('src/engine/vi.js'),
    `đồ thị import hỏng: ${graph.join(', ')}`);
  const heavy = graph.filter((p) => /onnxEngine|bpe\.js|vendor\/|models\//.test(p));
  assert.deepEqual(heavy, [], `content script kéo theo: ${heavy.join(', ')}`);
  assert.doesNotMatch(indexSrc, /'vendor\/|'models\/|onnxEngine\.js/);
});

test('model và onnxruntime KHÔNG web-accessible', () => {
  // Trang offscreen là trang extension, không cần. Để web-accessible thì trang web
  // nào cũng dò được người dùng cài Soát bằng một lệnh fetch.
  const exposed = ['models/soat.int8.onnx', 'models/tokenizer.json',
    'vendor/ort.wasm.bundle.min.mjs', 'vendor/ort-wasm-simd-threaded.wasm'].filter(covered);
  assert.deepEqual(exposed, [], `lộ ra mọi trang: ${exposed.join(', ')}`);
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
  // ::highlight() cần Chrome 105; chrome.runtime.getContexts, thứ service worker dùng
  // để biết offscreen đã có chưa, cần 116. Thiếu mốc này thì người dùng Chrome cũ cài
  // được nhưng tầng model không bao giờ chạy, và không có gì báo cho họ biết.
  assert.ok(Number(manifest.minimum_chrome_version) >= 116);
  // Quyền mới phải đi kèm giải trình ở docs/store — không để nó lọt vào lặng lẽ.
  assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'offscreen', 'storage']);
  // Lời hứa của sản phẩm: không gọi mạng được, do Chrome thi hành chứ không
  // do tác giả tự giác.
  assert.equal(manifest.host_permissions, undefined,
    'xin host_permissions là phá vỡ lời hứa "không một ký tự nào rời khỏi trình duyệt"');
});

// ---------------------------------------------------------------------------
// Offscreen (quyết định 38). Mỗi mắt xích dưới đây hỏng đều ra cùng một triệu chứng:
// tầng luật vẫn gạch, tầng model im lặng. Không lỗi nào hiện ra cho người dùng.
// ---------------------------------------------------------------------------

test('chuỗi message khớp nhau từ content script tới offscreen', () => {
  for (const type of ['soat:check', 'soat:warm']) {
    assert.ok(indexSrc.includes(`'${type}'`), `content script không gửi ${type}`);
    assert.ok(backgroundSrc.includes(`'${type}'`), `service worker không nhận ${type}`);
  }
  assert.ok(backgroundSrc.includes("'soat:offscreen:check'"), 'service worker không chuyển tiếp');
  assert.ok(offscreenSrc.includes("'soat:offscreen:check'"), 'offscreen không nhận lượt chuyển tiếp');
  // Offscreen KHÔNG được tự nhận 'soat:check' của content script: tin phát tới mọi ngữ
  // cảnh, và hai bên cùng trả lời thì bên nào tới trước thắng.
  assert.ok(!offscreenSrc.includes("'soat:check'"));
});

test('offscreen document, Worker và lý do khai với Chrome khớp nhau', () => {
  const m = /OFFSCREEN_PATH = '([^']+)'/.exec(backgroundSrc);
  assert.ok(m, 'không tìm thấy OFFSCREEN_PATH');
  assert.ok(existsSync(join(root, 'extension', m[1])), `thiếu ${m[1]}`);
  assert.match(offscreenHtml, /<script type="module" src="offscreen\.js"><\/script>/);
  assert.match(offscreenSrc, /new Worker\(new URL\('\.\/worker\.js', import\.meta\.url\), \{ type: 'module' \}\)/);
  // Lý do WORKERS chỉ đúng sự thật khi model thật sự chạy trong Worker, không phải ở
  // trang offscreen — đội duyệt store đọc ô giải trình.
  assert.match(backgroundSrc, /reasons: \['WORKERS'\]/);
  assert.doesNotMatch(offscreenSrc, /onnxEngine|OnnxEngine/);
  assert.match(workerSrc, /from '\.\.\/engine\/onnxEngine\.js'/);
});

test('CSP của trang extension cho phép biên dịch WebAssembly — và KHÔNG gì hơn thế', () => {
  // Lần chạy đầu của bản offscreen trong Chrome thật: CSP mặc định của trang extension
  // MV3 là `script-src 'self'`, không có 'wasm-unsafe-eval'. Worker tạo phiên
  // onnxruntime -> "Compiling or instantiating WebAssembly module violates the following
  // Content Security policy directive" -> load() bắt lỗi -> tầng luật vẫn gạch, tầng
  // model im lặng. Content script cũ không vướng vì nó không chạy dưới CSP này.
  const csp = manifest.content_security_policy?.extension_pages || '';
  const scriptSrc = (/script-src([^;]*)/.exec(csp)?.[1] || '').trim().split(/\s+/);
  assert.ok(scriptSrc.includes("'wasm-unsafe-eval'"), `script-src thiếu 'wasm-unsafe-eval': ${csp}`);
  // MV3 cấm mã từ xa và eval; nới thêm bất cứ thứ gì là đội duyệt store từ chối.
  assert.deepEqual(scriptSrc.filter((x) => x !== "'self'" && x !== "'wasm-unsafe-eval'"), []);
});

test('mọi file offscreen và mọi file Worker tải lúc chạy đều BẮT BUỘC khi đóng gói', () => {
  const required = [...packageSrc.matchAll(/^\s+"([^"]+)",/gm)].map((x) => x[1]);
  const workerPaths = [...workerSrc.matchAll(/base \+ '([^']+)'/g)]
    .map((x) => x[1]).filter((p) => !p.endsWith('/'));
  assert.ok(workerPaths.length >= 5, `quét được quá ít đường dẫn trong worker.js (${workerPaths.length})`);
  const needed = [...workerPaths, 'src/offscreen/offscreen.html', 'src/offscreen/offscreen.js',
    'src/offscreen/worker.js', 'src/offscreen/checkService.js'];
  const missing = needed.filter((p) => !required.includes(p));
  assert.deepEqual(missing, [], `package_extension.py không canh: ${missing.join(', ')}`);
});
