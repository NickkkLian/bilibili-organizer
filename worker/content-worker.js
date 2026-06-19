/* Cloudflare Worker —— B 站视频「内容」取数后端（字幕优先，AI 总结附带）。
 * 用站长的 SESSDATA（Worker 加密变量）+ wbi 签名调 B 站接口，带 CORS 返回，供归档库 A 调用。
 *
 * 部署（CF 控制台，手机也能弄）：
 *   1. Workers & Pages → Create → Worker → 命名（如 bili-content）→ Deploy。
 *   2. Edit code，把本文件整段粘进去，Deploy。
 *   3. 该 Worker → Settings → Variables and Secrets → Add → 类型 Secret，
 *      名字填 SESSDATA，值填你的 B 站 cookie 里的 SESSDATA（F12 → Application → Cookies → bilibili.com → SESSDATA）。Save & Deploy。
 *   4. 可选：Settings 加一个普通变量 TOKEN=随便一串，调用时带 ?key=该串，防别人乱用。
 *
 * 测试：浏览器开 https://<你的worker>.workers.dev/?bvid=BV1xxxxxxx
 *   → 返回 {hasSubtitle, transcript, summary, ...}。有字幕的视频才有 transcript。
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MIXIN_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];

/* ---- md5 (blueimp, 公共领域；wbi 签名要用，输入均为 ASCII) ---- */
function md5(s){
  function rl(n,c){return (n<<c)|(n>>>(32-c));}
  function au(x,y){var l=(x&0xFFFF)+(y&0xFFFF),m=(x>>16)+(y>>16)+(l>>16);return (m<<16)|(l&0xFFFF);}
  function cmn(q,a,b,x,t,s){return au(rl(au(au(a,q),au(x,t)),s),b);}
  function ff(a,b,c,d,x,s,t){return cmn((b&c)|((~b)&d),a,b,x,t,s);}
  function gg(a,b,c,d,x,s,t){return cmn((b&d)|(c&(~d)),a,b,x,t,s);}
  function hh(a,b,c,d,x,s,t){return cmn(b^c^d,a,b,x,t,s);}
  function ii(a,b,c,d,x,s,t){return cmn(c^(b|(~d)),a,b,x,t,s);}
  function b2h(n){var r='',j;for(j=0;j<=3;j++)r+=((n>>(j*8+4))&0x0F).toString(16)+((n>>(j*8))&0x0F).toString(16);return r;}
  function s2b(str){var b=[],i;for(i=0;i<str.length*8;i+=8)b[i>>5]|=(str.charCodeAt(i/8)&0xFF)<<(i%32);return b;}
  var x=s2b(s),len=s.length*8,a=1732584193,b=-271733879,c=-1732584194,d=271733878,i,olda,oldb,oldc,oldd;
  x[len>>5]|=0x80<<(len%32);x[(((len+64)>>>9)<<4)+14]=len;
  for(i=0;i<x.length;i+=16){olda=a;oldb=b;oldc=c;oldd=d;
    a=ff(a,b,c,d,x[i],7,-680876936);d=ff(d,a,b,c,x[i+1],12,-389564586);c=ff(c,d,a,b,x[i+2],17,606105819);b=ff(b,c,d,a,x[i+3],22,-1044525330);
    a=ff(a,b,c,d,x[i+4],7,-176418897);d=ff(d,a,b,c,x[i+5],12,1200080426);c=ff(c,d,a,b,x[i+6],17,-1473231341);b=ff(b,c,d,a,x[i+7],22,-45705983);
    a=ff(a,b,c,d,x[i+8],7,1770035416);d=ff(d,a,b,c,x[i+9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,-42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);
    a=ff(a,b,c,d,x[i+12],7,1804603682);d=ff(d,a,b,c,x[i+13],12,-40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);b=ff(b,c,d,a,x[i+15],22,1236535329);
    a=gg(a,b,c,d,x[i+1],5,-165796510);d=gg(d,a,b,c,x[i+6],9,-1069501632);c=gg(c,d,a,b,x[i+11],14,643717713);b=gg(b,c,d,a,x[i],20,-373897302);
    a=gg(a,b,c,d,x[i+5],5,-701558691);d=gg(d,a,b,c,x[i+10],9,38016083);c=gg(c,d,a,b,x[i+15],14,-660478335);b=gg(b,c,d,a,x[i+4],20,-405537848);
    a=gg(a,b,c,d,x[i+9],5,568446438);d=gg(d,a,b,c,x[i+14],9,-1019803690);c=gg(c,d,a,b,x[i+3],14,-187363961);b=gg(b,c,d,a,x[i+8],20,1163531501);
    a=gg(a,b,c,d,x[i+13],5,-1444681467);d=gg(d,a,b,c,x[i+2],9,-51403784);c=gg(c,d,a,b,x[i+7],14,1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);
    a=hh(a,b,c,d,x[i+5],4,-378558);d=hh(d,a,b,c,x[i+8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16,1839030562);b=hh(b,c,d,a,x[i+14],23,-35309556);
    a=hh(a,b,c,d,x[i+1],4,-1530992060);d=hh(d,a,b,c,x[i+4],11,1272893353);c=hh(c,d,a,b,x[i+7],16,-155497632);b=hh(b,c,d,a,x[i+10],23,-1094730640);
    a=hh(a,b,c,d,x[i+13],4,681279174);d=hh(d,a,b,c,x[i],11,-358537222);c=hh(c,d,a,b,x[i+3],16,-722521979);b=hh(b,c,d,a,x[i+6],23,76029189);
    a=hh(a,b,c,d,x[i+9],4,-640364487);d=hh(d,a,b,c,x[i+12],11,-421815835);c=hh(c,d,a,b,x[i+15],16,530742520);b=hh(b,c,d,a,x[i+2],23,-995338651);
    a=ii(a,b,c,d,x[i],6,-198630844);d=ii(d,a,b,c,x[i+7],10,1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);b=ii(b,c,d,a,x[i+5],21,-57434055);
    a=ii(a,b,c,d,x[i+12],6,1700485571);d=ii(d,a,b,c,x[i+3],10,-1894986606);c=ii(c,d,a,b,x[i+10],15,-1051523);b=ii(b,c,d,a,x[i+1],21,-2054922799);
    a=ii(a,b,c,d,x[i+8],6,1873313359);d=ii(d,a,b,c,x[i+15],10,-30611744);c=ii(c,d,a,b,x[i+6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21,1309151649);
    a=ii(a,b,c,d,x[i+4],6,-145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+2],15,718787259);b=ii(b,c,d,a,x[i+9],21,-343485551);
    a=au(a,olda);b=au(b,oldb);c=au(c,oldc);d=au(d,oldd);
  }
  return b2h(a)+b2h(b)+b2h(c)+b2h(d);
}

function biliGet(url, sessdata){
  return fetch(url, { headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/', 'Cookie': sessdata ? ('SESSDATA=' + sessdata) : '' } }).then(function (r) { return r.json(); });
}
async function getMixinKey(sessdata){
  var nav = await biliGet('https://api.bilibili.com/x/web-interface/nav', sessdata);
  var img = nav.data.wbi_img.img_url, sub = nav.data.wbi_img.sub_url;
  var raw = img.slice(img.lastIndexOf('/') + 1).split('.')[0] + sub.slice(sub.lastIndexOf('/') + 1).split('.')[0];
  var mix = ''; for (var i = 0; i < 32; i++) mix += raw[MIXIN_TAB[i]];
  return mix;
}
function encWbi(params, mixinKey){
  params.wts = Math.floor(Date.now() / 1000);
  var keys = Object.keys(params).sort();
  var q = keys.map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]).replace(/[!'()*]/g, '')); }).join('&');
  return q + '&w_rid=' + md5(q + mixinKey);
}
function json(obj, status){ return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } }); }

async function handle(url, sessdata){
  var bvid = url.searchParams.get('bvid'), aidQ = url.searchParams.get('aid');
  if (!bvid && !aidQ) return json({ error: '缺少 bvid 参数' }, 400);

  var view = await biliGet('https://api.bilibili.com/x/web-interface/view?' + (bvid ? ('bvid=' + bvid) : ('aid=' + aidQ)), sessdata);
  if (view.code !== 0) return json({ error: 'view 接口：' + view.message, code: view.code });
  var d = view.data, aid = d.aid, cid = d.cid, upMid = d.owner.mid;
  var mixin = await getMixinKey(sessdata);

  // 字幕：先试非 wbi 的 player/v2，没有再试 player/wbi/v2
  var subs = [], transcript = '', lang = '';
  try {
    var pl = await biliGet('https://api.bilibili.com/x/player/v2?aid=' + aid + '&cid=' + cid + '&bvid=' + d.bvid, sessdata);
    subs = (pl.data && pl.data.subtitle && pl.data.subtitle.subtitles) || [];
    if (!subs.length) {
      var pw = await biliGet('https://api.bilibili.com/x/player/wbi/v2?' + encWbi({ aid: aid, cid: cid, bvid: d.bvid }, mixin), sessdata);
      subs = (pw.data && pw.data.subtitle && pw.data.subtitle.subtitles) || [];
    }
    if (subs.length) {
      lang = subs[0].lan_doc || '';
      var su = subs[0].subtitle_url; if (su.indexOf('//') === 0) su = 'https:' + su;
      var sj = await (await fetch(su, { headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/' } })).json();
      transcript = (sj.body || []).map(function (x) { return x.content; }).join('\n');
    }
  } catch (e) { /* 字幕失败不致命 */ }

  // AI 总结（附带）
  var summary = '', outline = [];
  try {
    var cc = await biliGet('https://api.bilibili.com/x/web-interface/view/conclusion/get?' + encWbi({ aid: aid, cid: cid, up_mid: upMid }, mixin), sessdata);
    var mr = cc.data && cc.data.model_result;
    if (mr) { summary = mr.summary || ''; outline = mr.outline || []; }
  } catch (e) { /* 总结失败不致命 */ }

  return json({ bvid: d.bvid, title: d.title, hasSubtitle: subs.length > 0, subtitleLang: lang, transcript: transcript, summary: summary, outline: outline });
}

export default {
  async fetch(request, env){
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': '*' } });
    var url = new URL(request.url);
    if (env.TOKEN && url.searchParams.get('key') !== env.TOKEN) return json({ error: '需要正确的 ?key=' }, 401);
    if (!env.SESSDATA) return json({ error: '未配置 SESSDATA 变量' }, 500);
    try { return await handle(url, env.SESSDATA); } catch (e) { return json({ error: String((e && e.message) || e) }); }
  }
};
