/**
 * Điểm vào của content script.
 *
 * MV3 không cho khai báo content script là ES module, nên file này là script
 * cổ điển và nạp phần còn lại bằng import() động từ chrome.runtime.getURL.
 * Đổi lại ta không cần bước build nào — sửa file là chạy được ngay.
 *
 * Toàn bộ xử lý diễn ra trong trình duyệt: tầng luật ngay tại trang, tầng model trong
 * offscreen document của chính extension (quyết định 38). Không một ký tự nào rời khỏi
 * trình duyệt.
 */

(async () => {
  if (window.__soatLoaded) return;
  window.__soatLoaded = true;

  // -------------------------------------------------------------------------
  // CHẾ ĐỘ ĐO — TẮT MẶC ĐỊNH, và KHÔNG ĐỂ LẠI GÌ TRÊN TRANG.
  //
  // Bản trước ghi `data-soat-*` lên thẻ <html>: trang nào cũng đọc được, tức dò ra
  // được người dùng có cài Soát và thấy cả độ dài văn bản họ vừa gõ. Vì thế bản đó
  // phải gỡ trước khi nộp store — mà gỡ xong thì hết đo được trong Chrome thật.
  //
  // Giờ số đo đi ngược vào trong extension: content script gửi cho service worker,
  // service worker giữ trong `chrome.storage.session` (bộ nhớ, không ghi đĩa, trang
  // web không với tới). Không còn gì để gỡ trước khi nộp, và vẫn đo được.
  //
  // Bật:  chrome://extensions -> Soát -> "service worker" -> Console:
  //         chrome.storage.local.set({ soatDebug: true })
  //       rồi F5 trang cần đo.
  // Đọc:  cũng ở Console đó:
  //         chrome.storage.session.get('soatDo').then(x => console.log(x.soatDo))
  // Tắt:  chrome.storage.local.remove('soatDebug')
  // -------------------------------------------------------------------------
  let debug = false;
  const BUILD = 'do-5-trong-extension';

  const base = chrome.runtime.getURL('');
  const [engine, targets, hl, replacer, tip] = await Promise.all([
    import(base + 'src/engine/ruleEngine.js'),
    import(base + 'src/content/targets.js'),
    import(base + 'src/content/highlighter.js'),
    import(base + 'src/content/replace.js'),
    import(base + 'src/content/tooltip.js'),
  ]);

  // -------------------------------------------------------------------------
  // Kiểu gạch chân. Phải nằm ở stylesheet của TRANG, không phải shadow DOM,
  // vì ::highlight() tác động lên chính nội dung trang.
  // -------------------------------------------------------------------------

  const style = document.createElement('style');
  style.textContent = `
    ::highlight(soat-high) {
      text-decoration: underline wavy #d93025;
      text-decoration-skip-ink: none;
      text-underline-offset: 3px;
    }
    ::highlight(soat-low) {
      text-decoration: underline wavy #e8a33d;
      text-decoration-skip-ink: none;
      text-underline-offset: 3px;
    }
    [data-soat-overlay] .soat-u-high {
      border-bottom: 2px solid #d93025;
    }
    [data-soat-overlay] .soat-u-low {
      border-bottom: 2px solid #e8a33d;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

  // -------------------------------------------------------------------------
  // Trạng thái
  // -------------------------------------------------------------------------

  const DEBOUNCE_MS = 400;
  const sessions = new WeakMap();
  let enabled = true;
  let ignored = new Set();
  let active = null;      // ô đang focus
  let hovered = null;     // { issue, range, node } đang chỉ tới

  // Chrome VÔ HIỆU HOÁ context của content script cũ mỗi khi extension được cập
  // nhật hoặc tải lại, nhưng tab đang mở vẫn giữ bản cũ đang chạy. Từ lúc đó
  // MỌI lời gọi chrome.* trong tab ấy đều ném "Extension context invalidated".
  //
  // Đây không phải chuyện chỉ xảy ra lúc phát triển: người dùng thật gặp đúng
  // tình huống này ở mỗi lần extension tự cập nhật.
  let dead = false;

  let settings = {};
  try {
    settings = await chrome.storage.local.get(['enabled', 'ignored', 'disabledHosts', 'soatDebug']);
  } catch {
    // Context chết trước cả khi khởi tạo xong. Dừng hẳn và im lặng — tab này
    // giữ bản cũ, lần tải lại trang sẽ nhận bản mới.
    return;
  }
  enabled = settings.enabled !== false;
  // CHẾ ĐỘ ĐO: chỉ bật khi đặt cờ tay, và mọi số đo đi vào trong extension chứ không
  // ra trang. Lượt chấm nào xảy ra TRƯỚC khi đọc xong cờ thì không được ghi — chấp nhận
  // mất một dòng đầu, đổi lấy việc không phải giữ hàng đợi chờ cờ.
  debug = settings.soatDebug === true;
  ignored = new Set(settings.ignored || []);
  if ((settings.disabledHosts || []).includes(location.hostname)) enabled = false;

  // -------------------------------------------------------------------------
  // Thống kê — chỉ đếm, không bao giờ lưu nội dung người dùng gõ.
  //
  // Tỷ lệ chấp nhận gợi ý vừa là chỉ số sản phẩm vừa CHÍNH LÀ precision ngoài
  // đời thật của bộ luật. Một con số, hai mục đích.
  // -------------------------------------------------------------------------

  // sendMessage NÉM ĐỒNG BỘ khi context đã chết, nên `.catch()` không đỡ được —
  // và bump() nằm giữa run(), ngay trước đoạn gọi tầng model. Một lần ném ở đây
  // cắt đứt luôn phần model phía dưới: tầng luật vẫn vẽ (chạy trước), tầng model
  // im lặng biến mất. Nhìn y hệt như model hỏng, mà thật ra là dòng đếm thống kê
  // giết nó.
  //
  // Nguyên tắc: đếm thống kê KHÔNG BAO GIỜ được phép làm hỏng việc soát.
  function bump(field, tag) {
    if (dead) return;
    try {
      const p = chrome.runtime.sendMessage({ type: 'stat', field, tag });
      if (p && p.catch) p.catch(() => {});
    } catch (err) {
      dead = /context invalidated/i.test(err?.message || '');
    }
  }

  /** Gửi một dòng đo về service worker. Im lặng tuyệt đối khi cờ tắt. */
  function ghiDo(line) {
    if (!debug || dead) return;
    try {
      const p = chrome.runtime.sendMessage({ type: 'soat:do', line: `[${BUILD}] ${line}` });
      if (p && p.catch) p.catch(() => {});
    } catch { /* context chết — đo là việc phụ, không được làm hỏng việc soát */ }
  }

  // -------------------------------------------------------------------------
  // Tầng 3 KHÔNG nằm ở trang nữa (quyết định 38).
  //
  // Trước đây file này nạp onnxruntime + model 78MB ở MỌI trang, kể cả trang không
  // có ô nhập liệu nào: đo trong Chrome thật, mỗi tab thêm 279 MB (quyết định 37).
  // Giờ model sống trong MỘT offscreen document cho cả trình duyệt; trang chỉ gửi
  // văn bản của ô qua message nội bộ của extension và nhận lại đúng mảng Issue mà
  // OnnxEngine.check() trả. Không ký tự nào rời khỏi trình duyệt.
  //
  // Không import thứ gì của model ở đây — test/manifest.test.mjs canh chuyện đó.
  // -------------------------------------------------------------------------
  let warmed = false;
  function warmModel() {
    // Lần đầu một ô đủ điều kiện được focus: bảo service worker dựng offscreen và
    // bắt đầu nạp model ngay, để lúc người dùng dán xong thì model đã gần sẵn sàng.
    // Trang không ai gõ gì thì không bao giờ tới đây — không tốn MB nào.
    if (warmed || dead) return;
    warmed = true;
    try {
      const p = chrome.runtime.sendMessage({ type: 'soat:warm' });
      if (p && p.catch) p.catch(() => {});
    } catch (err) {
      dead = /context invalidated/i.test(err?.message || '');
    }
  }

  let elementIds = 0;
  async function modelCheck(s, text) {
    if (dead) return { ok: false, error: 'context chết' };
    try {
      const res = await chrome.runtime.sendMessage({ type: 'soat:check', key: s.id, seq: s.seq, text });
      return res || { ok: false, error: 'không có trả lời' };
    } catch (err) {
      // sendMessage ném đồng bộ khi context đã chết (extension vừa cập nhật) — tầng
      // luật vẫn chạy, tầng model im lặng cho tới khi trang được tải lại.
      if (/context invalidated/i.test(err?.message || '')) dead = true;
      return { ok: false, error: err?.message || String(err) };
    }
  }

  // -------------------------------------------------------------------------
  // Soát và vẽ
  // -------------------------------------------------------------------------

  function sessionFor(el) {
    let s = sessions.get(el);
    if (!s) {
      s = { id: ++elementIds, kind: targets.kindOf(el), issues: [], placed: [], map: null, timer: 0, seq: 0 };
      sessions.set(el, s);
    }
    return s;
  }

  function run(el) {
    if (!enabled || !targets.isEligible(el)) return;
    const s = sessionFor(el);
    const tRun = performance.now();
    // Lấy đợt input NGAY, kể cả khi lượt này thoát sớm (ô ngắn, model chưa nạp). Trước
    // đây chỉ timing.start() mới xoá đợt, nên bấm vào ô soạn bài rồi vài giây sau mới
    // dán thì "TỔNG từ input đầu" tính từ cú bấm (quyết định 37).
    const burst = timing.take(s);

    let text, map = null;
    if (s.kind === 'contenteditable') {
      map = hl.collectTextNodes(el);
      text = map.text;
    } else {
      text = el.value || '';
    }

    if (text.length < targets.MIN_LENGTH) {
      hl.clear(el, s.kind);
      s.issues = [];
      s.placed = [];
      return;
    }

    // Tầng luật chạy đồng bộ và vẽ ngay — người dùng thấy kết quả tức thì.
    const ruleIssues = engine.checkText(text, { ignored });
    s.issues = ruleIssues;
    s.map = map;
    s.placed = hl.paint(el, s.kind, ruleIssues, map);
    if (ruleIssues.length) bump('shown');

    // Tầng model chạy sau, gộp vào rồi vẽ lại. Luật thắng khi chồng lấn vì
    // độ tin cậy cao hơn — dedupe() lo việc đó.
    //
    // Văn bản đổi giữa chừng thì lượt cũ phải dừng, không đốt CPU cho một kết quả bỏ
    // đi. Offscreen làm việc đó: lượt mới của cùng ô (cùng s.id, seq lớn hơn) làm lượt
    // cũ dừng ở lần nhả luồng kế tiếp, hoặc không chạy nếu còn xếp hàng.
    const token = ++s.seq;
    const d = timing.start(burst, s, text, tRun);
    modelCheck(s, text).then((res) => {
      timing.remote(res);
      if (!res.ok) { timing.end(d, res.aborted ? 'BỎ — offscreen huỷ lượt cũ' : `LỖI ${res.error}`, 0); return; }
      const modelIssues = res.issues;
      if (token !== s.seq || !el.isConnected) { timing.end(d, 'BỎ — văn bản đã đổi', modelIssues.length); return; }
      if (modelIssues.length === 0) { timing.end(d, 'model không đề xuất gì', 0); return; }

      const merged = engine.dedupe([...ruleIssues, ...modelIssues])
        .filter((i) => !ignored.has(i.original.toLowerCase()));
      if (merged.length === ruleIssues.length) { timing.end(d, 'trùng tầng luật', modelIssues.length); return; }

      s.issues = merged;
      s.placed = hl.paint(el, s.kind, merged, map);
      bump('shown');
      timing.end(d, 'ĐÃ VẼ', modelIssues.length);
    }).catch((err) => { timing.end(d, `LỖI ${err?.message}`, 0); /* model hỏng thì im lặng, tầng luật vẫn còn */ });
  }

  function schedule(el) {
    const s = sessionFor(el);
    timing.input(s);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => run(el), DEBOUNCE_MS);
  }

  // -------------------------------------------------------------------------
  // ĐO — mỗi lượt chấm một dòng, gửi về service worker khi cờ soatDebug bật.
  // Khi cờ tắt thì khối này chỉ cộng vài con số trong bộ nhớ rồi vứt: không message,
  // không DOM, không console. Không phải gỡ gì trước khi nộp store.
  // -------------------------------------------------------------------------
  const timing = {
    inFlight: 0,
    input(s) {
      const now = performance.now();
      if (!s.burst) s.burst = { first: now, inputs: 0 };
      s.burst.inputs++;
      s.burst.last = now;
    },
    take(s) {
      const b = s.burst;
      s.burst = null;
      return b;
    },
    start(burst, s, text, tRun) {
      const b = burst || { first: tRun, last: tRun, inputs: 0 };
      this.inFlight++;
      return { b, tRun, tModel: performance.now(), len: text.length, overlap: this.inFlight - 1, seq: s.seq };
    },
    // Offscreen trả kèm số lượt model, câu trúng cache, mã phiên và thời gian nạp —
    // mã phiên đổi nghĩa là offscreen đã bị tạo lại và model nạp lại (quyết định 38).
    remote(res) {
      this.last = res;
    },
    end(d, outcome, n) {
      this.inFlight--;
      const now = performance.now();
      const f = (x) => `${Math.round(x)}ms`;
      const line = `#${d.seq} ${outcome} · ${d.len} ký tự · ${d.b.inputs} sự kiện input`
        + ` · input đầu→chấm ${f(d.tRun - d.b.first)} (input cuối→chấm ${f(d.tRun - d.b.last)})`
        + ` · tầng luật ${f(d.tModel - d.tRun)} · model ${f(now - d.tModel)}`
        + ` · ${this.last?.runs ?? 0} lượt model, ${this.last?.cacheHits ?? 0} câu trúng cache`
        + ` · ${n} đề xuất · TỔNG từ input đầu ${f(now - d.b.first)}`
        + (d.overlap ? ` · CHỒNG ${d.overlap} lượt đang chạy` : '');
      ghiDo(line + (this.last?.instance
        ? ` · offscreen ${this.last.instance} nạp ${this.last.loadMs ?? '?'}ms` : ''));
    },
  };

  // -------------------------------------------------------------------------
  // Tìm lỗi nằm dưới con trỏ chuột
  // -------------------------------------------------------------------------

  function hitTest(el, x, y) {
    const s = sessions.get(el);
    if (!s) return null;
    for (const placed of s.placed) {
      const rect = hl.rectOf(placed);
      if (!rect) continue;
      if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1) {
        return placed;
      }
    }
    return null;
  }

  function openTooltip(el, placed) {
    const rect = hl.rectOf(placed);
    if (!rect) return;
    hovered = placed;
    tip.show(rect, placed.issue, {
      onAccept: () => acceptFix(el, placed),
      onIgnore: () => ignoreWord(el, placed),
    });
  }

  function acceptFix(el, placed) {
    const s = sessionFor(el);
    replacer.applyFix(el, s.kind, placed.issue, placed.range);
    bump('accepted', placed.issue.tag);
    tip.hide();
    hovered = null;
    // Offset đã dịch sau khi thay chuỗi — soát lại toàn bộ thay vì tự chỉnh tay.
    setTimeout(() => run(el), 0);
  }

  async function ignoreWord(el, placed) {
    const word = placed.issue.original.toLowerCase();
    ignored.add(word);
    try {
      await chrome.storage.local.set({ ignored: [...ignored] });
    } catch {
      // Context chết: không lưu được thì thôi, nhưng vẫn phải bỏ qua từ này
      // trong phiên hiện tại chứ không được ném ra giữa chừng.
      dead = true;
    }
    bump('ignored', placed.issue.tag);
    tip.hide();
    hovered = null;
    run(el);
  }

  // -------------------------------------------------------------------------
  // Sự kiện
  // -------------------------------------------------------------------------

  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!targets.isEligible(el)) return;
    if (enabled) warmModel();
    active = el;
    watchEdits(el);
    schedule(el);
  }, true);

  // -------------------------------------------------------------------------
  // Không tin sự kiện `input` với trình soạn thảo tự quản DOM.
  //
  // Lexical — ô soạn bài của Facebook — chặn hành vi dán mặc định rồi tự chèn
  // nội dung, và khi hành vi mặc định bị chặn thì trình duyệt KHÔNG bắn `input`.
  // Đo trên playground.lexical.dev: dán 53 ký tự -> 0 sự kiện input, 1 đợt thay
  // đổi DOM. Hậu quả thấy được trên Facebook thật: dán đoạn văn vào thì không
  // soát gì cả, phải gõ thêm một phím mới có gạch chân — và chủ repo đã đọc nó
  // thành "model chậm" (quyết định 36).
  //
  // Nên quan sát chính DOM của ô đang focus. An toàn vì gạch chân trong
  // contenteditable dùng CSS Highlight API, không chèn node nào vào ô, và lớp phủ
  // của textarea nằm ngoài ô — việc vẽ của mình không tự kích hoạt lại chính nó.
  // textarea/input không sinh mutation khi đổi value; với chúng `input` vẫn bắn.
  // -------------------------------------------------------------------------
  let editObserver = null;
  let observed = null;
  function watchEdits(el) {
    if (observed === el) return;
    if (editObserver) editObserver.disconnect();
    observed = el;
    if (targets.kindOf(el) !== 'contenteditable') { editObserver = null; return; }
    // Chỉ phản ứng khi CHỮ đổi. Trang có thể dựng lại node mà nội dung y nguyên
    // (Facebook render lại khá thường) — đóng tooltip mỗi lần như thế là người
    // dùng đang rê chuột đọc đề xuất thì nó biến mất.
    let lastText = el.textContent;
    editObserver = new MutationObserver(() => {
      if (!el.isConnected || !targets.isEligible(el)) return;
      const now = el.textContent;
      if (now === lastText) return;
      lastText = now;
      tip.hide();
      hovered = null;
      schedule(el);
    });
    editObserver.observe(el, { characterData: true, childList: true, subtree: true });
  }

  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!sessions.has(el)) return;
    // Giữ gạch chân khi người dùng bấm vào chính tooltip.
    setTimeout(() => {
      if (document.activeElement !== el && !tip.isOpen()) {
        hl.clear(el, sessionFor(el).kind);
      }
    }, 150);
  }, true);

  document.addEventListener('input', (e) => {
    if (targets.isEligible(e.target)) {
      tip.hide();
      hovered = null;
      schedule(e.target);
    }
  }, true);

  let rafPending = false;
  document.addEventListener('mousemove', (e) => {
    if (!enabled || rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const el = active;
      if (!el || !el.isConnected) return;

      const placed = hitTest(el, e.clientX, e.clientY);
      if (placed) {
        if (hovered !== placed) openTooltip(el, placed);
      } else if (tip.isOpen() && !isOverTooltip(e.clientX, e.clientY)) {
        tip.hide();
        hovered = null;
      }
    });
  }, true);

  function isOverTooltip(x, y) {
    const el = document.elementFromPoint(x, y);
    return !!(el && el.closest && el.closest('[data-soat-overlay]'));
  }

  document.addEventListener('keydown', (e) => {
    if (!tip.isOpen()) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      tip.accept();
    } else if (e.key === 'Escape') {
      tip.hide();
      hovered = null;
    }
  }, true);

  // Cuộn hoặc đổi kích thước: lớp phủ mirror phải bám lại vị trí textarea.
  const repaint = () => {
    if (!active || !sessions.has(active)) return;
    const s = sessions.get(active);
    hl.reposition(active, s.kind, s.issues);
    if (tip.isOpen() && hovered) {
      const rect = hl.rectOf(hovered);
      if (rect) tip.show(rect, hovered.issue, {
        onAccept: () => acceptFix(active, hovered),
        onIgnore: () => ignoreWord(active, hovered),
      });
    }
  };
  window.addEventListener('scroll', repaint, true);
  window.addEventListener('resize', repaint, true);

  // Ứng dụng SPA thay ô nhập liệu liên tục — dọn session của node đã gỡ.
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.removedNodes) {
        if (node.nodeType === 1 && sessions.has(node)) hl.destroy(node);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Popup bật/tắt hoặc đổi cài đặt.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'toggle') {
      enabled = msg.enabled;
      if (!enabled && active) hl.clear(active, sessionFor(active).kind);
      else if (active) run(active);
    }
    if (msg.type === 'resetIgnored') ignored = new Set();
  });
})();
