# 本地抓取脚本 · bili-fetch.py

在你 **Mac** 上跑（住宅 IP，不会被 B 站风控）：给 B 站链接 → 抓元数据 + 字幕（没字幕就本地 whisper 转写）→ 写进私有库 `Database/bilibili.json`，网页版归档库直接显示。

## 一次性安装
```bash
brew install yt-dlp ffmpeg
pip3 install faster-whisper
```
（git + SSH 已配好，无需令牌。）

## 用法
```bash
python3 bili-fetch.py "https://www.bilibili.com/video/BV1xxxxxxx"
# 可一次多个链接
```
跑完去 https://nickkklian.github.io/bilibili-organizer/ 点 ⚙️ 同步，就能看到带「内容」的条目。

## 可选环境变量
- `BILI_COOKIES_BROWSER=chrome` —— 你登录 B 站的浏览器（chrome/safari/firefox/edge/arc/brave）。抓「登录后的 AI 字幕」要靠它读浏览器 cookie。
- `WHISPER_MODEL=small` —— 转写模型 tiny/base/small/medium（越大越准越慢）。

## 说明
- **有字幕的视频**：秒出（yt-dlp 直接抓，含 AI 字幕）。
- **没字幕的视频**：下音频本地转写，按视频长度耗时几分钟。
- 字幕/转写写进条目的 `transcript` 字段；元数据与网页版一致（同分区归类）。

## 网页版（不用碰终端）✨
装好上面的依赖后，**双击 `启动.command`** → 浏览器自动打开本地页面 → 粘 B 站链接点「抓取」，看着进度走完即写进归档库（抓完去网页归档库点 ⚙️ 同步）。关掉弹出的小窗口即停止。
> 首次若提示「来自互联网、无法打开」，右键 →「打开」一次即可；用 `git clone` 拿的不会有此提示。
