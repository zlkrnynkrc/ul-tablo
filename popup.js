const $ = s => document.querySelector(s);
const seg = $('.mode');
const plist = $('.plist');

let allByMode = { li: [], ul: [], table: [] };
let mode = 'ul';
let inited = false;

// ---- content script'e mesaj gönder ----
async function ask(tabId, msg) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, msg, resp => {
      if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
      else resolve(resp || {});
    });
  });
}

async function ensureContent(tabId) {
  // content script yüklü mü?
  const ping = await ask(tabId, { type: 'ping' });
  if (ping && ping.ok) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (e) {
    return false;
  }
}

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ---- Veri toplama ----
function dataScore(list) {
  return list.reduce((s, t) => s + t.rows.length * t.keys.length, 0);
}

async function scanAll(tabId) {
  const modes = ['li', 'ul', 'table'];
  for (const m of modes) {
    const r = await ask(tabId, { type: 'scan', mode: m });
    allByMode[m] = (r && r.tables) || [];
  }
}

function pickInitialMode() {
  const modes = ['li', 'ul', 'table'];
  let best = 'ul', bestScore = -1;
  modes.forEach(m => {
    const sc = dataScore(allByMode[m]);
    if (sc > bestScore) { bestScore = sc; best = m; }
  });
  return best;
}

// ---- Render ----
function renderPick() {
  [...seg.children].forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  const list = allByMode[mode] || [];
  plist.innerHTML = '';
  if (!list.length) {
    plist.innerHTML = '<div class="empty">Bu tipte tablo bulunamadı.</div>';
    return;
  }
  list.forEach((t, i) => {
    const b = document.createElement('button');
    const name = document.createElement('span');
    name.textContent = t.name;
    const meta = document.createElement('small');
    meta.textContent = `${t.rows.length} satır · ${t.keys.length} sütun`;
    b.append(name, meta);
    b.onclick = async () => {
      const tab = await getTab();
      if (!tab) return;
      // sayfa üstünde viewer aç
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (tableData) => window.__tabloViewerShow && window.__tabloViewerShow(tableData),
        args: [t]
      }).catch(() => { });
      window.close(); // popup'ı kapat
    };
    plist.appendChild(b);
  });
}

// ---- Başlat ----
(async () => {
  const tab = await getTab();
  if (!tab || !tab.id || !/^https?:/.test(tab.url || '')) {
    plist.innerHTML = '<div class="err">Bu sayfada çalışmıyor.</div>';
    return;
  }
  const ok = await ensureContent(tab.id);
  if (!ok) { plist.innerHTML = '<div class="err">Content script yüklenemedi.</div>'; return; }
  await scanAll(tab.id);
  mode = pickInitialMode();
  inited = true;
  renderPick();
})();

seg.addEventListener('click', e => {
  const b = e.target.closest('button[data-mode]');
  if (!b) return;
  mode = b.dataset.mode;
  renderPick();
});