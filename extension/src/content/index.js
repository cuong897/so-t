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

  const settings = await chrome.storage.local.get(['enabled', 'ignored', 'disabledHosts']);
  enabled = settings.enabled !== false;
  ignored = new Set(settings.ignored || []);
  if ((settings.disabledHosts || []).includes(location.hostname)) enabled = false;

  // -------------------------------------------------------------------------
  // Thống kê — chỉ đếm, không bao giờ lưu nội dung người dùng gõ.
  //
  // Tỷ lệ chấp nhận gợi ý vừa là chỉ số sản phẩm vừa CHÍNH LÀ precision ngoài
  // đời thật của bộ luật. Một con số, hai mục đích.
  // -------------------------------------------------------------------------

  function bump(field, tag) {
    chrome.runtime.sendMessage({ type: 'stat', field, tag }).catch(() => {});
  }

  // -------------------------------------------------------------------------
  // Soát và vẽ
  // -------------------------------------------------------------------------

  function sessionFor(el) {
    let s = sessions.get(el);
    if (!s) {
      s = { kind: targets.kindOf(el), issues: [], placed: [], map: null, timer: 0 };
      sessions.set(el, s);
    }
    return s;
  }

  function run(el) {
    if (!enabled || !targets.isEligible(el)) return;
    const s = sessionFor(el);

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

    const issues = engine.checkText(text, { ignored });
    s.issues = issues;
    s.map = map;
    s.placed = hl.paint(el, s.kind, issues, map);

    if (issues.length) bump('shown');
  }

  function schedule(el) {
    const s = sessionFor(el);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => run(el), DEBOUNCE_MS);
  }

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
    await chrome.storage.local.set({ ignored: [...ignored] });
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
    schedule(el);
  }, true);

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
