/* 中英双语引擎（原生中文 app，英文为备选）。
   全站共享 localStorage 键 pha-lang（默认 zh）。必须最先加载（在其它 js 之前）。
   静态 HTML 用 data-i18n / data-i18n-ph / data-i18n-title / data-i18n-html；
   动态渲染用 window.T(zh,en) 或 B.i18n.T。切换时 applyStatic() + B.app.rerender()。 */
window.BILI = window.BILI || {};
(function (B) {
  'use strict';

  var lang = (function () {
    try { return localStorage.getItem('pha-lang') === 'en' ? 'en' : 'zh'; }
    catch (e) { return 'zh'; }
  })();

  function T(zh, en) { return lang === 'en' ? en : zh; }

  var I18N = {
    h1:           { zh: '📺 B 站视频整理归档', en: '📺 Bilibili Organizer' },
    sub:          { zh: '粘贴链接 → 自动抓取信息 → 按分区归档 → 多设备同步', en: 'Paste a link → auto-fetch info → archive by category → sync across devices' },
    urlPh:        { zh: '粘贴 B 站视频链接，如 https://www.bilibili.com/video/BV… 或 BV 号', en: 'Paste a Bilibili video link, e.g. https://www.bilibili.com/video/BV… or a BV id' },
    organize:     { zh: '整理', en: 'Organize' },
    linkHint:     { zh: '走 B 站公开接口（JSONP，无需登录）抓标题/简介/封面/UP主/分区/数据。视频「口播字幕 / AI 总结」需另接读视频后端（见 README）。', en: 'Uses Bilibili\'s public API (JSONP, no login) to fetch title / description / cover / uploader / category / stats. Video "spoken subtitles / AI summary" needs a separate video-reading backend (see README).' },
    myLib:        { zh: '我的归档库', en: 'My archive' },
    syncBtn:      { zh: '🔄 同步', en: '🔄 Sync' },
    searchPh:     { zh: '搜索标题 / UP主 / 简介', en: 'Search title / uploader / description' },
    archived:     { zh: '已归档', en: 'Archived' },
    archTitle:    { zh: '切换查看已归档', en: 'Toggle archived view' },
    exportMd:     { zh: '导出 MD', en: 'Export MD' },
    exportJson:   { zh: '导出 JSON', en: 'Export JSON' },
    clearAll:     { zh: '清空', en: 'Clear' },
    syncHint:     { zh: '归档库同步到私有仓库 <code id="repoLabel"></code>，多设备共享。令牌仅存于本机浏览器（与导航站共用 <code>pha-config</code>），<strong>绝不写入任何仓库</strong>。', en: 'Your archive syncs to the private repo <code id="repoLabel"></code>, shared across devices. The token is stored only in this browser (shared <code>pha-config</code> with the portal) and <strong>never written to any repo</strong>.' },
    tokenPh:      { zh: 'GitHub Token（对 Database 仓库 Contents 读写）', en: 'GitHub Token (read/write to the Database repo Contents)' },
    saveConnect:  { zh: '保存并连接', en: 'Save & connect' },
    aiHint:       { zh: '「✨ AI 整理成合集」用 Claude API 把视频字幕整理成通顺的分板块长文（补标点、去重复、归纳要点）。API 令牌仅存本机浏览器、<strong>绝不写入仓库</strong>；点一次约几美分。<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">获取 Key ↗</a>', en: '"✨ AI consolidate" uses the Claude API to turn video subtitles into a clean, sectioned long-form piece (add punctuation, drop repetition, summarize key points). The API token is stored only in this browser and <strong>never written to any repo</strong>; ~a few cents per run. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Get a Key ↗</a>' },
    aiKeyPh:      { zh: 'Anthropic API Key（sk-ant-…）', en: 'Anthropic API Key (sk-ant-…)' },
    save:         { zh: '保存', en: 'Save' },
    consolidate:  { zh: '✨ AI 整理成合集', en: '✨ AI consolidate' },
    addToCompOpt: { zh: '加入已有合集…', en: 'Add to existing compilation…' },
    clearSel:     { zh: '取消选择', en: 'Clear selection' },
    myComps:      { zh: '我的合集', en: 'My compilations' },
    foot:         { zh: '本地缓存 + 私有仓库云同步 + AI 整理合集 · 令牌只存本机浏览器', en: 'Local cache + private-repo cloud sync + AI consolidation · token stored only in this browser' }
  };

  function L(k) {
    var e = I18N[k];
    return e ? (lang === 'en' ? e.en : e.zh) : k;
  }

  function applyStatic(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = L(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) { el.innerHTML = L(el.getAttribute('data-i18n-html')); });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.setAttribute('placeholder', L(el.getAttribute('data-i18n-ph'))); });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) { el.setAttribute('title', L(el.getAttribute('data-i18n-title'))); });
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    var lb = document.getElementById('langBtn');
    if (lb) lb.textContent = lang === 'en' ? '中' : 'EN';
  }

  function toggleLang() {
    lang = lang === 'en' ? 'zh' : 'en';
    try { localStorage.setItem('pha-lang', lang); } catch (e) {}
    applyStatic();
    if (B.app && B.app.rerender) B.app.rerender();
  }

  B.i18n = {
    get lang() { return lang; },
    T: T, L: L, applyStatic: applyStatic, toggleLang: toggleLang, I18N: I18N
  };
  window.T = T;
})(window.BILI);
