/* 云同步：把收藏库存到私有仓库 NickkkLian/Database 的 bilibili.json，支持多设备。
   令牌与导航站共用 localStorage 键 pha-config，只存本机、绝不进仓库。
   仅读写本 app 自己的 bilibili.json，不碰仓库内其它文件。 */
window.BILI = window.BILI || {};
(function (B) {
  'use strict';

  var PHA_KEY = 'pha-config';
  var DATA_PATH = 'bilibili.json';
  var DEFAULTS = { owner: 'NickkkLian', repo: 'Database', token: '' };

  function getConfig(){
    try { var raw = localStorage.getItem(PHA_KEY); return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function isConfigured(cfg){ cfg = cfg || getConfig(); return Boolean(cfg.owner && cfg.token); }
  function saveToken(token, owner){
    var cur = getConfig();
    var next = Object.assign({}, cur, { token: token });
    if (owner) next.owner = owner;
    localStorage.setItem(PHA_KEY, JSON.stringify(next));
    return next;
  }
  function dataLabel(){ var c = getConfig(); return c.owner + '/' + c.repo + ' → ' + DATA_PATH; }

  function headers(token){ return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }; }
  function b64encode(str){ var bytes = new TextEncoder().encode(str), bin = ''; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); }
  function b64decode(b64){ var bin = atob(String(b64).replace(/\s/g, '')); var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }
  function emptyDoc(){ return { version: 1, updatedAt: null, notes: [], deleted: [] }; }
  function normalizeDoc(d){ d = d || {}; return { version: d.version || 1, updatedAt: d.updatedAt || null, notes: Array.isArray(d.notes) ? d.notes : [], deleted: Array.isArray(d.deleted) ? d.deleted : [] }; }
  function contentsUrl(cfg){ return 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + DATA_PATH; }

  async function validate(token){
    var r = await fetch('https://api.github.com/user', { headers: headers(token) });
    if (r.status === 401) throw new Error('令牌无效或已过期 (401)');
    if (!r.ok) throw new Error('校验失败 HTTP ' + r.status);
    return (await r.json()).login;
  }
  async function getFile(cfg){
    var r = await fetch(contentsUrl(cfg), { headers: headers(cfg.token) });
    if (r.status === 404) return { doc: emptyDoc(), sha: null, missing: true };
    if (r.status === 401) throw new Error('令牌无效或已过期 (401)');
    if (!r.ok) throw new Error('读取失败 HTTP ' + r.status);
    var j = await r.json(), doc;
    try { doc = normalizeDoc(JSON.parse(b64decode(j.content))); } catch (e) { doc = emptyDoc(); }
    return { doc: doc, sha: j.sha, missing: false };
  }
  async function putFile(cfg, doc, sha, message){
    var body = { message: message || 'bilibili-organizer sync', content: b64encode(JSON.stringify(doc, null, 2)) };
    if (sha) body.sha = sha;
    var r = await fetch(contentsUrl(cfg), { method: 'PUT', headers: headers(cfg.token), body: JSON.stringify(body) });
    if (!r.ok) throw new Error('写入失败 HTTP ' + r.status + (r.status === 409 ? '（版本冲突）' : ''));
    return r.json();
  }
  function mergeDocs(a, b){
    a = normalizeDoc(a); b = normalizeDoc(b);
    var deleted = Array.from(new Set(a.deleted.concat(b.deleted))), del = {};
    deleted.forEach(function (id) { del[id] = 1; });
    var byId = {};
    a.notes.concat(b.notes).forEach(function (n) {
      if (!n || !n.id || del[n.id]) return;
      var ex = byId[n.id];
      if (!ex || String(n.savedAt || '') >= String(ex.savedAt || '')) byId[n.id] = n;
    });
    var notes = Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (x, y) { return String(y.savedAt || '').localeCompare(String(x.savedAt || '')); });
    return { version: 1, updatedAt: new Date().toISOString(), notes: notes, deleted: deleted };
  }
  function sig(doc){
    var n = (doc.notes || []).slice().sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); })
      .map(function (x) { return JSON.stringify(x); }).join('|');
    return n + '##' + (doc.deleted || []).slice().sort().join(',');
  }
  function localDoc(){ return { version: 1, notes: B.store.getAll(), deleted: B.store.getDeleted() }; }

  async function sync(){
    var cfg = getConfig();
    if (!isConfigured(cfg)) throw new Error('未连接：请先在设置里填入令牌');
    var remote = await getFile(cfg);
    var merged = mergeDocs(remote.doc, localDoc());
    if (remote.missing || sig(remote.doc) !== sig(merged)) {
      try { await putFile(cfg, merged, remote.sha, 'bilibili-organizer: sync'); }
      catch (e) { var fresh = await getFile(cfg); merged = mergeDocs(fresh.doc, localDoc()); await putFile(cfg, merged, fresh.sha, 'bilibili-organizer: sync (retry)'); }
    }
    B.store.replaceAll(merged.notes); B.store.setDeleted(merged.deleted);
    return merged;
  }

  B.sync = { getConfig: getConfig, isConfigured: isConfigured, saveToken: saveToken, dataLabel: dataLabel, validate: validate, sync: sync };
})(window.BILI);
