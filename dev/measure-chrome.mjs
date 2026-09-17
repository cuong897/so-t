/**
 * Đo chi phí nạp model trong Chrome THẬT — quyết định 37.
 *
 * Localhost không tương đương extension (quyết định 24, 36), và chế độ đo tay chỉ
 * cho một mẫu mỗi ô. Script này lái chính Chrome đã cài trên máy qua CDP bằng
 * pipe, profile tạm, nạp GÓI STORE giải nén bằng Extensions.loadUnpacked — cùng
 * đường chrome-extension://, cùng content script người dùng nhận.
 *
 * Cách đo và luật chọn ghi ở quyết định 37, commit 1a8d9cb, TRƯỚC khi file này
 * tồn tại. Đổi cách đo thì sửa quyết định trước, đừng sửa ở đây cho số đẹp lên.
 *
 * Chạy (cần Python có psutil để đọc bộ nhớ tiến trình):
 *   node dev/measure-chrome.mjs --out kq.json
 *   node dev/measure-chrome.mjs --rounds 1 --dwell 10 --conc 20   (thử nhanh)
 *
 * Chạy Chrome KHÔNG CỬA SỔ (--headless) — chủ repo không muốn cửa sổ bật lên giữa lúc
 * làm việc. Cùng chrome.exe, cùng đường nạp extension. --headful để thấy cửa sổ.
 * Không đụng profile thật.
 */

