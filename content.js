(() => {

  function liLooksLikeRow(li) {
    // li içinde en az 2 yapısal çocuk varsa satır gibi davran
    const kids = textKids(li);
    return kids.filter(isStructural).length >= 2;
  }
  function linkLabel(text, href) {
    const t = (text || '').trim();
    if (t) return t;
    if (!href) return '';
    try {
      const u = new URL(href, location.href);
      // path'in son parçası
      let last = u.pathname.replace(/\/+$/, '').split('/').pop() || '';
      // query/hash zaten pathname'de yok
      if (!last) last = u.hostname; // kök URL ise hostname
      return decodeURIComponent(last) || href;
    } catch {
      // URL parse edilemezse kaba kesim
      let s = href.split('#')[0].split('?')[0].replace(/\/+$/, '');
      const i = s.lastIndexOf('/');
      return decodeURIComponent(i >= 0 ? s.slice(i + 1) : s) || href;
    }
  }
  // Tek bir ul'yi "satır grubu" olarak değil, "satırlar listesi" olarak işle
  // Her li bir satır; li içindeki yapısal çocuklar sütun olur.
  // Eğer li'ler düz metinse, tek sütunlu tablo olur.
  function parseSingleUlAsRows(ul) {
    const keys = [];
    const rows = [];
    const lis = liOf(ul);
    // li'lerin satır mı sütun mu olduğunu anla
    const rowLike = lis.filter(liLooksLikeRow).length >= lis.length * 0.5;

    if (rowLike) {
      // Her li = satır, içindeki yapısal çocuklar sütun
      lis.forEach(li => {
        const cells = {};
        const seen = {};
        const usedAnchors = new Set();
        const add = (base, text, linkEl) => {
          seen[base] = (seen[base] || 0) + 1;
          const key = seen[base] > 1 ? `${base} (${seen[base]})` : base;
          let href = '';
          const a = linkEl && (linkEl.matches('a[href]') ? linkEl : linkEl.closest('a[href]'));
          if (a && li.contains(a) && !usedAnchors.has(a)) { usedAnchors.add(a); href = a.href; }
          cells[key] = { text, href };
          if (!keys.includes(key)) keys.push(key);
        };
        const name = el => el.classList[0] || el.tagName.toLowerCase();
        (function collect(el) {
          const lt = looseText(el);
          if (lt) add('metin', lt, null);
          textKids(el).forEach(k => {
            if (isContainer(k)) collect(k);
            else add(name(k), clean(textOf(k)), k);
          });
        })(li);
        if (Object.keys(cells).length) rows.push(cells);
      });
    } else {
      // li'ler düz metin → tek sütun
      lis.forEach(li => {
        const t = clean(textOf(li));
        if (!t) return;
        const a = li.querySelector('a[href]');
        rows.push({ 'metin': { text: t, href: a ? a.href : '' } });
      });
      if (rows.length) keys.push('metin');
    }
    return { keys, rows };
  }

  /* ================= Şablon 2: ardışık ul'ler — her ul bir satır, li sütun ================= */
  const sig = el => el.tagName + '|' + el.className;
  function runOf(el) {
    const parent = el.parentElement;
    const out = [el];
    let p = prevMeaningful(el);
    while (p && p.parentElement === parent && sig(p) === sig(el)) { out.unshift(p); p = prevMeaningful(p); }
    let n = nextMeaningful(el);
    while (n && n.parentElement === parent && sig(n) === sig(el)) { out.push(n); n = nextMeaningful(n); }
    return out;
  }

  function qualifies(g, mode) {
    if (mode === 'li') return false;
    // mode === 'ul' veya 'auto'
    if (g.length >= 2) {
      // Ardışık ul grubu → her ul = satır
      // auto'da ek kontrol: li sayıları tutarlı mı?
      if (mode === 'ul') return true;
      if (g.length < 3) return false;
      const freq = {};
      g.forEach(u => { const c = liOf(u).length; freq[c] = (freq[c] || 0) + 1; });
      const [mc, mf] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
      return +mc >= 2 && +mc <= 15 && mf >= g.length * 0.7 && g.length >= +mc;
    }
    return false;
  }

  function parseRowGroup(g) {
    const lists = g.map(liOf);
    const n = Math.max(...lists.map(l => l.length));
    const names = [];
    for (let i = 0; i < n; i++) {
      const cls = lists.filter(l => l[i]).map(l => l[i].classList[0] || '');
      names.push(cls[0] && cls.every(c => c === cls[0]) ? cls[0] : `Sütun ${i + 1}`);
    }
    const keys = uniq(names);
    const rows = lists.map(l => {
      const o = {};
      keys.forEach((k, i) => {
        const li = l[i];
        if (!li) { o[k] = EMPTY(); return; }
        const a = li.querySelector('a[href]');
        o[k] = { text: clean(textOf(li)), href: a ? a.href : '' };
      });
      return o;
    }).filter(o => keys.some(k => o[k].text));
    return { keys, rows };
  }
  const HOST_ID = 'ul-tablo-gosterici-host';
  const old = document.getElementById(HOST_ID);
  if (old) { old.remove(); return; } // tekrar basınca kapanır

  /* ================= Yardımcılar ================= */
  const SKIP = new Set(['IMG', 'PICTURE', 'SVG', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'VIDEO', 'CANVAS', 'IFRAME', 'UL', 'OL', 'SOURCE', 'INPUT']);
  const BLOCK = /^(DIV|P|H[1-6]|SECTION|ARTICLE|HEADER|FOOTER|FIGCAPTION|DL|DT|DD|LI|FORM|TABLE|TR|TD|TH|CAPTION|BR)$/;
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const EMPTY = () => ({ text: '', href: '' });

  // İç etiketleri atıp yalnızca metni toplar (resim, yorum, script yok sayılır)
  function textOf(node, lists = false) {
    let out = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += n.textContent; return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toUpperCase();
      if (SKIP.has(tag) && !(lists && (tag === 'UL' || tag === 'OL'))) return;
      const b = BLOCK.test(tag);
      out += (b ? ' ' : '') + textOf(n, lists) + (b ? ' ' : '');
    });
    return out;
  }
  const looseText = el => clean([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' '));
  const textKids = el => [...el.children].filter(k => !SKIP.has(k.tagName.toUpperCase()) && clean(textOf(k)));
  const isStructural = el => BLOCK.test(el.tagName) || el.classList.length > 0;
  const uniq = names => { const s = {}; return names.map(n => { s[n] = (s[n] || 0) + 1; return s[n] > 1 ? `${n} (${s[n]})` : n; }); };
  const liOf = ul => [...ul.children].filter(e => e.tagName === 'LI');

  function isContainer(el) {
    const kids = textKids(el);
    if (kids.length === 1 && !looseText(el)) return isContainer(kids[0]);
    return kids.filter(isStructural).length >= 2;
  }

  /* ================= Şablon 1: ul/ol — her li bir satır ================= */
  function parseUl(ul) {
    const keys = [];
    const rows = [];
    liOf(ul).forEach(li => {
      const cells = {};
      const seen = {};
      const usedAnchors = new Set();
      const add = (base, text, linkEl) => {
        seen[base] = (seen[base] || 0) + 1;
        const key = seen[base] > 1 ? `${base} (${seen[base]})` : base;
        let href = '';
        const a = linkEl && (linkEl.matches('a[href]') ? linkEl : linkEl.closest('a[href]'));
        if (a && li.contains(a) && !usedAnchors.has(a)) { usedAnchors.add(a); href = a.href; }
        cells[key] = { text, href };
        if (!keys.includes(key)) keys.push(key);
      };
      const name = el => el.classList[0] || el.tagName.toLowerCase();
      (function collect(el) {
        const lt = looseText(el);
        if (lt) add('metin', lt, null);
        textKids(el).forEach(k => {
          if (isContainer(k)) collect(k);
          else add(name(k), clean(textOf(k)), k);
        });
      })(li);
      if (Object.keys(cells).length) rows.push(cells);
    });
    return { keys, rows };
  }

  /* ================= Şablon 2: ardışık ul'ler — her ul bir satır, li sütun ================= */
  const SKIP_SIBLING = new Set(['SCRIPT', 'STYLE', 'BR', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META']);

  // Görünmez/önemsiz kardeşleri atlayarak aynı imzaya sahip kardeşleri bul
  function prevMeaningful(el) {
    let p = el.previousElementSibling;
    while (p && SKIP_SIBLING.has(p.tagName.toUpperCase())) p = p.previousElementSibling;
    return p;
  }
  function nextMeaningful(el) {
    let n = el.nextElementSibling;
    while (n && SKIP_SIBLING.has(n.tagName.toUpperCase())) n = n.nextElementSibling;
    return n;
  }


  function runOf(el) {
    const out = [el];
    let p = prevMeaningful(el);
    while (p && sig(p) === sig(el)) { out.unshift(p); p = prevMeaningful(p); }
    let n = nextMeaningful(el);
    while (n && sig(n) === sig(el)) { out.push(n); n = nextMeaningful(n); }
    return out;
  }
  function qualifies(g, mode) {
    if (mode === 'li') return false;
    if (mode === 'ul') return g.length >= 2;
    if (g.length < 3) return false;
    const freq = {};
    g.forEach(u => { const c = liOf(u).length; freq[c] = (freq[c] || 0) + 1; });
    const [mc, mf] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    // satır sayısı sütun sayısından az değilse ve ul'lerin çoğu aynı li sayısındaysa
    return +mc >= 2 && +mc <= 15 && mf >= g.length * 0.7 && g.length >= +mc;
  }
  function parseRowGroup(g) {
    const lists = g.map(liOf);
    const n = Math.max(...lists.map(l => l.length));
    const names = [];
    for (let i = 0; i < n; i++) {
      const cls = lists.filter(l => l[i]).map(l => l[i].classList[0] || '');
      names.push(cls[0] && cls.every(c => c === cls[0]) ? cls[0] : `Sütun ${i + 1}`);
    }
    const keys = uniq(names);
    const rows = lists.map(l => {
      const o = {};
      keys.forEach((k, i) => {
        const li = l[i];
        if (!li) { o[k] = EMPTY(); return; }
        const a = li.querySelector('a[href]');
        o[k] = { text: clean(textOf(li)), href: a ? a.href : '' };
      });
      return o;
    }).filter(o => keys.some(k => o[k].text));
    return { keys, rows };
  }

  /* ================= Şablon 3: gerçek <table> ================= */
  function parseTable(tb) {
    const toCells = tr => {
      const out = [];
      [...tr.cells].forEach(c => {
        const a = c.querySelector('a[href]');
        out.push({ text: clean(textOf(c, true)), href: a ? a.href : '' });
        for (let i = 1; i < Math.min(c.colSpan || 1, 20); i++) out.push(EMPTY());
      });
      return out;
    };
    let trs = [...tb.rows];
    let header = null;
    if (tb.tHead && tb.tHead.rows.length) {
      header = toCells(tb.tHead.rows[tb.tHead.rows.length - 1]);
      const hs = new Set([...tb.tHead.rows]);
      trs = trs.filter(r => !hs.has(r));
    } else if (trs.length && trs[0].cells.length && [...trs[0].cells].every(c => c.tagName === 'TH')) {
      header = toCells(trs[0]);
      trs = trs.slice(1);
    }
    const grid = trs.map(toCells).filter(r => r.some(c => c.text));
    const n = Math.max(header ? header.length : 0, 0, ...grid.map(r => r.length));
    const keys = uniq(Array.from({ length: n }, (_, i) => (header && header[i] && header[i].text.slice(0, 40)) || `Sütun ${i + 1}`));
    const rows = grid.map(r => { const o = {}; keys.forEach((k, i) => { o[k] = r[i] || EMPTY(); }); return o; });
    return { keys, rows };
  }

  /* ================= Sayfayı tarayıp tabloları kur ================= */
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  function findTitle(el) {
    let last = null;
    for (const h of headings) {
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) last = h; else break;
    }
    return last ? clean(last.textContent).slice(0, 50) : '';
  }

  function build(mode) {
    const out = [];
    const used = new Set();
    const add = (name, kind, p) => {
      if (p.rows.length < 2 || !p.keys.length) return;
      out.push({ name: `${out.length + 1}. ${name || '(adsız)'}`, kind, keys: p.keys, rows: p.rows, hidden: new Set(), sortKey: null, sortDir: 1 });
    };

    // TABLE
    if (mode === 'table' || mode === 'auto') {
      document.querySelectorAll('table').forEach(el => {
        if (el.querySelector('table')) return;
        const cap = el.caption ? clean(el.caption.textContent) : '';
        add(el.getAttribute('aria-label') || cap || findTitle(el) || el.id || 'table', 'table', parseTable(el));
      });
      if (mode === 'table') return out;
    }

    // UL grupları
    if (mode !== 'li') {
      // Önce ardışık ul gruplarını topla
      const ulGroups = [];
      document.querySelectorAll('ul,ol').forEach(el => {
        if (used.has(el)) return;
        const g = runOf(el);
        if (g.length >= 2) {
          g.forEach(u => used.add(u));
          ulGroups.push(g);
        }
      });

      ulGroups.forEach(g => {
        add(findTitle(g[0]) || g[0].id || 'ul grubu', `${g.length} ul = satır`, parseRowGroup(g));
      });

      // Kalan tek ul'ler
      document.querySelectorAll('ul,ol').forEach(el => {
        if (used.has(el)) return;
        const p = parseSingleUlAsRows(el);
        if (p.rows.length >= 2) {
          const f = p.rows[0] && p.rows[0][p.keys.find(k => p.rows[0][k])];
          add(el.getAttribute('aria-label') || findTitle(el) || el.id || (f ? f.text.slice(0, 30) : ''), 'li = satır', p);
        }
      });
      return out;
    }

    // mode === 'li' → her li = satır
    document.querySelectorAll('ul,ol').forEach(el => {
      if (used.has(el)) return;
      const p = parseUl(el);
      const f = p.rows[0] && p.rows[0][p.keys.find(k => p.rows[0][k])];
      add(el.getAttribute('aria-label') || findTitle(el) || el.id || (f ? f.text.slice(0, 30) : ''), 'li = satır', p);
    });

    return out;
  }
  /* ================= Sıralama ================= */
  function parseNum(s) {
    const m = s.match(/^[^\p{L}\d+\-]*([+\-]?\d[\d.,]*)/u);
    if (!m) return null;
    let n = m[1];
    const c = n.lastIndexOf(','), d = n.lastIndexOf('.');
    if (c > -1 && d > -1) n = c > d ? n.replace(/\./g, '').replace(',', '.') : n.replace(/,/g, '');
    else if (c > -1) n = /^\d{1,3}(,\d{3})+$/.test(n) ? n.replace(/,/g, '') : n.replace(',', '.');
    else if (d > -1) n = /^\d{1,3}(\.\d{3})+$/.test(n) ? n.replace(/\./g, '') : n;
    const v = parseFloat(n);
    return isNaN(v) ? null : v;
  }
  function sortRows(data, idx, dir) {
    const items = data.map(r => ({ r, t: r[idx].text, v: parseNum(r[idx].text) }));
    const filled = items.filter(i => i.t).length;
    const numeric = filled > 0 && items.filter(i => i.v !== null).length >= filled * 0.8;
    items.sort((a, b) => {
      if (!a.t && !b.t) return 0;
      if (!a.t) return 1;
      if (!b.t) return -1;
      if (numeric && a.v !== null && b.v !== null) return (a.v - b.v) * dir;
      return a.t.localeCompare(b.t, 'tr', { numeric: true, sensitivity: 'base' }) * dir;
    });
    return items.map(i => i.r);
  }
  /* ================= Popup ile iletişim ================= */
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'ping') { sendResponse({ ok: true }); return; }
    if (msg.type === 'scan') {
      try {
        const tables = build(msg.mode);
        sendResponse({ tables });
      } catch (e) {
        sendResponse({ tables: [], error: String(e) });
      }
    }
  });

  /* ================= Viewer (sayfa üstünde tablo) ================= */
  window.__tabloViewerShow = function (t) {
    const VIEW_ID = 'ul-tablo-viewer';
    const old = document.getElementById(VIEW_ID);
    if (old) old.remove();

    const host = document.createElement('div');
    host.id = VIEW_ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647';
    const r = host.attachShadow({ mode: 'open' });
    r.innerHTML = `
    <style>
      :host{--bg:#fff;--fg:#111827;--mut:#6b7280;--bd:#e5e7eb;--hd:#f3f4f6;--ac:#2563eb;--hv:#eff6ff}
      @media (prefers-color-scheme:dark){:host{--bg:#1f2937;--fg:#f3f4f6;--mut:#9ca3af;--bd:#374151;--hd:#111827;--ac:#60a5fa;--hv:#1e3a5f}}
      *{box-sizing:border-box;font-family:system-ui,sans-serif}
      .back{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center}
      .panel{width:100vw);height:100vh;background:var(--bg);color:var(--fg);border-radius:5px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.4),max-width:none,max-height:none}
      .top{display:flex;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--bd);flex-wrap:wrap}
      .top h1{font-size:14px;margin:0;flex:1;min-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .top input[type=search]{padding:6px 10px;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px;width:150px}
      .top .x{border:0;background:none;color:var(--fg);font-size:20px;cursor:pointer;padding:0 4px}
      .main{flex:1;overflow:auto;min-width:0}
      table{border-collapse:collapse;width:100%;font-size:12.5px}
      th{position:sticky;top:0;background:var(--hd);text-align:left;padding:7px 8px;border-bottom:2px solid var(--bd);cursor:pointer;user-select:none;overflow-wrap:anywhere}
      th:hover{color:var(--ac)}
      th.n,td.n{width:1%;white-space:nowrap;color:var(--mut)}
      td{padding:6px 8px;border-bottom:1px solid var(--bd);vertical-align:top}
      tr:hover td{background:var(--hv)}
      .c{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;cursor:pointer}
      .c.open{display:block;overflow:visible}
      .c a{color:var(--ac);text-decoration:none}
      .c a:hover{text-decoration:underline}
      .empty{padding:24px;text-align:center;color:var(--mut);font-size:13px}
    </style>
    <div class="back"><div class="panel">
      <div class="top">
        <h1></h1>
        <input type="search" placeholder="Filtrele...">
        <button class="x" title="Kapat">×</button>
      </div>
      <div class="main"></div>
    </div></div>`;
    document.documentElement.appendChild(host);

    const $ = s => r.querySelector(s);
    const main = $('.main'), search = $('input'), title = $('h1');
    let sortKey = null, sortDir = 1;

    const EMPTY = () => ({ text: '', href: '' });

    // sortRows content.js'te tanımlı; burada erişelim
    function renderTable() {
      title.textContent = t.name;
      main.innerHTML = '';
      const q = search.value.toLowerCase();
      const heads = ['#', ...t.keys];
      let data = t.rows.map((row, i) => [{ text: String(i + 1), href: '' }, ...t.keys.map(k => row[k] || EMPTY())]);
      if (q) data = data.filter(v => v.some(x => x.text.toLowerCase().includes(q)));
      const si = sortKey === null ? -1 : heads.indexOf(sortKey);
      if (si >= 0) data = sortRows(data, si, sortDir);

      const tbl = document.createElement('table');
      const trh = document.createElement('tr');
      heads.forEach((h, c) => {
        const th = document.createElement('th');
        if (c === 0) th.className = 'n';
        th.textContent = h + (si === c ? (sortDir === 1 ? ' ▲' : ' ▼') : '');
        th.onclick = () => {
          if (sortKey === h) sortDir *= -1; else { sortKey = h; sortDir = 1; }
          renderTable();
        };
        trh.appendChild(th);
      });
      tbl.appendChild(trh);
      data.forEach(v => {
        const tr = document.createElement('tr');
        v.forEach((x, c) => {
          const td = document.createElement('td');
          if (c === 0) { td.className = 'n'; td.textContent = x.text; }
          else {
            const d = document.createElement('div');
            d.className = 'c';

            if (x.href) {
              const a = document.createElement('a');
              a.href = x.href;
              a.target = '_blank';
              a.rel = 'noopener';
              a.textContent = linkLabel(x.text, x.href);   // ← metin yoksa URL son parçası
              d.title = x.text || x.href;                  // tooltip: metin yoksa tam URL
              d.appendChild(a);
            } else {
              d.textContent = x.text || '';
              d.title = x.text || '';
            }

            d.addEventListener('click', e => { if (!e.target.closest('a')) d.classList.toggle('open'); });
            td.appendChild(d);
          }
          tr.appendChild(td);
        });
        tbl.appendChild(tr);
      });
      main.appendChild(tbl);
      if (!data.length) {
        const d = document.createElement('div'); d.className = 'empty'; d.textContent = 'Sonuç yok';
        main.appendChild(d);
      }
    }

    const close = () => { host.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey, true);
    $('.x').onclick = close;
    $('.back').addEventListener('mousedown', e => { if (e.target.classList.contains('back')) close(); });
    search.addEventListener('input', renderTable);

    renderTable();
  };
})();
