# 📺 B 站视频整理归档 · Bilibili Organizer

粘贴一个 B 站视频链接，自动抓取**视频信息**、按 **B 站分区**归档，存进收藏库，支持搜索、筛选、导出（Markdown / JSON）与多设备云同步。

纯前端、零构建、零后端 —— 一个 `index.html` 即可运行，直接部署到 GitHub Pages。收藏默认存浏览器 `localStorage`；填入 GitHub 令牌后同步到私有仓库、多设备共享。

## ✨ 功能

- **链接整理**：粘贴 `bilibili.com/video/BV…` 或 BV 号，自动抓取标题、简介、封面、UP 主、分区、播放/点赞/投币/收藏/弹幕、时长、发布日期。
- **按分区归档**：直接用 B 站「分区」(tname) 作为类目，自动分类、筛选。
- **归档库**：关键词搜索、分区筛选、复制为 Markdown、删除、一键导出（MD / JSON）。
- **多设备云同步**：经 GitHub API 把归档库读写到私有仓库 `Database/bilibili.json`，与导航站共用 `pha-config` 令牌；合并「并集 + 墓碑 + 最新者胜」。不填令牌即纯本地。

## 🧩 工作原理

B 站有公开 JSON 接口 `api.bilibili.com/x/web-interface/view`。浏览器跨域被 CORS 拦，所以本工具用 **JSONP**（`<script>` 标签 + `&jsonp=jsonp&callback=`）直连，**无需代理、无需登录**即可拿到元数据。

## ⚠️ 关于「视频内容（口播字幕）」

视频里**说了什么**（字幕 / 转写）**纯静态站拿不到**：B 站字幕、AI 总结接口都要**登录 + wbi 签名**（未登录返回空 / `-403`）。

要拿真·字幕，需另接一个「读视频」后端（不在本仓库）：

- **Cloudflare Worker（推荐，免费）**：存你的 `SESSDATA` cookie + 做 wbi 签名 → 取 B 站现成**字幕 / AI 总结**。本归档库在手机上填链接即可调它。只对**有字幕/AI总结**的视频有效。
- **本地脚本 / 自托管**：`yt-dlp`（下字幕/音频）+ `whisper.cpp`（本地转写，任何视频，$0）写回 `bilibili.json`。

条目里预留了 `transcript` 字段，后端拿到字幕后填进去，归档库即显示。

## 🗂 结构

```
index.html        页面结构
styles.css        样式
js/classify.js    按 B 站分区归类
js/parse.js       JSONP 抓取视频信息
js/store.js       localStorage 归档库（含删除墓碑）
js/sync.js        GitHub API 云同步（私有仓库 Database/bilibili.json）
js/app.js         界面逻辑
```

## 📜 License

[MIT](LICENSE) © Zixi Lian (Nick)