import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NUL = String.fromCharCode(0);
const NL = String.fromCharCode(10);

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const OPT = {
  chrome: args.chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  zip: path.resolve(ROOT, args.zip || 'dist/soat-1.0.0.zip'),
  rounds: Number(args.rounds || 3),        // số cặp tắt/bật
  dwell: Number(args.dwell || 10),         // giây mỗi tab tuần tự
  conc: Number(args.conc || 20),           // giây cho 4 tab đồng thời
  out: args.out ? path.resolve(args.out) : null,
  headless: !args.headful,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const MB = (b) => b / 2 ** 20;

// ---------------------------------------------------------------------------
// Đoạn thử của bàn giao — tầng luật cố ý không bắt `cứ trú`, model bắt `cứ→cư`.
// ---------------------------------------------------------------------------
const PASTE_P = 'Tuần trước nhóm mình đã tổ chức một buổi gặp mặt nhỏ ở quán cà phê gần trường. Mọi người đến khá đông và ai cũng mang theo một món quà nhỏ để trao đổi với nhau. Sau đó cả nhóm cùng nhau đi dạo quanh hồ và chụp rất nhiều ảnh kỷ niệm. Buổi tối chúng mình ăn lẩu và nói chuyện về những dự định trong năm tới. Có bạn muốn học thêm tiếng Anh, có bạn định xin việc ở một công ty lớn. Mình thì vẫn đang phân vân giữa việc học tiếp và đi làm ngay. Hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển.';
const PASTE_U = 'tuần trước nhóm mình đã tổ chức một buổi gặp mặt nhỏ ở quán cà phê gần trường mọi người đến khá đông và ai cũng mang theo một món quà nhỏ để trao đổi với nhau sau đó cả nhóm cùng nhau đi dạo quanh hồ và chụp rất nhiều ảnh kỷ niệm buổi tối chúng mình ăn lẩu và nói chuyện về những dự định trong năm tới có bạn muốn học thêm tiếng anh có bạn định xin việc ở một công ty lớn mình thì vẫn đang phân vân giữa việc học tiếp và đi làm ngay hơn một nửa dân số cứ trú tại vùng đồng bằng ven biển';

// ---------------------------------------------------------------------------
// Trang thử. Đầu dò nằm ở <head>, chạy trước mọi script khác của trang và trước
// content script (document_idle). Nó ở ngữ cảnh CHÍNH — cùng luồng với content
// script, nên long task của content script hiện ở đây.
// ---------------------------------------------------------------------------
const PROBE = `
window.__probe = { longtasks: [], loaf: [], modelAt: null, model: null, vis: [[0, document.visibilityState]] };
document.addEventListener('visibilitychange', () => __probe.vis.push([Math.round(performance.now()), document.visibilityState]));
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) __probe.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]);
  }).observe({ type: 'longtask', buffered: true });
} catch (e) { __probe.longtaskError = String(e); }
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      const top = [...e.scripts].sort((a, b) => b.duration - a.duration)[0];
      __probe.loaf.push({ start: Math.round(e.startTime), blocking: Math.round(e.blockingDuration),
        script: top ? [top.sourceURL || '(không URL)', top.invokerType, Math.round(top.duration)] : null });
    }
  }).observe({ type: 'long-animation-frame', buffered: true });
} catch (e) { __probe.loafError = String(e); }
new MutationObserver(() => {
  const v = document.documentElement.dataset.soatModel;
  if (v && v !== 'dang-nap' && __probe.modelAt === null) { __probe.modelAt = Math.round(performance.now()); __probe.model = v; }
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-soat-model'] });
`;

const PAGE = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Soát — trang đo</title>
<script>${PROBE}</script>
<style>body{font:15px/1.6 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px}
#ed,textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #999;border-radius:8px;padding:10px;min-height:110px;margin:12px 0}</style>
</head><body>
<h1>Trang đo của quyết định 37</h1>
<p>Trang này không chạy script nào ngoài đầu dò ở phần đầu. Mọi long task ghi được
ở lượt bật mà không có ở lượt tắt là của extension.</p>
<p>Tuần trước nhóm mình đã tổ chức một buổi gặp mặt nhỏ ở quán cà phê gần trường.
Mọi người đến khá đông và ai cũng mang theo một món quà nhỏ để trao đổi với nhau.</p>
<textarea aria-label="bình luận"></textarea>
<div id="ed" contenteditable="true" aria-label="soạn bài"></div>
</body></html>`;

function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(PAGE);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

// ---------------------------------------------------------------------------
// CDP qua pipe. Extensions.loadUnpacked CHỈ có trên kết nối pipe.
// ---------------------------------------------------------------------------
async function launch(withExtension, extDir) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'soat-measure-'));
  const proc = spawn(OPT.chrome, [
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
    '--host-resolver-rules=MAP *.test 127.0.0.1',
    // Cửa sổ bị cửa sổ khác che thì Windows báo "bị che", Chrome coi mọi tab là
    // ẩn và hạ ưu tiên renderer. Quyết định 37 đo tab ở TIỀN CẢNH — tắt tính
    // năng đó để phép đo không phụ thuộc người dùng có đang dùng máy hay không.
    '--disable-features=CalculateNativeWinOcclusion',
    '--window-size=1280,900',
    ...(OPT.headless ? ['--headless'] : []),
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

  const [, , , wr, rd] = proc.stdio;
  let buf = '';
  let seq = 0;
  const waiters = new Map();
  const listeners = [];
  rd.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf(NUL)) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && waiters.has(msg.id)) {
        const w = waiters.get(msg.id);
        waiters.delete(msg.id);
        if (msg.error) w.reject(new Error(`${w.method}: ${msg.error.message}`));
        else w.resolve(msg.result);
      } else if (msg.method) {
        for (const l of listeners) l(msg);
      }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const m = { id: ++seq, method, params };
    if (sessionId) m.sessionId = sessionId;
    waiters.set(m.id, { resolve, reject, method });
    wr.write(JSON.stringify(m) + NUL);
  });

  // Chrome vừa mở có thể chưa nhận lệnh — lần thử đầu tiên từng trả "File path
  // cannot be resolved" cho một đường dẫn hoàn toàn đúng.
  for (let i = 0; ; i++) {
    try { await send('Browser.getVersion'); break; } catch (e) { if (i > 20) throw e; await sleep(250); }
  }

  const browser = { proc, profile, send, listeners, extId: null };
  if (withExtension) {
    let lastErr;
    for (let i = 0; i < 10 && !browser.extId; i++) {
      try { browser.extId = (await send('Extensions.loadUnpacked', { path: extDir })).id; } catch (e) { lastErr = e; await sleep(500); }
    }
    if (!browser.extId) throw lastErr;
    await setDebugFlag(browser);
  }
  return browser;
}

/** Đặt soatDebug qua service worker của extension — đúng cách bàn giao ghi. */
async function setDebugFlag(b) {
  const prefix = `chrome-extension://${b.extId}/`;
  for (let i = 0; i < 40; i++) {
    const { targetInfos } = await b.send('Target.getTargets');
    const sw = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(prefix));
    if (sw) {
      const { sessionId } = await b.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
      const r = await b.send('Runtime.evaluate', {
        expression: `chrome.storage.local.set({ soatDebug: true }).then(() => chrome.storage.local.get('soatDebug')).then((x) => JSON.stringify(x))`,
        awaitPromise: true, returnByValue: true,
      }, sessionId);
      if (r.result.value !== '{"soatDebug":true}') throw new Error(`không đặt được soatDebug: ${JSON.stringify(r)}`);
      await b.send('Target.detachFromTarget', { sessionId });
      return;
    }
    await sleep(250);
  }
  throw new Error('không thấy service worker của extension');
}

