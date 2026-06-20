/* 本地收藏库（localStorage 缓存）。云同步见 sync.js，二者共用此处数据。 */
window.BILI = window.BILI || {};
(function (B) {
  'use strict';
  var KEY = 'bili_notes_v1';
  var DKEY = 'bili_deleted_v1';   // 删除墓碑，避免多设备同步时被远端「复活」

  function getAll(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function setAll(list){ localStorage.setItem(KEY, JSON.stringify(list)); }
  function getDeleted(){ try { return JSON.parse(localStorage.getItem(DKEY) || '[]'); } catch (e) { return []; } }
  function setDeleted(ids){ localStorage.setItem(DKEY, JSON.stringify(Array.from(new Set(ids)))); }
  function addDeleted(ids){ setDeleted(getDeleted().concat(ids)); }

  function save(note){
    var list = getAll();
    var idx = note.bvid ? list.findIndex(function (n) { return n.bvid && n.bvid === note.bvid; }) : -1;
    var record = Object.assign({}, note, {
      id: note.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      savedAt: new Date().toISOString()
    });
    if (idx !== -1) list[idx] = Object.assign({}, list[idx], record, { id: list[idx].id });
    else list.unshift(record);
    setAll(list);
    return record;
  }
  function remove(id){ setAll(getAll().filter(function (n) { return n.id !== id; })); addDeleted([id]); }
  function clear(){ addDeleted(getAll().map(function (n) { return n.id; })); setAll([]); }
  function replaceAll(notes){ setAll(notes || []); }

  // ---------- 合集（AI 整理出的多视频综合长文） ----------
  var CKEY = 'bili_comps_v1';
  var CDKEY = 'bili_comps_deleted_v1';
  function getComps(){ try { return JSON.parse(localStorage.getItem(CKEY) || '[]'); } catch (e) { return []; } }
  function setComps(list){ localStorage.setItem(CKEY, JSON.stringify(list)); }
  function getCompsDeleted(){ try { return JSON.parse(localStorage.getItem(CDKEY) || '[]'); } catch (e) { return []; } }
  function setCompsDeleted(ids){ localStorage.setItem(CDKEY, JSON.stringify(Array.from(new Set(ids)))); }
  function saveComp(comp){
    var list = getComps();
    var rec = Object.assign({}, comp, { id: comp.id || ('c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), savedAt: new Date().toISOString() });
    var idx = list.findIndex(function (c) { return c.id === rec.id; });
    if (idx !== -1) list[idx] = rec; else list.unshift(rec);
    setComps(list);
    return rec;
  }
  function removeComp(id){ setComps(getComps().filter(function (c) { return c.id !== id; })); setCompsDeleted(getCompsDeleted().concat([id])); }
  function replaceAllComps(list){ setComps(list || []); }

  B.store = {
    getAll: getAll, save: save, remove: remove, clear: clear,
    getDeleted: getDeleted, setDeleted: setDeleted, replaceAll: replaceAll,
    getComps: getComps, saveComp: saveComp, removeComp: removeComp, replaceAllComps: replaceAllComps,
    getCompsDeleted: getCompsDeleted, setCompsDeleted: setCompsDeleted
  };
})(window.BILI);
