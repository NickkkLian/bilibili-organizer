#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地抓 B 站视频「内容」并写进归档库（在你 Mac 上跑，住宅 IP 不被风控）。

给一个或多个 B 站链接/BV 号：
  - 元数据走 B 站公开接口（标题/简介/封面/UP主/分区/数据）；
  - 字幕优先用 yt-dlp 抓（含登录后的 AI 字幕，读你浏览器 cookie）；
  - 没字幕就下音频用 faster-whisper 本地转写；
  - 结果 upsert 进私有库 Database/bilibili.json（SSH 推送），网页版 A 立刻能看。

依赖（一次性）：
  pip3 install yt-dlp faster-whisper      # 不用 Homebrew、不用 ffmpeg
用法：
  python3 bili-fetch.py "https://www.bilibili.com/video/BVxxxx" [更多链接...]
可选环境变量：
  BILI_COOKIES_BROWSER=chrome   # 你登录 B 站的浏览器：chrome/safari/firefox/edge/arc/brave
  WHISPER_MODEL=small           # tiny/base/small/medium（越大越准越慢）
"""
import sys, os, re, json, subprocess, tempfile, shutil, datetime, secrets, urllib.request

REPO = "git@github.com:NickkkLian/Database.git"
DATA = "bilibili.json"
COOKIES_BROWSER = os.environ.get("BILI_COOKIES_BROWSER", "chrome")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
YTDLP = [sys.executable, "-m", "yt_dlp"]   # 走 python -m，免去 PATH 找不到 yt-dlp / 不用 Homebrew
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
    if j.get("code") != 0: raise SystemExit("B站接口报错: " + str(j.get("message")))
    d = j["data"]; st = d.get("stat", {}) or {}; ow = d.get("owner", {}) or {}
    return {
        "bvid": d.get("bvid", ""),
        "url": "https://www.bilibili.com/video/" + d.get("bvid", ""),
        "title": d.get("title", ""),
        "body": (d.get("desc") or "").strip(),
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
                     "--sub-langs", "ai-zh,zh-Hans,zh-CN,zh,en,all",
                     "-o", os.path.join(tmp, "%(id)s.%(ext)s"), url])   # 不转 srt，免依赖 ffmpeg
    subprocess.run(cmd, capture_output=True)
    subs = [f for f in os.listdir(tmp) if re.search(r"\.(srt|vtt|ass|json3?|srv3)$", f)]
    subs.sort(key=lambda f: (0 if "zh" in f else 1, f))       # 优先中文
    for f in subs:
        txt = extract_sub_text(os.path.join(tmp, f))
        if txt.strip(): return txt
    return ""

def whisper_transcribe(url, tmp):
    try:
        from faster_whisper import WhisperModel  # 仅在需要转写时导入
    except ImportError:
        raise SystemExit("没现成字幕，且未装转写引擎。要本地转写请先： pip3 install faster-whisper")
    audio = os.path.join(tmp, "audio.m4a")
    subprocess.run(ytdlp_cmd(["-f", "bestaudio", "-o", audio, url]), check=True)
    print(f"    本地转写中（模型 {WHISPER_MODEL}，可能几分钟）…", flush=True)
    model = WhisperModel(WHISPER_MODEL, device="auto", compute_type="auto")
    segments, _ = model.transcribe(audio, language="zh", vad_filter=True)
    return "\n".join(seg.text.strip() for seg in segments if seg.text.strip())

def upsert(notes_to_save):
    work = tempfile.mkdtemp(prefix="bilidb_")
    try:
        subprocess.run(["git", "clone", "--depth", "1", "--filter=blob:none", REPO, work], check=True, capture_output=True)
        path = os.path.join(work, DATA)
        doc = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"version": 1, "updatedAt": None, "notes": [], "deleted": []}
        doc.setdefault("notes", [])
        for note in notes_to_save:
            ex = next((n for n in doc["notes"] if n.get("bvid") == note["bvid"]), None)
            if ex:
                nid = ex.get("id"); ex.clear(); ex.update(note); ex["id"] = nid; ex["savedAt"] = now_iso()
            else:
                note["id"] = "b" + secrets.token_hex(5); note["savedAt"] = now_iso(); doc["notes"].insert(0, note)
        doc["updatedAt"] = now_iso()
        json.dump(doc, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        env = {**os.environ, "GIT_AUTHOR_NAME": "NickkkLian", "GIT_AUTHOR_EMAIL": "270510432+NickkkLian@users.noreply.github.com",
               "GIT_COMMITTER_NAME": "NickkkLian", "GIT_COMMITTER_EMAIL": "270510432+NickkkLian@users.noreply.github.com"}
        subprocess.run(["git", "-C", work, "add", DATA], check=True)
        msg = "bili local: " + (notes_to_save[0]["title"][:40] if notes_to_save else "update")
        subprocess.run(["git", "-C", work, "commit", "-q", "-m", msg], check=True, env=env)
        subprocess.run(["git", "-C", work, "push", "-q", "origin", "HEAD:main"], check=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)

def main(urls):
    done = []
    for u in urls:
        idtype, idval = extract_id(u)
        if not idtype: print(f"✗ 没识别到 BV/av：{u}"); continue
        print(f"▶ {idval} 抓元数据…", flush=True)
        note = bili_view(idtype, idval)
        print(f"  「{note['title']}」 分区 {note['tname']} · UP {note['author']}", flush=True)
        tmp = tempfile.mkdtemp(prefix="bilidl_")
        try:
            print("  找字幕…", flush=True)
            t = get_subtitle(note["url"], tmp)
            if t:
                print(f"  ✓ 拿到字幕 {len(t)} 字", flush=True)
            else:
                print("  无现成字幕 → 下音频转写…", flush=True)
                t = whisper_transcribe(note["url"], tmp)
                print(f"  ✓ 转写完成 {len(t)} 字", flush=True)
            note["transcript"] = t
        except Exception as e:
            print(f"  ⚠ 取内容失败：{e}（只存元数据）")
            note["transcript"] = ""
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        done.append(note)
    if done:
        print("⤴ 写入 Database/bilibili.json 并推送…", flush=True)
        upsert(done)
        print(f"✅ 完成 {len(done)} 个。打开 https://nickkklian.github.io/bilibili-organizer/ ⚙️同步后即可看到。")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    main(sys.argv[1:])
