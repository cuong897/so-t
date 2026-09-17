/**
 * Service worker — gom thống kê, và dẫn lượt chấm của content script tới offscreen.
 *
 * Nguyên tắc bất di bất dịch: CHỈ ĐẾM, KHÔNG BAO GIỜ LƯU NỘI DUNG.
 * Không câu văn, không tên miền, không thời điểm chính xác. Chỉ có số đếm
 * theo nhóm lỗi và theo tuần. Nếu sau này gắn analytics từ xa thì đây là nơi
 * duy nhất được phép gửi đi, và cũng chỉ gửi đúng những con số này.
 *
 * Tỷ lệ accepted / shown chính là precision ngoài đời thật của bộ luật —
 * vừa là chỉ số sản phẩm, vừa là chỉ số ML.
 */

const EMPTY = { shown: 0, accepted: 0, ignored: 0, byTag: {} };

/** Khoá tuần dạng 2026-W37, để popup vẽ được "tuần này" và so với tuần trước. */
function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Giữ 8 tuần gần nhất, xoá phần cũ hơn để storage không phình vô hạn. */
function prune(stats) {
  const keys = Object.keys(stats).sort();
  while (keys.length > 8) delete stats[keys.shift()];
  return stats;
}

// ---------------------------------------------------------------------------
// Model — một offscreen document cho cả trình duyệt (quyết định 38).
//
// Content script KHÔNG nói thẳng với offscreen. runtime.sendMessage phát tới mọi
// ngữ cảnh extension cùng lúc; nếu offscreen chưa tồn tại lúc tin được phát, nó không
// bao giờ nhận được tin đó, và không ai trả lời — content script đợi mãi, tầng model
// im lặng biến mất. Đi qua đây thì tin luôn có người nhận: service worker thức dậy vì
// nó, đảm bảo offscreen đã có, rồi mới chuyển tiếp.
// ---------------------------------------------------------------------------

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
let creating = null;

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [url],
  });
  if (existing.length) return;
  // Hai tab focus cùng lúc thì hai lời gọi tới đây gần như cùng lúc — tạo hai lần là
  // Chrome ném "Only a single offscreen document may be created".
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['WORKERS'],
      justification: 'Runs the Vietnamese spell-check model in a Web Worker, entirely on-device, shared by all tabs instead of loaded in each one.',
    }).finally(() => { creating = null; });
  }
  await creating;
}

async function forwardCheck(msg, sender) {
  await ensureOffscreen();
  const payload = {
    type: 'soat:offscreen:check',
    // Khoá huỷ lượt cũ phải riêng cho từng ô của từng tab: seq là bộ đếm của một ô.
    key: `${sender.tab?.id ?? '-'}:${sender.frameId ?? 0}:${msg.key}`,
    seq: msg.seq,
    text: msg.text,
  };
  // Offscreen vừa tạo có thể chưa kịp gắn listener. Thử lại vài lần rồi mới chịu.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await chrome.runtime.sendMessage(payload);
      if (res !== undefined) return res;
      throw new Error('offscreen không trả lời');
    } catch (err) {
      if (attempt >= 20) return { ok: false, error: err?.message || String(err) };
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'soat:warm') {
    ensureOffscreen().then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg?.type === 'soat:check') {
    forwardCheck(msg, sender).then(sendResponse);
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'stat') return false;

  (async () => {
    const { stats = {} } = await chrome.storage.local.get('stats');
    const wk = weekKey();
    const bucket = stats[wk] || { ...EMPTY, byTag: {} };

    bucket[msg.field] = (bucket[msg.field] || 0) + 1;
    if (msg.tag) bucket.byTag[msg.tag] = (bucket.byTag[msg.tag] || 0) + 1;

    stats[wk] = bucket;
    await chrome.storage.local.set({ stats: prune(stats) });
    sendResponse({ ok: true });
  })();

  return true; // giữ kênh mở cho phản hồi bất đồng bộ
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({ enabled: true, ignored: [], disabledHosts: [] });
  }
});

export { weekKey };
