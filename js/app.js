/* 界面逻辑：填链接 → JSONP 抓取 → 展示 → 按分区归档 → 收藏 / 导出 / 云同步 */
window.BILI = window.BILI || {};
(function (B) {
  'use strict';
  var els = {};
  var currentNote = null;
  var activeFilter = 'all';

  function setStatus(msg, type){ els.status.textContent = msg || ''; els.status.className = 'status' + (type ? ' status--' + type : ''); els.status.style.display = msg ? 'block' : 'none'; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }
  function fmtCount(n){ n = +n || 0; if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'; if (n >= 10000) return (n / 10000).toFixed(1) + '万'; return '' + n; }
  function catOf(note){ return note.category ? { name: note.category, emoji: note.categoryEmoji || B.emojiFor(note.category) } : B.classify(note).primary; }

  function videoCardHtml(note, actionsHtml){
    var cat = catOf(note), s = note.stat || {};
    var stats = ['▶ ' + fmtCount(s.view), '👍 ' + fmtCount(s.like), '🪙 ' + fmtCount(s.coin), '⭐ ' + fmtCount(s.favorite), '💬 ' + fmtCount(s.danmaku)].join('　');
    return '' +
      '<article class="card vid">' +
        (note.cover ? '<a class="vid__cover" href="' + esc(note.url) + '" target="_blank" rel="noreferrer"><img src="' + esc(note.cover) + '" loading="lazy" referrerpolicy="no-referrer" alt=""><span class="vid__dur">' + esc(note.durationText || '') + '</span></a>' : '') +
        '<div class="vid__body">' +
          '<div class="vid__head"><span class="badge">' + cat.emoji + ' ' + esc(cat.name) + '</span>' + (note.pubdate ? '<span class="src">' + esc(note.pubdate) + '</span>' : '') + '</div>' +
          '<h3 class="vid__title"><a href="' + esc(note.url) + '" target="_blank" rel="noreferrer">' + esc(note.title || '未命名') + '</a></h3>' +
          (note.author ? '<div class="vid__up">UP · ' + esc(note.author) + '</div>' : '') +
          '<div class="vid__stat">' + stats + '</div>' +
          ((note.transcript || note.body) ? '<pre class="vid__desc">' + esc(note.transcript || note.body) + '</pre>' : '') +
          '<div class="note__actions">' + actionsHtml + '</div>' +
        '</div>' +
      '</article>';
  }

  function showResult(note){
    currentNote = note;
    els.result.innerHTML = videoCardHtml(note,
      '<button class="btn btn--primary" data-act="save">★ 收藏到归档库</button>' +
      '<button class="btn" data-act="copy">复制为 Markdown</button>');
    els.result.style.display = 'block';
    els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function noteToMarkdown(note){
    var cat = catOf(note), s = note.stat || {};
    var md = '## ' + (note.title || '未命名') + '\n\n';
    md += '- 分区：' + cat.emoji + ' ' + cat.name + '\n';
    if (note.author) md += '- UP 主：' + note.author + '\n';
    if (note.pubdate) md += '- 发布：' + note.pubdate + '\n';
    md += '- 数据：▶' + fmtCount(s.view) + ' 👍' + fmtCount(s.like) + ' 🪙' + fmtCount(s.coin) + ' ⭐' + fmtCount(s.favorite) + '\n';
    if (note.durationText) md += '- 时长：' + note.durationText + '\n';
    if (note.url) md += '- 链接：' + note.url + '\n';
    md += '\n' + (note.transcript || note.body || '') + '\n';
    return md;
  }

  async function copyText(t){ try { await navigator.clipboard.writeText(t); setStatus('已复制 ✓', 'ok'); } catch (e) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); setStatus('已复制 ✓', 'ok'); } }
  function download(name, content, type){ var blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }

  function buildFilters(notes){
    var counts = {};
    notes.forEach(function (n) { var k = n.category || (n.tname || '其它'); counts[k] = (counts[k] || 0) + 1; });
    var html = '<button class="chip' + (activeFilter === 'all' ? ' chip--on' : '') + '" data-cat="all">全部 ' + notes.length + '</button>';
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (k) {
      html += '<button class="chip' + (activeFilter === k ? ' chip--on' : '') + '" data-cat="' + esc(k) + '">' + esc(k) + ' ' + counts[k] + '</button>';
    });
    els.catFilter.innerHTML = html;
  }
  function renderLibrary(){
    var all = B.store.getAll();
    buildFilters(all);
    var q = (els.search.value || '').trim().toLowerCase();
    var list = all.filter(function (n) {
      var cat = n.category || (n.tname || '其它');
      if (activeFilter !== 'all' && cat !== activeFilter) return false;
      if (!q) return true;
      return (((n.title || '') + ' ' + (n.author || '') + ' ' + (n.body || '') + ' ' + (n.transcript || '')).toLowerCase()).indexOf(q) !== -1;
    });
    els.libCount.textContent = list.length + ' / ' + all.length + ' 个';
    if (!all.length) { els.libList.innerHTML = '<p class="empty">还没有收藏。粘贴一个 B 站视频链接，点「整理」后收藏。</p>'; return; }
    if (!list.length) { els.libList.innerHTML = '<p class="empty">没有匹配的视频。</p>'; return; }
    els.libList.innerHTML = list.map(function (n) {
      return videoCardHtml(n,
        '<button class="btn btn--ghost" data-act="copy-lib" data-id="' + n.id + '">复制 MD</button>' +
        '<button class="btn btn--ghost" data-act="open" data-id="' + n.id + '">去 B 站</button>' +
        '<button class="btn btn--danger" data-act="del" data-id="' + n.id + '">删除</button>');
    }).join('');
  }

  async function onFetch(){
    var v = els.urlInput.value.trim();
    if (!v) { setStatus('请粘贴 B 站视频链接或 BV 号', 'err'); return; }
    els.fetchBtn.disabled = true;
    setStatus('正在抓取…', 'loading');
    try { var note = await B.fetchVideo(v); setStatus('抓取完成 ✓ 分区：' + (note.tname || '未知'), 'ok'); showResult(note); }
    catch (e) { setStatus('抓取失败：' + e.message, 'err'); }
    finally { els.fetchBtn.disabled = false; }
  }
  function saveCurrent(){
    if (!currentNote) return;
    var cls = B.classify(currentNote);
    B.store.save(Object.assign({}, currentNote, { category: cls.primary.name, categoryEmoji: cls.primary.emoji }));
    setStatus('已收藏 ★', 'ok'); renderLibrary(); scheduleSync();
  }

  // ---------- 云同步（无令牌时静默跳过） ----------
  var syncTimer = null, syncing = false;
  function setSyncStatus(state, text, title){ if (!els.syncStatus) return; els.syncStatus.className = 'sync-pill' + (state ? ' is-' + state : ''); els.syncStatus.textContent = text; els.syncStatus.title = title || '云同步状态（点击设置）'; }
  function updateSyncUI(){ if (!B.sync) return; if (els.repoLabel) els.repoLabel.textContent = B.sync.dataLabel(); if (B.sync.isConfigured()) setSyncStatus('ok', '☁ ' + B.sync.getConfig().owner, '已连接 ' + B.sync.dataLabel() + '（点击设置）'); else setSyncStatus('', '● 本地', '未连接云同步，仅存本机（点击设置）'); }
  async function doSync(){ if (!B.sync || !B.sync.isConfigured() || syncing) return; syncing = true; setSyncStatus('syncing', '↻ 同步中…'); try { await B.sync.sync(); renderLibrary(); var t = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); setSyncStatus('ok', '☁ 已同步', '已同步于 ' + t + ' · ' + B.sync.dataLabel()); } catch (e) { setSyncStatus('err', '⚠ 同步失败', e.message); } finally { syncing = false; } }
  function scheduleSync(){ if (!B.sync || !B.sync.isConfigured()) return; clearTimeout(syncTimer); syncTimer = setTimeout(doSync, 800); }
  function toggleSettings(){ var p = els.settingsPanel; p.style.display = (p.style.display === 'none') ? 'block' : 'none'; }
  async function onSaveToken(){
    var token = (els.tokenInput.value || '').trim();
    if (!token) { els.settingsStatus.textContent = '请输入令牌'; return; }
    els.saveTokenBtn.disabled = true; els.settingsStatus.textContent = '正在校验…';
    try { var login = await B.sync.validate(token); B.sync.saveToken(token, login); els.tokenInput.value = ''; updateSyncUI(); els.settingsStatus.textContent = '已连接 ' + login + '，同步中…'; await doSync(); els.settingsStatus.textContent = '✓ 已连接并同步（' + B.sync.dataLabel() + '）'; }
    catch (e) { els.settingsStatus.textContent = '连接失败：' + e.message; setSyncStatus('err', '⚠ 未连接', e.message); }
    finally { els.saveTokenBtn.disabled = false; }
  }

  function bind(){
    els.fetchBtn.addEventListener('click', onFetch);
    els.urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') onFetch(); });
    els.result.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (!b) return; var act = b.getAttribute('data-act'); if (act === 'save') saveCurrent(); else if (act === 'copy') copyText(noteToMarkdown(currentNote)); });
    els.catFilter.addEventListener('click', function (e) { var c = e.target.closest('[data-cat]'); if (!c) return; activeFilter = c.getAttribute('data-cat'); renderLibrary(); });
    els.search.addEventListener('input', renderLibrary);
    els.libList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
      var note = B.store.getAll().find(function (n) { return n.id === id; });
      if (act === 'del') { if (confirm('删除这个收藏？')) { B.store.remove(id); renderLibrary(); scheduleSync(); } }
      else if (act === 'copy-lib') { copyText(noteToMarkdown(note)); }
      else if (act === 'open') { if (note && note.url) window.open(note.url, '_blank', 'noreferrer'); }
    });
    els.exportJson.addEventListener('click', function () { download('bilibili-notes.json', JSON.stringify(B.store.getAll(), null, 2), 'application/json'); });
    els.exportMd.addEventListener('click', function () { download('bilibili-notes.md', B.store.getAll().map(noteToMarkdown).join('\n\n---\n\n'), 'text/markdown'); });
    els.clearAll.addEventListener('click', function () { if (confirm('清空归档库？连接云同步时本地与云端都会删除，不可恢复。')) { B.store.clear(); renderLibrary(); scheduleSync(); } });
    els.settingsBtn.addEventListener('click', toggleSettings);
    els.syncStatus.addEventListener('click', toggleSettings);
    els.syncBtn.addEventListener('click', doSync);
    els.saveTokenBtn.addEventListener('click', onSaveToken);
    els.tokenInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') onSaveToken(); });
  }
  function init(){
    ['status','result','urlInput','fetchBtn','catFilter','search','libList','libCount','exportJson','exportMd','clearAll',
     'syncStatus','syncBtn','settingsBtn','settingsPanel','tokenInput','saveTokenBtn','settingsStatus','repoLabel'
    ].forEach(function (id) { els[id] = document.getElementById(id); });
    bind(); renderLibrary(); setStatus(''); updateSyncUI();
    if (B.sync && B.sync.isConfigured()) doSync();
  }
  document.addEventListener('DOMContentLoaded', init);
})(window.BILI);
