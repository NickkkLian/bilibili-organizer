/* 抓取 B 站视频信息：链接 → BV/av → JSONP 调公开接口 view（<script> 标签加载，绕过 CORS）→ 整理成条目。
   只取元数据 + 简介(desc)。视频「口播字幕 / AI 总结」由 Cloudflare Worker（存 SESSDATA + wbi 签名）后端补，见 README。 */
window.BILI = window.BILI || {};
(function (B) {
  'use strict';
  var T = (window.BILI.i18n && window.BILI.i18n.T) || function(zh,en){return zh;};

  function extractId(input){
    var s = String(input || '').trim();
    var bm = s.match(/BV[0-9A-Za-z]{8,12}/);
    if (bm) return { type: 'bvid', id: bm[0] };
    var am = s.match(/av(\d+)/i);
    if (am) return { type: 'aid', id: am[1] };
    if (/^\d+$/.test(s)) return { type: 'aid', id: s };
    return null;
  }

  // JSONP：B 站 view 接口支持 &jsonp=jsonp&callback=，用 <script> 加载彻底绕过 CORS
  function jsonp(url){
    return new Promise(function (resolve, reject) {
      var cb = '__biliJP_' + Date.now() + Math.floor(Math.random() * 1e6);
      var s = document.createElement('script');
      var to = setTimeout(function () { cleanup(); reject(new Error(T('请求超时','Request timed out'))); }, 15000);
      function cleanup(){ clearTimeout(to); try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (s.parentNode) s.parentNode.removeChild(s); }
      window[cb] = function (data) { cleanup(); resolve(data); };
      s.onerror = function () { cleanup(); reject(new Error(T('加载失败（网络或被拦截）','Load failed (network or blocked)'))); };
      s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'jsonp=jsonp&callback=' + cb;
      document.head.appendChild(s);
    });
  }

  function pad(n){ return String(n).length < 2 ? '0' + n : '' + n; }
  function fmtDuration(sec){ sec = +sec || 0; var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(s); }

  async function fetchVideo(rawInput){
    var idObj = extractId(rawInput);
    if (!idObj) throw new Error(T('没识别到 B 站视频（需要 BV 号或 bilibili.com/video/BV… 链接）','No Bilibili video detected (need a BV id or bilibili.com/video/BV… link)'));
    var api = 'https://api.bilibili.com/x/web-interface/view?' + (idObj.type === 'bvid' ? 'bvid=' : 'aid=') + encodeURIComponent(idObj.id);
    var res = await jsonp(api);
    if (!res || res.code !== 0) throw new Error(T('B 站接口：','Bilibili API: ') + ((res && res.message) || T('未知错误','unknown error')) + T('（短链请改用完整 bilibili.com/video/BV… 链接）',' (for short links, use the full bilibili.com/video/BV… link)'));
    var d = res.data || {}, stat = d.stat || {};
    return {
      bvid: d.bvid || (idObj.type === 'bvid' ? idObj.id : ''),
      url: d.bvid ? ('https://www.bilibili.com/video/' + d.bvid) : ('https://www.bilibili.com/video/av' + (d.aid || idObj.id)),
      title: d.title || '',
      body: (d.desc || '').trim(),                       // 简介；以后字幕/AI总结写进 transcript
      cover: d.pic ? d.pic.replace(/^http:/, 'https:') : '',
      author: (d.owner && d.owner.name) || '',
      authorMid: (d.owner && d.owner.mid) || '',
      tname: d.tname || '',
      tid: d.tid || '',
      cid: d.cid || '',
      duration: d.duration || 0,
      durationText: fmtDuration(d.duration),
      pubdate: d.pubdate ? new Date(d.pubdate * 1000).toISOString().slice(0, 10) : '',
      stat: { view: stat.view || 0, like: stat.like || 0, coin: stat.coin || 0, favorite: stat.favorite || 0, danmaku: stat.danmaku || 0, reply: stat.reply || 0 },
      transcript: '',
      source: 'bili'
    };
  }

  B.extractId = extractId;
  B.fetchVideo = fetchVideo;
})(window.BILI);
