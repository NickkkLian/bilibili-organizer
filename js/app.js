/* 界面逻辑：填链接 → JSONP 抓取 → 展示 → 按分区归档 → 收藏 / 导出 / 云同步 */
window.BILI = window.BILI || {};
(function (B) {
  'use strict';
  var T = B.i18n.T;   // 双语 T(zh,en)，中文原生、英文备选
  var els = {};
  var currentNote = null;
  var activeFilter = 'all';
  var selectedIds = new Set();   // 勾选用于「AI 整理成合集」的视频 id
  var viewArchived = false;      // 归档视图开关：整理过的视频自动归档到这里

  function setStatus(msg, type){ els.status.textContent = msg || ''; els.status.className = 'status' + (type ? ' status--' + type : ''); els.status.style.display = msg ? 'block' : 'none'; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }
  function fmtCount(n){ n = +n || 0; if (B.i18n && B.i18n.lang === 'en') { if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'; return '' + n; } if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'; if (n >= 10000) return (n / 10000).toFixed(1) + '万'; return '' + n; }
  function catOf(note){ return note.category ? { name: note.category, emoji: note.categoryEmoji || B.emojiFor(note.category) } : B.classify(note).primary; }

  function videoCardHtml(note, actionsHtml, opts){
    opts = opts || {};
    var cat = catOf(note), s = note.stat || {};
    var stats = ['▶ ' + fmtCount(s.view), '👍 ' + fmtCount(s.like), '🪙 ' + fmtCount(s.coin), '⭐ ' + fmtCount(s.favorite), '💬 ' + fmtCount(s.danmaku)].join('　');
    var sel = opts.selectable ? '<label class="note__sel"><input type="checkbox" class="selbox" data-id="' + note.id + '"' + (opts.selected ? ' checked' : '') + '> ' + T('选入合集','Add to compilation') + '</label>' : '';
    return '' +
      '<article class="card vid' + (opts.selected ? ' is-sel' : '') + '">' +
        (note.cover ? '<a class="vid__cover" href="' + esc(note.url) + '" target="_blank" rel="noreferrer"><img src="' + esc(note.cover) + '" loading="lazy" referrerpolicy="no-referrer" alt=""><span class="vid__dur">' + esc(note.durationText || '') + '</span></a>' : '') +
        '<div class="vid__body">' + sel +
          '<div class="vid__head"><span class="badge">' + cat.emoji + ' ' + esc(B.catLabel(cat.name)) + '</span>' + (note.pubdate ? '<span class="src">' + esc(note.pubdate) + '</span>' : '') + '</div>' +
          '<h3 class="vid__title"><a href="' + esc(note.url) + '" target="_blank" rel="noreferrer">' + esc(note.title || T('未命名','Untitled')) + '</a></h3>' +
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
      '<button class="btn btn--primary" data-act="save">' + T('★ 收藏到归档库','★ Save to archive') + '</button>' +
      '<button class="btn" data-act="copy">' + T('复制为 Markdown','Copy as Markdown') + '</button>');
    els.result.style.display = 'block';
    els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function noteToMarkdown(note){
    var cat = catOf(note), s = note.stat || {};
    var md = '## ' + (note.title || T('未命名','Untitled')) + '\n\n';
    md += T('- 分区：','- Category: ') + cat.emoji + ' ' + B.catLabel(cat.name) + '\n';
    if (note.author) md += T('- UP 主：','- Uploader: ') + note.author + '\n';
    if (note.pubdate) md += T('- 发布：','- Published: ') + note.pubdate + '\n';
    md += T('- 数据：▶','- Stats: ▶') + fmtCount(s.view) + ' 👍' + fmtCount(s.like) + ' 🪙' + fmtCount(s.coin) + ' ⭐' + fmtCount(s.favorite) + '\n';
    if (note.durationText) md += T('- 时长：','- Duration: ') + note.durationText + '\n';
    if (note.url) md += T('- 链接：','- Link: ') + note.url + '\n';
    md += '\n' + (note.transcript || note.body || '') + '\n';
    return md;
  }

  async function copyText(t){ try { await navigator.clipboard.writeText(t); setStatus(T('已复制 ✓','Copied ✓'), 'ok'); } catch (e) { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); setStatus(T('已复制 ✓','Copied ✓'), 'ok'); } }
  function download(name, content, type){ var blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' }); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }

  function buildFilters(notes){
    var counts = {};
    notes.forEach(function (n) { var k = n.category || (n.tname || '其它'); counts[k] = (counts[k] || 0) + 1; });
    var html = '<button class="chip' + (activeFilter === 'all' ? ' chip--on' : '') + '" data-cat="all">' + T('全部 ','All ') + notes.length + '</button>';
    Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).forEach(function (k) {
      html += '<button class="chip' + (activeFilter === k ? ' chip--on' : '') + '" data-cat="' + esc(k) + '">' + esc(B.catLabel(k)) + ' ' + counts[k] + '</button>';
    });
    els.catFilter.innerHTML = html;
  }
  function renderLibrary(){
    var all = B.store.getAll();
    var base = all.filter(function (n) { return viewArchived ? n.archived : !n.archived; });
    var archivedCount = all.filter(function (n) { return n.archived; }).length;
    if (els.archCount) els.archCount.textContent = archivedCount;
    if (els.archToggle) els.archToggle.classList.toggle('chip--on', viewArchived);
    buildFilters(base);
    var q = (els.search.value || '').trim().toLowerCase();
    var list = base.filter(function (n) {
      var cat = n.category || (n.tname || '其它');
      if (activeFilter !== 'all' && cat !== activeFilter) return false;
      if (!q) return true;
      return (((n.title || '') + ' ' + (n.author || '') + ' ' + (n.body || '') + ' ' + (n.transcript || '')).toLowerCase()).indexOf(q) !== -1;
    });
    els.libCount.textContent = list.length + ' / ' + base.length + T(' 个',' videos') + (viewArchived ? T('（已归档）',' (archived)') : '');
    if (!base.length) { els.libList.innerHTML = '<p class="empty">' + (viewArchived ? T('还没有已归档的视频。整理成合集后，作为素材的视频会自动归档到这里。','No archived videos yet. After you consolidate, the source videos are auto-archived here.') : T('还没有收藏。粘贴一个 B 站视频链接，点「整理」后收藏。','No saved videos yet. Paste a Bilibili link, click "Organize", then save.')) + '</p>'; return; }
    if (!list.length) { els.libList.innerHTML = '<p class="empty">' + T('没有匹配的视频。','No matching videos.') + '</p>'; return; }
    els.libList.innerHTML = list.map(function (n) {
      var actions = viewArchived
        ? '<button class="btn btn--ghost" data-act="copy-lib" data-id="' + n.id + '">' + T('复制 MD','Copy MD') + '</button>' +
          '<button class="btn btn--ghost" data-act="open" data-id="' + n.id + '">' + T('去 B 站','Open Bilibili') + '</button>' +
          '<button class="btn btn--primary" data-act="unarch" data-id="' + n.id + '">' + T('↩︎ 取出','↩︎ Restore') + '</button>' +
          '<button class="btn btn--danger" data-act="del" data-id="' + n.id + '">' + T('删除','Delete') + '</button>'
        : '<button class="btn btn--ghost" data-act="copy-lib" data-id="' + n.id + '">' + T('复制 MD','Copy MD') + '</button>' +
          '<button class="btn btn--ghost" data-act="open" data-id="' + n.id + '">' + T('去 B 站','Open Bilibili') + '</button>' +
          '<button class="btn btn--ghost" data-act="arch" data-id="' + n.id + '">' + T('📥 归档','📥 Archive') + '</button>' +
          '<button class="btn btn--danger" data-act="del" data-id="' + n.id + '">' + T('删除','Delete') + '</button>';
      return videoCardHtml(n, actions, { selectable: !viewArchived, selected: selectedIds.has(n.id) });
    }).join('');
  }

  async function onFetch(){
    var v = els.urlInput.value.trim();
    if (!v) { setStatus(T('请粘贴 B 站视频链接或 BV 号','Paste a Bilibili video link or BV id'), 'err'); return; }
    els.fetchBtn.disabled = true;
    setStatus(T('正在抓取…','Fetching…'), 'loading');
    try { var note = await B.fetchVideo(v); setStatus(T('抓取完成 ✓ 分区：','Fetched ✓ Category: ') + (note.tname ? B.catLabel(note.tname) : T('未知','Unknown')), 'ok'); showResult(note); }
    catch (e) { setStatus(T('抓取失败：','Fetch failed: ') + e.message, 'err'); }
    finally { els.fetchBtn.disabled = false; }
  }
  function saveCurrent(){
    if (!currentNote) return;
    var cls = B.classify(currentNote);
    B.store.save(Object.assign({}, currentNote, { category: cls.primary.name, categoryEmoji: cls.primary.emoji }));
    setStatus(T('已收藏 ★','Saved ★'), 'ok'); renderLibrary(); scheduleSync();
  }

  // ---------- 多选 → AI 整理成合集 ----------
  function updateSelBar(){
    var n = selectedIds.size;
    els.selBar.style.display = n ? 'flex' : 'none';
    if (!n) return;
    els.selCount.textContent = T('已选 ','Selected ') + n + T(' 个',' videos');
    var comps = B.store.getComps();
    els.addToComp.innerHTML = '<option value="">' + T('加入已有合集…','Add to existing compilation…') + '</option>' +
      comps.map(function (c) { return '<option value="' + c.id + '">' + esc(c.title || T('未命名合集','Untitled compilation')) + '</option>'; }).join('');
  }

  async function runConsolidate(existingComp){
    if (!B.ai || !B.ai.isReady()){
      setStatus(T('请先在 ⚙️ 设置里填入 Anthropic API 令牌','Enter your Anthropic API token in ⚙️ Settings first'), 'err');
      els.settingsPanel.style.display = 'block';
      els.settingsPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var notes = B.store.getAll().filter(function (n) { return selectedIds.has(n.id); });
    if (!notes.length){ setStatus(T('请先勾选视频','Select some videos first'), 'err'); return; }
    if (!notes.some(function (n) { return (n.transcript || '').trim(); })){
      setStatus(T('选中的视频还没有「字幕/内容」，先用本地工具抓到字幕再整理','Selected videos have no "subtitles/content" yet — fetch subtitles with the local tool first'), 'err'); return;
    }
    els.consolidateBtn.disabled = true; els.addToComp.disabled = true;
    setStatus(T('AI 整理中…（按内容长度约 15–40 秒，请勿关闭页面）','AI consolidating… (~15–40s by length, keep this page open)'), 'loading');
    try {
      var vids = notes.map(function (n) { return { title: n.title, author: n.author, tname: n.tname, transcript: n.transcript || n.body, url: n.url }; });
      var res = await B.ai.consolidate(vids, existingComp || null);
      var sections = (res.sections || []).map(function (s) {
        var srcs = (s.source_indices || []).map(function (i) {
          var nn = notes[i - 1]; return nn ? { title: nn.title || T('未命名','Untitled'), url: nn.url || '' } : null;
        }).filter(Boolean);
        return { heading: s.heading, content: s.content, sources: srcs };
      });
      var prevIds = (existingComp && existingComp.sourceNoteIds) || [];
      var prevUrls = (existingComp && existingComp.sourceUrls) || [];
      var comp = {
        id: existingComp ? existingComp.id : undefined,
        title: res.title, topic: res.topic, summary: res.summary, sections: sections,
        sourceNoteIds: Array.from(new Set(prevIds.concat(notes.map(function (n) { return n.id; })))),
        sourceUrls: Array.from(new Set(prevUrls.concat(notes.map(function (n) { return n.url; }).filter(Boolean)))),
        model: B.ai.getConfig().model
      };
      B.store.saveComp(comp);
      B.store.archive(notes.map(function (n) { return n.id; }));   // 整理过的素材自动归档
      selectedIds.clear();
      renderLibrary(); renderComps(); updateSelBar();
      setStatus(T('整理完成 ✓ 已存入合集，原视频已自动归档','Done ✓ Saved to a compilation; source videos auto-archived'), 'ok');
      scheduleSync();
      els.compsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      setStatus(T('AI 整理失败：','AI consolidation failed: ') + e.message, 'err');
    } finally {
      els.consolidateBtn.disabled = false; els.addToComp.disabled = false;
    }
  }

  // ---------- 合集渲染 ----------
  function compToMarkdown(c){
    var md = '# ' + (c.title || T('未命名合集','Untitled compilation')) + '\n\n';
    if (c.topic) md += T('> 主题：','> Topic: ') + c.topic + '\n\n';
    if (c.summary) md += c.summary + '\n\n';
    (c.sections || []).forEach(function (s) {
      md += '## ' + s.heading + '\n\n' + s.content + '\n';
      if (s.sources && s.sources.length) {
        md += T('\n来源：','\nSources: ') + s.sources.map(function (x) { return x.url ? ('[' + (x.title || T('链接','link')) + '](' + x.url + ')') : (x.title || ''); }).join(' · ') + '\n';
      }
      md += '\n';
    });
    return md;
  }
  function compCardHtml(c){
    var meta = '<span class="badge">🧩 ' + esc(c.topic || T('合集','Compilation')) + '</span>' +
      (c.model ? '<span class="badge badge--soft">' + esc(String(c.model).replace('claude-', '')) + '</span>' : '') +
      '<span class="src">' + ((c.sourceUrls && c.sourceUrls.length) || 0) + T(' 个来源',' sources') + '</span>';
    var secs = (c.sections || []).map(function (s) {
      var src = (s.sources && s.sources.length)
        ? '<div class="comp__src">' + s.sources.map(function (x) {
            return x.url ? '<a href="' + esc(x.url) + '" target="_blank" rel="noreferrer">' + esc(x.title || T('链接','link')) + ' ↗</a>' : '<a>' + esc(x.title || '') + '</a>';
          }).join('') + '</div>'
        : '';
      return '<div class="comp__sec"><h4>' + esc(s.heading) + '</h4><div class="body">' + esc(s.content) + '</div>' + src + '</div>';
    }).join('');
    return '<article class="card comp">' +
      '<div class="comp__meta">' + meta + '</div>' +
      '<h3 class="comp__title">' + esc(c.title || T('未命名合集','Untitled compilation')) + '</h3>' +
      (c.summary ? '<div class="comp__summary">' + esc(c.summary) + '</div>' : '') +
      secs +
      '<div class="note__actions">' +
        '<button class="btn btn--ghost" data-cact="copy" data-id="' + c.id + '">' + T('复制 MD','Copy MD') + '</button>' +
        '<button class="btn btn--danger" data-cact="del" data-id="' + c.id + '">' + T('删除','Delete') + '</button>' +
      '</div></article>';
  }
  function renderComps(){
    var comps = B.store.getComps();
    els.compCount.textContent = comps.length ? '· ' + comps.length + T(' 篇',' items') : '';
    els.compList.innerHTML = comps.length
      ? comps.map(compCardHtml).join('')
      : '<p class="empty">' + T('还没有合集。在归档库勾选几个视频（需先抓到字幕/内容），点「✨ AI 整理成合集」。','No compilations yet. Tick a few videos in the archive (fetch their subtitles/content first), then click "✨ AI consolidate".') + '</p>';
  }

  // ---------- AI 设置 ----------
  function updateAIUI(){
    if (!B.ai) return;
    var cfg = B.ai.getConfig();
    if (els.aiModel) {
      els.aiModel.innerHTML = B.ai.MODELS.map(function (m) { return '<option value="' + m.id + '">' + (B.i18n.lang === 'en' ? m.nameEn : m.name) + '</option>'; }).join('');
    }
    if (els.aiModel) els.aiModel.value = cfg.model;
    if (els.aiStatus) els.aiStatus.textContent = B.ai.isReady()
      ? (T('AI 已就绪 · ','AI ready · ') + String(cfg.model).replace('claude-', ''))
      : T('AI 未设置：填入 Anthropic API Key 后即可「整理成合集」','AI not set: enter your Anthropic API Key to enable consolidation');
  }
  function onSaveAI(){
    var key = (els.aiKeyInput.value || '').trim();
    var model = els.aiModel.value;
    B.ai.saveConfig(key || null, model);
    els.aiKeyInput.value = '';
    updateAIUI();
    els.aiStatus.textContent = B.ai.isReady()
      ? (T('✓ 已保存 · ','✓ Saved · ') + String(model).replace('claude-', ''))
      : T('已保存模型（仍未填令牌，整理功能不可用）','Model saved (still no token; consolidation unavailable)');
  }

  // ---------- 云同步（无令牌时静默跳过） ----------
  var syncTimer = null, syncing = false;
  function setSyncStatus(state, text, title){ if (!els.syncStatus) return; els.syncStatus.className = 'sync-pill' + (state ? ' is-' + state : ''); els.syncStatus.textContent = text; els.syncStatus.title = title || T('云同步状态（点击设置）','Cloud sync status (click to set up)'); }
  function updateSyncUI(){ if (!B.sync) return; if (els.repoLabel) els.repoLabel.textContent = B.sync.dataLabel(); if (B.sync.isConfigured()) setSyncStatus('ok', '☁ ' + B.sync.getConfig().owner, T('已连接 ','Connected ') + B.sync.dataLabel() + T('（点击设置）',' (click to set up)')); else setSyncStatus('', T('● 本地','● Local'), T('未连接云同步，仅存本机（点击设置）','Not connected; local only (click to set up)')); }
  async function doSync(){ if (!B.sync || !B.sync.isConfigured() || syncing) return; syncing = true; setSyncStatus('syncing', T('↻ 同步中…','↻ Syncing…')); try { await B.sync.sync(); renderLibrary(); renderComps(); var t = new Date().toLocaleTimeString(B.i18n.lang === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit' }); setSyncStatus('ok', T('☁ 已同步','☁ Synced'), T('已同步于 ','Synced at ') + t + ' · ' + B.sync.dataLabel()); } catch (e) { setSyncStatus('err', T('⚠ 同步失败','⚠ Sync failed'), e.message); } finally { syncing = false; } }
  function scheduleSync(){ if (!B.sync || !B.sync.isConfigured()) return; clearTimeout(syncTimer); syncTimer = setTimeout(doSync, 800); }
  function toggleSettings(){ var p = els.settingsPanel; p.style.display = (p.style.display === 'none') ? 'block' : 'none'; }
  async function onSaveToken(){
    var token = (els.tokenInput.value || '').trim();
    if (!token) { els.settingsStatus.textContent = T('请输入令牌','Enter a token'); return; }
    els.saveTokenBtn.disabled = true; els.settingsStatus.textContent = T('正在校验…','Validating…');
    try { var login = await B.sync.validate(token); B.sync.saveToken(token, login); els.tokenInput.value = ''; updateSyncUI(); els.settingsStatus.textContent = T('已连接 ','Connected ') + login + T('，同步中…',', syncing…'); await doSync(); els.settingsStatus.textContent = T('✓ 已连接并同步（','✓ Connected & synced (') + B.sync.dataLabel() + T('）',')'); }
    catch (e) { els.settingsStatus.textContent = T('连接失败：','Connection failed: ') + e.message; setSyncStatus('err', T('⚠ 未连接','⚠ Not connected'), e.message); }
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
      if (act === 'del') { if (confirm(T('删除这个收藏？','Delete this saved video?'))) { B.store.remove(id); renderLibrary(); scheduleSync(); } }
      else if (act === 'copy-lib') { copyText(noteToMarkdown(note)); }
      else if (act === 'open') { if (note && note.url) window.open(note.url, '_blank', 'noreferrer'); }
      else if (act === 'arch') { B.store.archive([id]); selectedIds.delete(id); renderLibrary(); updateSelBar(); scheduleSync(); }
      else if (act === 'unarch') { B.store.unarchive([id]); renderLibrary(); scheduleSync(); }
    });
    els.exportJson.addEventListener('click', function () { download('bilibili-notes.json', JSON.stringify(B.store.getAll(), null, 2), 'application/json'); });
    els.exportMd.addEventListener('click', function () { download('bilibili-notes.md', B.store.getAll().map(noteToMarkdown).join('\n\n---\n\n'), 'text/markdown'); });
    els.clearAll.addEventListener('click', function () { if (confirm(T('清空归档库？连接云同步时本地与云端都会删除，不可恢复。','Clear the whole archive? When cloud sync is on, both local and cloud copies are deleted, irreversibly.'))) { B.store.clear(); renderLibrary(); scheduleSync(); } });
    els.archToggle.addEventListener('click', function () { viewArchived = !viewArchived; activeFilter = 'all'; selectedIds.clear(); renderLibrary(); updateSelBar(); });
    els.settingsBtn.addEventListener('click', toggleSettings);
    els.syncStatus.addEventListener('click', toggleSettings);
    els.syncBtn.addEventListener('click', doSync);
    els.saveTokenBtn.addEventListener('click', onSaveToken);
    els.tokenInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') onSaveToken(); });
    els.libList.addEventListener('change', function (e) {
      var cb = e.target.closest('input.selbox'); if (!cb) return;
      var id = cb.getAttribute('data-id');
      if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
      var art = cb.closest('.vid'); if (art) art.classList.toggle('is-sel', cb.checked);
      updateSelBar();
    });
    els.consolidateBtn.addEventListener('click', function () { runConsolidate(null); });
    els.addToComp.addEventListener('change', function () {
      var id = els.addToComp.value; els.addToComp.value = '';
      if (!id) return;
      var comp = B.store.getComps().find(function (c) { return c.id === id; });
      if (comp) runConsolidate(comp);
    });
    els.clearSel.addEventListener('click', function () { selectedIds.clear(); renderLibrary(); updateSelBar(); });
    els.compList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cact]'); if (!b) return;
      var id = b.getAttribute('data-id'), act = b.getAttribute('data-cact');
      var comp = B.store.getComps().find(function (c) { return c.id === id; });
      if (act === 'copy') { if (comp) copyText(compToMarkdown(comp)); }
      else if (act === 'del') { if (confirm(T('删除这篇合集？','Delete this compilation?'))) { B.store.removeComp(id); renderComps(); updateSelBar(); scheduleSync(); } }
    });
    els.saveAiBtn.addEventListener('click', onSaveAI);
    if (els.langBtn) els.langBtn.addEventListener('click', B.i18n.toggleLang);
  }
  function init(){
    ['status','result','urlInput','fetchBtn','catFilter','search','libList','libCount','exportJson','exportMd','clearAll',
     'syncStatus','syncBtn','settingsBtn','settingsPanel','tokenInput','saveTokenBtn','settingsStatus','repoLabel',
     'selBar','selCount','consolidateBtn','addToComp','clearSel','compsCard','compCount','compList',
     'aiKeyInput','aiModel','saveAiBtn','aiStatus','archToggle','archCount','langBtn'
    ].forEach(function (id) { els[id] = document.getElementById(id); });
    B.i18n.applyStatic();
    bind(); renderLibrary(); renderComps(); updateAIUI(); setStatus(''); updateSyncUI();
    if (B.sync && B.sync.isConfigured()) doSync();
  }
  // 供 i18n.toggleLang 切换语言后重渲染所有动态内容
  B.app = { rerender: function () { renderLibrary(); renderComps(); updateSelBar(); updateAIUI(); updateSyncUI(); if (currentNote) showResult(currentNote); } };

  document.addEventListener('DOMContentLoaded', init);
})(window.BILI);
