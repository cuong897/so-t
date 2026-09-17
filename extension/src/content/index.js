/**
 * Điểm vào của content script.
 *
 * MV3 không cho khai báo content script là ES module, nên file này là script
 * cổ điển và nạp phần còn lại bằng import() động từ chrome.runtime.getURL.
 * Đổi lại ta không cần bước build nào — sửa file là chạy được ngay.
 *
 * Toàn bộ xử lý diễn ra tại chỗ. Không một ký tự nào được gửi đi đâu.
 */

(async () => {
  if (window.__soatLoaded) return;
  window.__soatLoaded = true;

  // -------------------------------------------------------------------------
  // CHẾ ĐỘ ĐO — TẮT MẶC ĐỊNH. Chỉ bật khi chrome.storage.local có soatDebug: true.
  //
  // Nó ghi data-soat-* lên thẻ <html> của trang: trang nào cũng đọc được, tức
  // phát hiện được người dùng cài Soát và thấy độ dài văn bản họ gõ. Trái lời
  // hứa riêng tư — nên KHÔNG BAO GIỜ được bật cho người dùng thật, và phải gỡ
  // hẳn trước khi nộp store. Giữ lại vì đây là công cụ duy nhất đo được thời
  // gian thật trong Chrome thật: Console của content script bị lọc theo ngữ
  // cảnh (đã mất một lượt thử vì thế), còn DOM thì mọi ngữ cảnh đều đọc được.
  //
  // Bật: chrome://extensions -> Soát -> "service worker" -> Console:
  //        chrome.storage.local.set({ soatDebug: true })
  //      rồi F5 trang cần đo. Đọc: Console của trang, ngữ cảnh top:
  //        ({ ...document.documentElement.dataset })
  // -------------------------------------------------------------------------
  let debug = false;
  let debugKnown = false;     // đã đọc xong cờ từ storage chưa
  const pendingMarks = [];
  const mark = (k, v) => {
    if (!debug) { if (!debugKnown) pendingMarks.push([k, v]); return; }
    try { document.documentElement.dataset[k] = v; } catch {}
  };
  mark('soatBuild', 'do-3');
  mark('soatModel', 'dang-nap');

  const base = chrome.runtime.getURL('');
  const [engine, targets, hl, replacer, tip, onnx] = await Promise.all([
    import(base + 'src/engine/ruleEngine.js'),
    import(base + 'src/content/targets.js'),
    import(base + 'src/content/highlighter.js'),
    import(base + 'src/content/replace.js'),
    import(base + 'src/content/tooltip.js'),
    import(base + 'src/engine/onnxEngine.js'),
  ]);

  // Tầng 3. Nạp nền, không chặn gì cả: nếu chưa có file model thì load()
  // thất bại êm và check() trả mảng rỗng — tầng luật vẫn chạy bình thường.
  const model = new onnx.OnnxEngine();
  const modelReady = model.load({
    // Bản wasm-only (73KB js + 14MB wasm). Bỏ qua bản WebGPU vì nó cần
    // .jsep.wasm nặng 27MB — gấp đôi dung lượng để đổi lấy tốc độ mà phần
    // lớn máy người dùng không tận dụng được.
    ort: base + 'vendor/ort.wasm.bundle.min.mjs',
    wasmDir: base + 'vendor/',
    model: base + 'models/soat.int8.onnx',
    tokenizer: base + 'models/tokenizer.json',
    lexicon: base + 'models/lexicon.json',
    meta: base + 'models/soat.meta.json',
  });

  // Nạp model mất vài giây (78MB + 14MB wasm). Người dùng thường gõ xong
  // TRƯỚC khi nó sẵn sàng, và lần soát cuối cùng đã thoát sớm ở `!model.ready`.
  // Không soát lại ở đây thì tầng model im lặng biến mất cho tới khi người
  // dùng gõ thêm một ký tự nữa — không lỗi, không crash, chỉ là mất tầng đắt
  // nhất. Bắt được đúng cách: thử trên Facebook thật bằng một câu mà tầng luật
  // cố ý không bắt.
  const tLoad0 = performance.now();   // ĐO TẠM THỜI
  modelReady.then((ok) => {
    mark('soatModel', `${ok ? 'san-sang' : 'LOI'} sau ${Math.round(performance.now() - tLoad0)}ms`);
    if (ok && active && active.isConnected) run(active);
  });

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
  // CHẾ ĐỘ ĐO: chỉ bật khi đặt cờ tay. Dấu ghi trước lúc đọc được settings thì
  // xả ra bây giờ; không bật thì vứt, không để lại gì trên trang.
  debug = settings.soatDebug === true;
  debugKnown = true;
  if (debug) for (const [k, v] of pendingMarks.splice(0)) mark(k, v);
  else pendingMarks.length = 0;
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

  // -------------------------------------------------------------------------
  // Soát và vẽ
  // -------------------------------------------------------------------------

  function sessionFor(el) {
    let s = sessions.get(el);
    if (!s) {
      s = { kind: targets.kindOf(el), issues: [], placed: [], map: null, timer: 0, seq: 0 };
      sessions.set(el, s);
    }
    return s;
  }

  function run(el) {
    if (!enabled || !targets.isEligible(el)) return;
    const s = sessionFor(el);
    const tRun = performance.now();   // ĐO TẠM THỜI
    // ĐO TẠM THỜI — lấy đợt input NGAY, kể cả khi lượt này thoát sớm (ô ngắn, model
    // chưa nạp). Trước đây chỉ timing.start() mới xoá đợt, nên bấm vào ô soạn bài rồi
    // vài giây sau mới dán thì "TỔNG từ input đầu" tính từ cú bấm (quyết định 37).
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

    if (!model.ready) return;

    // Tầng model chạy sau, gộp vào rồi vẽ lại. Luật thắng khi chồng lấn vì
    // độ tin cậy cao hơn — dedupe() lo việc đó.
    const token = ++s.seq;
    // Văn bản đổi giữa chừng thì check() dừng ở lượt kế tiếp. Trước đây phép
    // so `token` chỉ nằm ở dưới, tức lượt cũ vẫn đốt hết CPU rồi mới bị vứt —
    // với bài dài chấm theo câu, đó là cả giây giữ luồng cho một kết quả bỏ đi.
    const signal = { get aborted() { return token !== s.seq || !el.isConnected; } };
    // --- ĐO TẠM THỜI, GỠ TRƯỚC KHI NỘP STORE ----------------------------------
    const d = timing.start(burst, s, text, tRun);
    // ---------------------------------------------------------------------------
    model.check(text, { signal }).then((modelIssues) => {
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
  // ĐO TẠM THỜI — chủ repo thấy đề xuất của model "mất một lúc mới hiện" trên
  // Facebook, kể cả khi model đã nạp xong, trong khi localhost chấm cùng đoạn
  // mất ~300ms. Mỗi lượt model in MỘT dòng vào Console của trang, lọc "soát:đo".
  // GỠ TOÀN BỘ khối này và các dòng timing.* trước khi nộp store.
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
      return { b, tRun, tModel: performance.now(), len: text.length, runs0: model.stats.runs,
        hits0: model.stats.cacheHits, overlap: this.inFlight - 1, seq: s.seq };
    },
    end(d, outcome, n) {
      this.inFlight--;
      const now = performance.now();
      const f = (x) => `${Math.round(x)}ms`;
      const line = `#${d.seq} ${outcome} · ${d.len} ký tự · ${d.b.inputs} sự kiện input`
        + ` · input đầu→chấm ${f(d.tRun - d.b.first)} (input cuối→chấm ${f(d.tRun - d.b.last)})`
        + ` · tầng luật ${f(d.tModel - d.tRun)} · model ${f(now - d.tModel)}`
        + ` · ${model.stats.runs - d.runs0} lượt model, ${model.stats.cacheHits - d.hits0} câu trúng cache`
        + ` · ${n} đề xuất · TỔNG từ input đầu ${f(now - d.b.first)}`
        + (d.overlap ? ` · CHỒNG ${d.overlap} lượt đang chạy` : '');
      if (!debug) return;
      console.info(`[soát:đo] ${line}`);
      // 8 dòng gần nhất, nối bằng " || " — đọc bằng dataset.soatLog từ ngữ cảnh top
      this.log = [...(this.log || []), line].slice(-8);
      mark('soatLog', this.log.join(' || '));
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
