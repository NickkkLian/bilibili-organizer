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

  B.store = {
    getAll: getAll, save: save, remove: remove, clear: clear,
    getDeleted: getDeleted, setDeleted: setDeleted, replaceAll: replaceAll
  };
})(window.BILI);
