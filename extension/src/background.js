/**
 * Service worker — gom thống kê.
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
