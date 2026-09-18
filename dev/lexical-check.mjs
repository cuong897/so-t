/**
 * Thử gói store thật trên một trình soạn thảo Lexical THẬT — `playground.lexical.dev`,
 * cùng thứ Facebook dùng cho ô "Tạo bài viết".
 *
 * Vì sao cần, dù đã có dev/measure-chrome.mjs: trang đo ở đó là một `contenteditable`
 * trần do chính mình viết. Lexical thì chặn `paste` mặc định, tự chèn nội dung, KHÔNG
 * bắn `input`, và dựng lại DOM ngay sau đó — ba thứ đã giết tầng model một lần (quyết
 * định 36). Đây là chỗ gần Facebook nhất mà không cần tài khoản.
 *
 * KHÔNG thay được việc thử trên Facebook thật: trang này nhẹ, không React của Facebook,
 * không bộ gõ tiếng Việt, và extension nạp qua CDP chứ không phải cài như người dùng.
 *
 * Chạy:
 *   node dev/lexical-check.mjs                          (gói mặc định dist/soat-1.0.0.zip)
 *   node dev/lexical-check.mjs --zip dist/soat-A.zip --idle 300
 *
 * Headless, không cửa sổ nào bật lên.
 *
 * BẪY đã mất bốn lượt chạy mới thấy: trong headless, CLICK CHUỘT KHÔNG BẮN `focusin`.
 * Content script chỉ gắn MutationObserver khi có `focusin`, nên nếu chỉ click rồi dán
 * thì không lượt soát nào chạy — trông y hệt sản phẩm hỏng. Phải `blur()` rồi `focus()`
 * bằng tay (xem focusEditor). Cùng họ với ghi chú của dev/harness-content.html.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NUL = String.fromCharCode(0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const OPT = {
  chrome: args.chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  zip: path.resolve(ROOT, args.zip || 'dist/soat-1.0.0.zip'),
  idle: Number(args.idle || 0),      // giây để yên giữa hai lần dán (service worker tắt sau 30 s)
  url: args.url || 'https://playground.lexical.dev/',
};

// Đoạn thử của bàn giao: tầng luật CỐ Ý không bắt `cứ trú`, model bắt `cứ→cư`.
const P = 'Tuần trước nhóm mình đã tổ chức một buổi gặp mặt nhỏ ở quán cà phê gần trường. Mọi người đến khá đông và ai cũng mang theo một món quà nhỏ để trao đổi với nhau. Sau đó cả nhóm cùng nhau đi dạo quanh hồ và chụp rất nhiều ảnh kỷ niệm. Buổi tối chúng mình ăn lẩu và nói chuyện về những dự định trong năm tới. Có bạn muốn học thêm tiếng Anh, có bạn định xin việc ở một công ty lớn. Mình thì vẫn đang phân vân giữa việc học tiếp và đi làm ngay. Hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển.';
const U = 'tuần trước nhóm mình đã tổ chức một buổi gặp mặt nhỏ ở quán cà phê gần trường mọi người đến khá đông và ai cũng mang theo một món quà nhỏ để trao đổi với nhau sau đó cả nhóm cùng nhau đi dạo quanh hồ và chụp rất nhiều ảnh kỷ niệm buổi tối chúng mình ăn lẩu và nói chuyện về những dự định trong năm tới có bạn muốn học thêm tiếng anh có bạn định xin việc ở một công ty lớn mình thì vẫn đang phân vân giữa việc học tiếp và đi làm ngay hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển';

const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soat-ext-'));
const unzip = spawnSync('python', ['-c', 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', OPT.zip, extDir], { encoding: 'utf8' });
if (unzip.status !== 0) throw new Error(`giải nén hỏng: ${unzip.stderr}`);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'soat-lexical-'));
const proc = spawn(OPT.chrome, ['--remote-debugging-pipe', '--enable-unsafe-extension-debugging',
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--disable-search-engine-choice-screen', '--headless', '--window-size=1400,900', 'about:blank'],
{ stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

const [, , , wr, rd] = proc.stdio;
let buf = '';
let seq = 0;
const waiters = new Map();
rd.on('data', (d) => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf(NUL)) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.id && waiters.has(msg.id)) {
      const w = waiters.get(msg.id);
      waiters.delete(msg.id);
      if (msg.error) w.reject(new Error(msg.error.message)); else w.resolve(msg.result);
    }
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const m = { id: ++seq, method, params };
  if (sessionId) m.sessionId = sessionId;
  waiters.set(m.id, { resolve, reject });
  wr.write(JSON.stringify(m) + NUL);
});

let sessionId;
let swSession;

/** Vòng đệm số đo, đọc từ service worker của extension. */
async function docDo() {
  if (!swSession) return [];
  try {
    const r = await send('Runtime.evaluate', {
      expression: `chrome.storage.session.get('soatDo').then((x) => JSON.stringify(x.soatDo || []))`,
      awaitPromise: true, returnByValue: true,
    }, swSession);
    return JSON.parse(r.result.value || '[]');
  } catch { return []; }
}

const ev = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, sessionId);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
};

