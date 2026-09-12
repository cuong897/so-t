/**
 * Popup — bản tổng kết tuần.
 *
 * Đây không phải phần trang trí: con số cá nhân ("tuần này bạn sai hỏi/ngã 23
 * lần") là thứ biến một tiện ích thành một thói quen, và là thứ người dùng
 * chụp màn hình đem khoe — tức là kênh lan truyền miễn phí.
 */

const TAG_LABEL = {
  'hoi-nga': 'Hỏi / ngã',
  'thieu-dau': 'Thiếu dấu',
  'sai-dau': 'Sai dấu',
  'ch-tr': 'ch / tr',
  's-x': 's / x',
  'd-gi-r': 'd / gi / r',
  'n-ng': 'Âm cuối n / ng',
  'tu-vung': 'Dùng sai từ',
  'chinh-ta': 'Chính tả',
};

function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const { stats = {}, enabled = true } = await chrome.storage.local.get(['stats', 'enabled']);
const week = stats[weekKey()] || { shown: 0, accepted: 0, ignored: 0, byTag: {} };

document.getElementById('shown').textContent = week.shown || 0;
document.getElementById('accepted').textContent = week.accepted || 0;

const entries = Object.entries(week.byTag || {}).sort((a, b) => b[1] - a[1]);
const box = document.getElementById('tags');

if (entries.length === 0) {
  document.getElementById('empty').hidden = false;
} else {
  const max = entries[0][1];
  box.innerHTML = entries.map(([tag, n]) => `
    <div class="tag"><span>${TAG_LABEL[tag] || tag}</span><span>${n}</span></div>
    <div class="bar" style="width:${Math.round((n / max) * 100)}%"></div>
  `).join('');
}

const toggle = document.getElementById('enabled');
toggle.checked = enabled !== false;
toggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ enabled: toggle.checked });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'toggle', enabled: toggle.checked }).catch(() => {});
  }
});