async function close(b) {
  try { await Promise.race([b.send('Browser.close'), sleep(5000)]); } catch {}
  const exited = await Promise.race([new Promise((r) => b.proc.once('exit', () => r(true))), sleep(8000).then(() => false)]);
  if (!exited) b.proc.kill();
  for (let i = 0; i < 20; i++) {
    try { fs.rmSync(b.profile, { recursive: true, force: true }); return; } catch { await sleep(500); }
  }
}

async function openTab(b, host, background) {
  const url = `http://${host}.test:${SERVER_PORT}/page`;
  const { targetId } = await b.send('Target.createTarget', { url, background });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  return { host, targetId, sessionId };
}

async function evalIn(b, tab, expression, awaitPromise = false) {
  const r = await b.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, tab.sessionId);
  if (r.exceptionDetails) throw new Error(`${tab.host}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
}

/** Đọc đầu dò của một tab: long task, LoAF, lúc soatModel đổi, trạng thái hiển thị. */
async function readProbe(b, tab, windowMs) {
  const raw = await evalIn(b, tab, `JSON.stringify({ ...window.__probe,
    soatModel: document.documentElement.dataset.soatModel ?? null,
    visibility: document.visibilityState, now: Math.round(performance.now()) })`);
  const p = JSON.parse(raw);
  const inWin = p.longtasks.filter(([start]) => start < windowMs);
  const m = /san-sang sau ([0-9]+)ms/.exec(p.soatModel || '');
  const worstLoaf = [...p.loaf].sort((a, c) => c.blocking - a.blocking)[0] || null;
  return {
    host: tab.host,
    soatModel: p.soatModel,
    loadMs: m ? Number(m[1]) : null,
    navToReadyMs: p.modelAt,
    longestTask: inWin.reduce((a, [, d]) => Math.max(a, d), 0),
    blockingSum: inWin.reduce((a, [, d]) => a + Math.max(0, d - 50), 0),
    longtasks: inWin,
    worstLoaf,
    visibility: p.visibility,
    // Tab có rời tiền cảnh lúc nào trong thời gian đứng không — quyết định 37 đo tab
    // ở TIỀN CẢNH, nên chỉ một lần 'hidden' cũng làm mẫu đó sai điều kiện.
    everHidden: p.vis.some(([t, v]) => t < windowMs && v !== 'visible'),
    vis: p.vis,
    probeErrors: [p.longtaskError, p.loafError].filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Bộ nhớ: private bytes (PrivateUsage) của mọi renderer, trừ tiến trình extension.
// ---------------------------------------------------------------------------
const PY_MEM = [
  'import sys, json, psutil',
  'out = []',
  'for a in sys.argv[1:]:',
  '    try:',
  '        p = psutil.Process(int(a))',
  '        m = p.memory_info()',
  '        cl = p.cmdline()',
  '        t = next((c.split("=", 1)[1] for c in cl if c.startswith("--type=")), "browser")',
  '        flags = [c for c in cl[1:] if c.startswith("--") and "=" not in c and c not in ("--no-pre-read-main-dll", "--remote-debugging-pipe", "--video-capture-use-gpu-memory-buffer", "--enable-main-frame-before-activation")]',
  '        out.append({"pid": int(a), "type": t, "ext": "--extension-process" in cl, "flags": flags, "private": m.private, "wset": m.wset})',
  '    except Exception as e:',
  '        out.append({"pid": int(a), "error": repr(e)})',
  'print(json.dumps(out))',
].join(NL);

async function memory(b) {
  const { processInfo } = await b.send('SystemInfo.getProcessInfo');
  const r = spawnSync('python', ['-', ...processInfo.map((p) => String(p.id))], { input: PY_MEM, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`đọc bộ nhớ hỏng: ${r.stderr}`);
  const procs = JSON.parse(r.stdout);
  const errors = procs.filter((p) => p.error);
  const renderers = procs.filter((p) => p.type === 'renderer');
  const tabs = renderers.filter((p) => !p.ext);
  return {
    rendererPrivate: tabs.reduce((a, p) => a + p.private, 0),
    rendererWset: tabs.reduce((a, p) => a + p.wset, 0),
    extensionPrivate: renderers.filter((p) => p.ext).reduce((a, p) => a + p.private, 0),
    allPrivate: procs.filter((p) => !p.error).reduce((a, p) => a + p.private, 0),
    nRenderers: tabs.length,
    nErrors: errors.length,
    procs,
  };
}

async function gcAll(b, tabs) {
  for (const t of tabs) {
    try { await b.send('HeapProfiler.collectGarbage', {}, t.sessionId); } catch {}
  }
  await sleep(2000);
}

// ---------------------------------------------------------------------------
// Dán: thay nội dung ô contenteditable bằng thao tác DOM, không bắn `input`.
// ---------------------------------------------------------------------------
async function pasteTest(b, tab, text, label) {
  await b.send('Target.activateTarget', { targetId: tab.targetId });
  await b.send('Emulation.setFocusEmulationEnabled', { enabled: true }, tab.sessionId);
  const box = JSON.parse(await evalIn(b, tab, `(() => { const r = document.getElementById('ed').getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`));
  for (const type of ['mousePressed', 'mouseReleased']) {
    await b.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 }, tab.sessionId);
  }
  // Để lượt soát của lần focus (ô rỗng, dưới MIN_LENGTH) chạy xong trước khi dán.
  await sleep(800);
  const result = await evalIn(b, tab, `(async () => {
    const ed = document.getElementById('ed');
    if (document.activeElement !== ed) return JSON.stringify({ error: 'ô soạn bài không được focus' });
    const logBefore = document.documentElement.dataset.soatLog || '';
    const p = document.createElement('p');
    const span = document.createElement('span');
    span.textContent = ${JSON.stringify(text)};
    p.appendChild(span);
    const t0 = performance.now();
    ed.replaceChildren(p);
    const deadline = t0 + 10000;
    for (;;) {
      await new Promise((r) => setTimeout(r, 10));
      const log = document.documentElement.dataset.soatLog || '';
      const marked = [];
      for (const name of ['soat-high', 'soat-low']) {
        const h = CSS.highlights.get(name);
        if (h) for (const r of h) marked.push(name + ':' + r.toString());
      }
      const settled = log !== logBefore && !/BỎ — văn bản đã đổi$/.test(log);
      if (settled || performance.now() > deadline) {
        return JSON.stringify({ seenAfterMs: Math.round(performance.now() - t0), marked,
          lastLog: log.split(' || ').pop(), timedOut: !settled });
      }
    }
  })()`, true);
  const r = JSON.parse(result);
  const tot = /TỔNG từ input đầu ([0-9]+)ms/.exec(r.lastLog || '');
  const model = /model ([0-9]+)ms · ([0-9]+) lượt model/.exec(r.lastLog || '');
  // Dọn ô cho lần sau — xoá cũng là một thay đổi DOM, đợi nó soát xong.
  await evalIn(b, tab, `document.getElementById('ed').replaceChildren()`);
  await sleep(1500);
  return {
    label, ...r,
    totalMs: tot ? Number(tot[1]) : null,
    modelMs: model ? Number(model[1]) : null,
    modelRuns: model ? Number(model[2]) : null,
    underlinesCu: r.marked ? r.marked.filter((m) => m.endsWith(':cứ')).length : 0,
    otherUnderlines: r.marked ? r.marked.filter((m) => !m.endsWith(':cứ')) : [],
  };
}

// ---------------------------------------------------------------------------
// Một lượt
// ---------------------------------------------------------------------------
let SERVER_PORT = 0;

async function round(index, on, extDir) {
  const label = `lượt ${index + 1} (${on ? 'BẬT' : 'tắt'}${OPT.headless ? ', headless' : ''})`;
  console.log(`${label}: mở Chrome…`);
  const b = await launch(on, extDir);
  const out = { index, on, extId: b.extId };
  try {
    await sleep(2000);   // như nhau cho cả bật lẫn tắt

    const tabs = [];
    out.sequential = [];
    for (let i = 1; i <= 4; i++) {
      const tab = await openTab(b, `t${i}`, false);
      tabs.push(tab);
      await sleep(OPT.dwell * 1000);
      const p = await readProbe(b, tab, OPT.dwell * 1000);
      out.sequential.push(p);
      console.log(`  ${tab.host}: soatModel=${p.soatModel ?? '-'} · long task dài nhất ${p.longestTask}ms${p.everHidden ? ` · RỜI TIỀN CẢNH ${JSON.stringify(p.vis)}` : ''}`);
    }

    await sleep(5000);
    out.s4 = await memory(b);
    await gcAll(b, tabs);
    out.s4gc = await memory(b);
    console.log(`  S4: ${MB(out.s4.rendererPrivate).toFixed(0)} MB, sau GC ${MB(out.s4gc.rendererPrivate).toFixed(0)} MB (${out.s4gc.nRenderers} renderer)`);

    const conc = await Promise.all([5, 6, 7, 8].map((i) => openTab(b, `t${i}`, i !== 8)));
    tabs.push(...conc);
    await sleep(OPT.conc * 1000);
    out.concurrent = [];
    for (const tab of conc) out.concurrent.push(await readProbe(b, tab, OPT.conc * 1000));
    console.log(`  đồng thời: ${out.concurrent.map((p) => p.soatModel ?? '-').join(' | ')}`);

    await sleep(5000);
    out.s8 = await memory(b);
    await gcAll(b, tabs);
    out.s8gc = await memory(b);
    console.log(`  S8: ${MB(out.s8.rendererPrivate).toFixed(0)} MB, sau GC ${MB(out.s8gc.rendererPrivate).toFixed(0)} MB (${out.s8gc.nRenderers} renderer)`);

    if (on) {
      out.paste = [];
      for (const [text, lbl] of [[PASTE_P, 'có dấu câu'], [PASTE_U, 'không dấu câu'], [PASTE_P, 'có dấu câu, cache ấm']]) {
        const r = await pasteTest(b, tabs[0], text, lbl);
        out.paste.push(r);
        console.log(`  dán ${lbl}: đổi DOM→thấy log ${r.seenAfterMs}ms · TỔNG ${r.totalMs ?? '-'}ms · model ${r.modelMs ?? '-'}ms/${r.modelRuns ?? '-'} lượt · gạch dưới "cứ": ${r.underlinesCu} · gạch khác: ${r.otherUnderlines.length}${r.error ? ' · ' + r.error : ''}${r.timedOut ? ' · HẾT GIỜ' : ''}`);
      }
    }
  } finally {
    await close(b);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tự chấm theo quyết định 37. Thiếu mẫu thì KHÔNG ra kết luận (bẫy số 11).
// ---------------------------------------------------------------------------
function judge(rounds) {
  const on = rounds.filter((r) => r.on);
  const off = rounds.filter((r) => !r.on);
  const problems = [];

  const seqOn = on.flatMap((r) => r.sequential);
  const concOn = on.flatMap((r) => r.concurrent);
  const notReady = [...seqOn, ...concOn].filter((p) => p.loadMs === null);
  if (notReady.length) problems.push(`ĐỦ THỜI GIAN trượt: ${notReady.length} tab bật chưa san-sang (${notReady.map((p) => `${p.host}=${p.soatModel}`).join(', ')}) — nâng thời gian đứng cho mọi lượt, chạy lại`);
  const hidden = [...seqOn, ...off.flatMap((r) => r.sequential)].filter((p) => p.everHidden);
  if (hidden.length) problems.push(`${hidden.length} tab tuần tự rời tiền cảnh trong thời gian đứng: ${hidden.map((p) => p.host).join(', ')}`);
  const probeErr = rounds.flatMap((r) => [...r.sequential, ...r.concurrent]).filter((p) => p.probeErrors.length);
  if (probeErr.length) problems.push(`${probeErr.length} tab lỗi đầu dò: ${probeErr[0].probeErrors.join('; ')}`);
  const memErr = rounds.flatMap((r) => [r.s4, r.s4gc, r.s8, r.s8gc]).reduce((a, m) => a + m.nErrors, 0);
  if (memErr) problems.push(`${memErr} tiến trình không đọc được bộ nhớ`);
  if (on.length < 1 || off.length < 1) problems.push('thiếu lượt bật hoặc lượt tắt');

  const T = median(on.flatMap((r) => r.sequential.slice(1).map((p) => p.loadMs)));
  const T1 = on.map((r) => r.sequential[0].loadMs);
  const Tc = median(concOn.map((p) => p.loadMs));
  const L = median(seqOn.map((p) => p.longestTask));
  const Loff = median(off.flatMap((r) => r.sequential.map((p) => p.longestTask)));
  const tbt = median(seqOn.map((p) => p.blockingSum));
  const s4gcOff = off.map((r) => r.s4gc.rendererPrivate);
  const M = MB(median(on.map((r) => r.s4gc.rendererPrivate)) - median(s4gcOff)) / 4;
  const Mnogc = MB(median(on.map((r) => r.s4.rendererPrivate)) - median(off.map((r) => r.s4.rendererPrivate))) / 4;
  const M8 = MB(median(on.map((r) => r.s8gc.rendererPrivate)) - median(off.map((r) => r.s8gc.rendererPrivate))) / 8;
  const aa = off.length > 1 ? MB(Math.max(...s4gcOff) - Math.min(...s4gcOff)) / 4 : NaN;

  const lines = [];
  const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toString() : '—');
  lines.push(`T  nạp, tab tuần tự t2–t4 (trung vị ${on.length * 3} mẫu): ${f0(T)} ms`);
  lines.push(`L  long task dài nhất khi nạp (trung vị ${seqOn.length} mẫu): ${f0(L)} ms   [lượt tắt: ${f0(Loff)} ms]`);
  lines.push(`M  bộ nhớ thêm mỗi tab, sau GC: ${M.toFixed(1)} MB   [trước GC ${Mnogc.toFixed(1)} MB · 8 tab ${M8.toFixed(1)} MB]`);
  lines.push(`T₁ tab đầu sau khi mở Chrome: ${T1.map(f0).join(', ')} ms · T∥ 4 tab cùng lúc: ${f0(Tc)} ms · tổng đứng hình: ${f0(tbt)} ms`);
  lines.push(`A/A bộ nhớ (max − min S4 tắt sau GC) / 4: ${Number.isFinite(aa) ? aa.toFixed(1) : '—'} MB (cần ≤ 10)`);

  if (off.length > 1 && !(aa <= 10)) problems.push(`A/A bộ nhớ trượt: ${aa.toFixed(1)} MB/tab`);
  if (!(Loff <= 50)) problems.push(`trang thử bẩn: long task dài nhất ở lượt tắt ${f0(Loff)} ms > 50`);
  if (off.length < 3 || on.length < 3) problems.push(`chỉ có ${off.length} lượt tắt / ${on.length} lượt bật — quyết định 37 cần 3 / 3`);

  let verdict = null;
  if (!problems.length) {
    if (M <= 30 && L <= 100 && T <= 1500) verdict = 'GIỮ NGUYÊN';
    else if (M <= 100 && L <= 200 && T <= 2000) verdict = 'NẠP LƯỜI';
    else verdict = 'OFFSCREEN';
    for (const lim of [30, 100]) {
      if ((M <= lim) !== (Mnogc <= lim)) lines.push(`LƯU Ý: M trước và sau GC nằm hai phía ngưỡng ${lim} MB — người dùng thấy số trước GC`);
    }
  }
  return { T, T1, Tc, L, Loff, tbt, M, Mnogc, M8, aa, problems, verdict, lines };
}

// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(OPT.zip)) throw new Error(`không thấy gói ${OPT.zip} — chạy python ml/package_extension.py`);
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soat-ext-'));
  const unzip = spawnSync('python', ['-c', 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', OPT.zip, extDir], { encoding: 'utf8' });
  if (unzip.status !== 0) throw new Error(`giải nén hỏng: ${unzip.stderr}`);

  const srv = await startServer();
  SERVER_PORT = srv.address().port;
  const started = new Date().toISOString();
  const rounds = [];
  try {
    for (let i = 0; i < OPT.rounds * 2; i++) rounds.push(await round(i, i % 2 === 1, extDir));
  } finally {
    srv.close();
    fs.rmSync(extDir, { recursive: true, force: true });
  }

  const j = judge(rounds);
  console.log('');
  console.log('=== Quyết định 37 ===');
  for (const l of j.lines) console.log(l);
  if (j.problems.length) {
    console.log('KHÔNG KẾT LUẬN:');
    for (const p of j.problems) console.log(`  - ${p}`);
  } else {
    console.log(`Luật chọn: ${j.verdict}`);
  }

  if (OPT.out) {
    const machine = { cpus: os.cpus().length, cpu: os.cpus()[0]?.model, ramGB: +(os.totalmem() / 2 ** 30).toFixed(1) };
    fs.writeFileSync(OPT.out, JSON.stringify({ started, opt: OPT, machine, judge: j, rounds }, null, 1));
    console.log(`đã ghi ${OPT.out}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