/**
 * Dán như người dùng Ctrl+V: sự kiện `paste` mang clipboardData, để chính Lexical chèn
 * nội dung. Trả về gạch chân đọc ngay và đọc lại sau 2 giây — Lexical dựng lại DOM sau
 * khi chèn, và một vệt gạch trỏ vào node đã chết thì `Range.toString()` rỗng, bề rộng 0.
 */
async function paste(text, label) {
  const out = JSON.parse(await ev(`(async () => {
    const ed = document.querySelector('[contenteditable="true"]');
    // focusin bằng tay — xem phần BẪY ở đầu file.
    if (document.activeElement === ed) ed.blur();
    ed.focus();
    await new Promise((r) => setTimeout(r, 600));
    let inputs = 0;
    const count = () => inputs++;
    ed.addEventListener('input', count);
    const dt = new DataTransfer();
    dt.setData('text/plain', ${JSON.stringify(text)});
    const t0 = performance.now();
    ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    const read = () => ['soat-high', 'soat-low'].flatMap((n) => [...(CSS.highlights.get(n) || [])].map((r) => {
      const rect = r.getBoundingClientRect();
      return { name: n, text: r.toString(), w: Math.round(rect.width) };
    }));
    let marks = [];
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 50));
      marks = read();
      if (marks.length) break;
    }
    await new Promise((r) => setTimeout(r, 2000));
    ed.removeEventListener('input', count);
    const txt = ed.innerText;
    return JSON.stringify({ ms: Math.round(performance.now() - t0), inputs, chars: txt.length,
      // Ô KHÔNG được xoá giữa hai lần dán — nội dung dồn lại, nên số chỗ đáng gạch là số
      // lần "cứ trú" xuất hiện, không phải một. Tiêu chí "đúng một gạch" từng làm công cụ
      // này báo SAI cho một sản phẩm đang chạy đúng.
      soCuTru: (txt.match(/cứ trú/g) || []).length, marks, marksSau: read() });
  })()`, true));
  const dong = await docDo();
  out.lastLog = (dong[dong.length - 1] || '').slice(0, 240);
  const cu = out.marksSau.filter((m) => m.text === 'cứ');
  const khac = out.marksSau.filter((m) => m.text !== 'cứ');
  const ok = out.soCuTru > 0 && cu.length === out.soCuTru && cu.every((m) => m.w > 0) && khac.length === 0;
  console.log(`${ok ? 'ĐÚNG' : 'SAI '} ${label}: ${out.chars} ký tự · ${out.soCuTru} chỗ "cứ trú" · ${out.inputs} sự kiện input · ${out.ms}ms`);
  console.log(`      gạch sau 2 giây: ${JSON.stringify(out.marksSau)}`);
  console.log(`      ${out.lastLog}`);
  return { ...out, ok };
}

try {
  for (let i = 0; ; i++) {
    try { await send('Browser.getVersion'); break; } catch (e) { if (i > 40) throw e; await sleep(250); }
  }
  let id;
  for (let i = 0; i < 10 && !id; i++) {
    try { id = (await send('Extensions.loadUnpacked', { path: extDir })).id; } catch { await sleep(500); }
  }
  if (!id) throw new Error('không nạp được extension');
  await sleep(1500);

  // Chế độ đo: bật qua service worker, đúng cách bàn giao ghi.
  const { targetInfos } = await send('Target.getTargets');
  const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(id));
  const { sessionId: swS } = await send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
  await send('Runtime.evaluate', { expression: `chrome.storage.local.set({ soatDebug: true })`, awaitPromise: true, returnByValue: true }, swS);
  // Giữ phiên này: từ quyết định 42 số đo nằm trong storage.session của extension,
  // không còn trên DOM của trang.
  swSession = swS;

  const { targetId } = await send('Target.createTarget', { url: OPT.url });
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
  await sleep(9000);
  console.log(`${path.basename(OPT.zip)} trên ${OPT.url}`);

  const results = [];
  results.push(await paste(P, 'dán đoạn CÓ dấu câu'));
  if (OPT.idle) {
    console.log(`      đợi ${OPT.idle}s — service worker bị tắt sau 30 s rảnh…`);
    await sleep(OPT.idle * 1000);
  }
  results.push(await paste(U, `dán đoạn KHÔNG dấu câu${OPT.idle ? ` (sau ${OPT.idle}s rảnh)` : ''}`));

  const mem = spawnSync('python', ['-c',
    'import psutil; ps=[p for p in psutil.process_iter(["name","cmdline"]) if p.info["name"]=="chrome.exe" and any("soat-lexical" in c for c in (p.info["cmdline"] or []))]; print(len(ps), "tiến trình:", sorted(round(p.memory_info().private/2**20) for p in ps), "MB")'],
  { encoding: 'utf8' });
  console.log('bộ nhớ:', mem.stdout.trim());
  console.log(results.every((r) => r.ok)
    ? 'KẾT LUẬN: mọi lần dán đều gạch đúng mọi chỗ "cứ trú", và không gạch chỗ nào khác.'
    : 'KẾT LUẬN: CÓ LẦN DÁN KHÔNG ĐÚNG — đọc lại dòng log ở trên.');
} catch (e) {
  console.error('hỏng:', e.message);
  process.exitCode = 1;
} finally {
  try { await send('Browser.close'); } catch {}
  await sleep(2000);
  for (const d of [profile, extDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
  process.exit(process.exitCode || 0);
}
