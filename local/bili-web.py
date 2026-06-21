#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
B 站内容抓取 · 本地网页版。在你 Mac 上跑，浏览器里操作，不用碰终端。
启动后自动开浏览器 → 粘 B 站链接 → 看着进度抓字幕/转写 → 写进 Database/bilibili.json。

依赖（一次性）：  pip3 install yt-dlp faster-whisper      （不用 Homebrew、不用 ffmpeg）
启动：           python3 bili-web.py     （或双击同目录的「启动.command」）
"""
import sys, os, re, json, subprocess, tempfile, shutil, datetime, secrets, urllib.request, urllib.parse, webbrowser, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REPO = "git@github.com:NickkkLian/Database.git"
DATA = "bilibili.json"
PORT = int(os.environ.get("BILI_PORT", "8765"))
COOKIES_BROWSER = os.environ.get("BILI_COOKIES_BROWSER", "chrome")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
YTDLP = [sys.executable, "-m", "yt_dlp"]   # 走 python -m，免去 PATH 上找不到 yt-dlp 二进制 / 不用 Homebrew
def ytdlp_cmd(extra):
    c = list(YTDLP)
    if COOKIES_BROWSER: c += ["--cookies-from-browser", COOKIES_BROWSER]
    return c + extra

def now_iso(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def fmt_dur(sec):
    sec = int(sec or 0); h, m, s = sec // 3600, sec % 3600 // 60, sec % 60
    return (f"{h}:{m:02d}" if h else f"{m}") + f":{s:02d}"

def extract_id(s):
    m = re.search(r"BV[0-9A-Za-z]{8,12}", s)
    if m: return ("bvid", m.group(0))
    m = re.search(r"av(\d+)", s, re.I)
    if m: return ("aid", m.group(1))
    if s.strip().isdigit(): return ("aid", s.strip())
    return (None, None)

def bili_view(idtype, idval):
    url = "https://api.bilibili.com/x/web-interface/view?" + ("bvid=" + idval if idtype == "bvid" else "aid=" + idval)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"})
    j = json.load(urllib.request.urlopen(req, timeout=20))
    if j.get("code") != 0: raise RuntimeError("B站接口报错: " + str(j.get("message")))
    d = j["data"]; st = d.get("stat", {}) or {}; ow = d.get("owner", {}) or {}
    return {
        "bvid": d.get("bvid", ""), "url": "https://www.bilibili.com/video/" + d.get("bvid", ""),
        "title": d.get("title", ""), "body": (d.get("desc") or "").strip(),
        "cover": (d.get("pic") or "").replace("http:", "https:"),
        "author": ow.get("name", ""), "authorMid": ow.get("mid", ""),
        "tname": d.get("tname", ""), "tid": d.get("tid", ""), "cid": d.get("cid", ""),
        "duration": d.get("duration", 0), "durationText": fmt_dur(d.get("duration", 0)),
        "pubdate": datetime.date.fromtimestamp(d["pubdate"]).isoformat() if d.get("pubdate") else "",
        "stat": {k: st.get(k, 0) for k in ("view", "like", "coin", "favorite", "danmaku", "reply")},
        "source": "bili",
    }

def extract_sub_text(path):
    raw = open(path, encoding="utf-8", errors="ignore").read()
    if path.endswith((".json", ".json3", ".srv3")):          # B 站 AI 字幕常是 json
        try:
            body = (json.loads(raw) or {}).get("body") or []
            txt = "\n".join((seg.get("content") or "").strip() for seg in body if (seg.get("content") or "").strip())
            if txt.strip(): return txt
        except Exception: pass
    out = []                                                  # srt / vtt / ass 兜底按行
    for ln in raw.splitlines():
        ln = ln.strip()
        if not ln or ln.isdigit() or "-->" in ln: continue
        if ln == "WEBVTT" or ln.startswith(("NOTE", "Kind:", "Language:")): continue
        ln = re.sub(r"<[^>]+>", "", ln).strip()               # 去 <c>/<时间戳> 标签
        if ln and (not out or out[-1] != ln): out.append(ln)
    return "\n".join(out)

def get_subtitle(url, tmp):
    cmd = ytdlp_cmd(["--skip-download", "--write-subs", "--write-auto-subs",
                     "--sub-langs", "ai-zh,zh-Hans,zh-Hant,zh-CN,zh",   # 只要中文！别用 all（会混进 ai-zh-ar 等机翻）
                     "-o", os.path.join(tmp, "%(id)s.%(ext)s"), url])   # 不转 srt，免依赖 ffmpeg
    subprocess.run(cmd, capture_output=True)
    subs = [f for f in os.listdir(tmp) if re.search(r"\.(srt|vtt|ass|json3?|srv3)$", f)]
    subs.sort(key=lambda f: (0 if "zh" in f else 1, f))
    best = ""
    for f in subs:
        txt = extract_sub_text(os.path.join(tmp, f))
        if not txt.strip(): continue
        if re.search(r"[一-鿿]", txt): return txt     # 含汉字 → 就它了
        best = best or txt                                    # 兜底：万一只有外文字幕
    return best

def whisper_transcribe(url, tmp, log):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("这个视频没有现成字幕；要本地转写请先装： pip3 install faster-whisper")
    audio = os.path.join(tmp, "audio.m4a")
    subprocess.run(ytdlp_cmd(["-f", "bestaudio", "-o", audio, url]), check=True, capture_output=True)
    log(f"载入模型 {WHISPER_MODEL}（首次会下载，约几百 MB）…")
    model = WhisperModel(WHISPER_MODEL, device="auto", compute_type="auto")
    segments, _ = model.transcribe(audio, language="zh", vad_filter=True)
    parts = []
    for i, seg in enumerate(segments):
        t = seg.text.strip()
        if t: parts.append(t)
        if (i + 1) % 10 == 0: log(f"…已转写 {i + 1} 段")
    return "\n".join(parts)

PENDING = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_pending.json")
def load_pending():
    try: return json.load(open(PENDING, encoding="utf-8"))
    except Exception: return []
def save_pending(note):
    items = [n for n in load_pending() if n.get("bvid") != note.get("bvid")]
    items.append(note)
    json.dump(items, open(PENDING, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
def clear_pending():
    try: os.remove(PENDING)
    except OSError: pass

def _apply(doc, note):
    doc.setdefault("notes", [])
    ex = next((n for n in doc["notes"] if n.get("bvid") == note.get("bvid")), None)
    if ex:
        nid = ex.get("id"); ex.clear(); ex.update(note); ex["id"] = nid; ex["savedAt"] = now_iso()
    else:
        note = dict(note); note["id"] = note.get("id") or ("b" + secrets.token_hex(5)); note["savedAt"] = now_iso(); doc["notes"].insert(0, note)

def _git(args, **kw):
    p = subprocess.run(["git"] + args, capture_output=True, text=True, **kw)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or "").strip()[:400])
    return p

def upsert(note):
    work = tempfile.mkdtemp(prefix="bilidb_")
    try:
        try:
            _git(["clone", "--depth", "1", "--filter=blob:none", REPO, work])
        except Exception as e:
            save_pending(note)
            raise RuntimeError("拉取 Database 失败（SSH/网络）：" + str(e) + "\n→ 这条含字幕已暂存 local/_pending.json，不会丢；修好后下次抓取会自动补推。")
        path = os.path.join(work, DATA)
        doc = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"version": 1, "updatedAt": None, "notes": [], "deleted": []}
        for n in load_pending() + [note]:           # 先把上次没推成功的一起补上
            _apply(doc, n)
        doc["updatedAt"] = now_iso()
        json.dump(doc, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        env = {**os.environ, "GIT_AUTHOR_NAME": "NickkkLian", "GIT_AUTHOR_EMAIL": "270510432+NickkkLian@users.noreply.github.com",
               "GIT_COMMITTER_NAME": "NickkkLian", "GIT_COMMITTER_EMAIL": "270510432+NickkkLian@users.noreply.github.com"}
        _git(["-C", work, "add", DATA])
        _git(["-C", work, "commit", "-m", "bili local: " + note["title"][:40]], env=env)
        try:
            _git(["-C", work, "push", "origin", "HEAD:main"])
        except Exception as e:
            save_pending(note)
            raise RuntimeError("git push 失败：" + str(e) + "\n→ 这条含字幕已暂存 local/_pending.json，不会丢；修好推送权限后下次抓取会自动补推。")
        clear_pending()                              # 全部推送成功 → 清空暂存
    finally:
        shutil.rmtree(work, ignore_errors=True)

def process(url, log):
    idtype, idval = extract_id(url)
    if not idtype: raise RuntimeError("没识别到 BV/av 号")
    log("抓元数据…")
    note = bili_view(idtype, idval)
    log(f"「{note['title']}」 分区 {note['tname']} · UP {note['author']}")
    tmp = tempfile.mkdtemp(prefix="bilidl_")
    try:
        log("找字幕…")
        t = get_subtitle(note["url"], tmp)
        if t:
            log(f"✓ 拿到现成字幕 {len(t)} 字")
        else:
            log("无现成字幕 → 下音频本地转写（按时长，可能几分钟）…")
            t = whisper_transcribe(note["url"], tmp, log)
            log(f"✓ 转写完成 {len(t)} 字")
        note["transcript"] = t
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    log("写入 Database/bilibili.json 并推送…")
    upsert(note)
    log("✅ 完成")
    return note

PAGE = """<!doctype html><html lang=zh-CN><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1"><title>B站内容抓取 · 本地</title>
<style>
:root{--pink:#fb7299}*{box-sizing:border-box}
body{margin:0;background:#f6f7f9;color:#18191c;font:15px/1.6 -apple-system,"PingFang SC",sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:28px 16px}
h1{font-size:24px;margin:.2em 0}h1 small{color:#9499a0;font-size:13px;font-weight:400}
.sub{color:#9499a0;margin:0 0 16px}
.row{display:flex;gap:10px}.row input{flex:1;border:1px solid #eceef0;border-radius:10px;padding:12px;font-size:14px}
.row input:focus{outline:none;border-color:var(--pink)}
button{border:none;border-radius:10px;padding:12px 18px;background:var(--pink);color:#fff;font-size:14px;cursor:pointer}
button:disabled{opacity:.6;cursor:not-allowed}
pre#log{background:#0f1115;color:#d6deeb;border-radius:10px;padding:12px;font-size:12.5px;min-height:40px;max-height:280px;overflow:auto;white-space:pre-wrap;margin:14px 0}
.card{background:#fff;border:1px solid #eceef0;border-radius:12px;padding:16px;margin-top:8px}
.card .meta{color:#9499a0;font-size:13px;margin:4px 0 8px}
.card pre{white-space:pre-wrap;background:#fafbfc;border:1px solid #eceef0;border-radius:8px;padding:10px;font:13px/1.6 inherit;max-height:300px;overflow:auto}
.card a{color:var(--pink)}.foot{color:#9499a0;font-size:12px;margin-top:18px}.foot a{color:var(--pink)}
</style></head><body><div class=wrap>
<h1>📺 B 站内容抓取 <small>本地</small></h1>
<p class=sub>粘贴 B 站视频链接 → 本机抓字幕 / 转写 → 写进你的归档库。有字幕的秒出，没字幕的本地转写要几分钟。</p>
<div class=row><input id=u placeholder="https://www.bilibili.com/video/BV…  或 BV 号" autofocus><button id=go>抓取</button></div>
<pre id=log></pre><div id=result></div>
<p class=foot>本工具在你电脑本地运行（localhost），不上传任何东西。浏览/整理用 <a href="https://nickkklian.github.io/bilibili-organizer/" target=_blank>网页归档库 ↗</a>（抓完点 ⚙️ 同步即可看到）。</p>
</div><script>
var log=document.getElementById('log'),result=document.getElementById('result'),go=document.getElementById('go'),u=document.getElementById('u');
function esc(s){return String(s==null?'':s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
function run(){var url=u.value.trim();if(!url)return;log.textContent='';result.innerHTML='';go.disabled=true;
 var es=new EventSource('/stream?url='+encodeURIComponent(url));
 es.addEventListener('log',function(e){log.textContent+=JSON.parse(e.data)+'\\n';log.scrollTop=log.scrollHeight;});
 es.addEventListener('fail',function(e){log.textContent+='✗ '+JSON.parse(e.data)+'\\n';es.close();go.disabled=false;});
 es.addEventListener('done',function(e){var n=JSON.parse(e.data);
   result.innerHTML='<div class=card><b>'+esc(n.title)+'</b><div class=meta>'+esc(n.tname||'')+' · UP '+esc(n.author||'')+' · 内容 '+((n.transcript||'').length)+' 字</div><pre>'+esc(n.transcript||'(没拿到内容)')+'</pre><a href="https://nickkklian.github.io/bilibili-organizer/" target=_blank>去归档库看 →</a></div>';
   es.close();go.disabled=false;u.value='';});
 es.onerror=function(){es.close();go.disabled=false;};
}
go.onclick=run;u.addEventListener('keydown',function(e){if(e.key==='Enter')run();});
</script></body></html>"""

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == "/" or self.path.startswith("/?"):
            body = PAGE.encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if self.path.startswith("/stream"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            url = (qs.get("url") or [""])[0]
            self.send_response(200); self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache"); self.end_headers()
            def emit(ev, data):
                try:
                    self.wfile.write(("event: " + ev + "\ndata: " + json.dumps(data, ensure_ascii=False) + "\n\n").encode("utf-8")); self.wfile.flush()
                except Exception: pass
            try:
                note = process(url, lambda line: emit("log", line))
                emit("done", note)
            except Exception as e:
                emit("fail", str(e))
            return
        self.send_response(404); self.end_headers()

def main():
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    addr = f"http://127.0.0.1:{PORT}/"
    print(f"B站内容抓取本地版已启动：{addr}\n（关掉这个窗口即停止。）")
    threading.Timer(0.8, lambda: webbrowser.open(addr)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
