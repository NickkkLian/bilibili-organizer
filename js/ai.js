/* AI 整理：调用 Claude Messages API，把 B 站视频的「口播字幕转写」整理成一篇分板块的通顺长文（合集）。
   纯前端直连 api.anthropic.com（需 anthropic-dangerous-direct-browser-access 头）。
   API 令牌只存本机浏览器（localStorage 键 bili_ai_config），绝不进仓库 / 硬编码。 */
window.BILI = window.BILI || {};
(function (B) {
  'use strict';
  var T = (window.BILI.i18n && window.BILI.i18n.T) || function(zh,en){return zh;};

  var KEY = 'bili_ai_config';
  var DEFAULT_MODEL = 'claude-opus-4-8';
  var MODELS = [
    { id: 'claude-opus-4-8', name: 'Opus 4.8（最强 · 推荐）', nameEn: 'Opus 4.8 (Best · Recommended)' },
    { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6（更快更省）', nameEn: 'Sonnet 4.6 (Faster & cheaper)' },
    { id: 'claude-haiku-4-5', name: 'Haiku 4.5（最便宜）', nameEn: 'Haiku 4.5 (Cheapest)' }
  ];

  function getConfig() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { apiKey: c.apiKey || '', model: c.model || DEFAULT_MODEL };
    } catch (e) { return { apiKey: '', model: DEFAULT_MODEL }; }
  }
  function saveConfig(apiKey, model) {
    var cur = getConfig();
    var next = { apiKey: apiKey != null ? apiKey : cur.apiKey, model: model || cur.model || DEFAULT_MODEL };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  }
  function isReady() { return Boolean(getConfig().apiKey); }

  // 结构化输出，保证拿到可解析的分板块 JSON（仅用受支持的 schema 特性）
  var SCHEMA = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      topic: { type: 'string' },
      summary: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            content: { type: 'string' },
            source_indices: { type: 'array', items: { type: 'integer' } }
          },
          required: ['heading', 'content', 'source_indices'],
          additionalProperties: false
        }
      }
    },
    required: ['title', 'topic', 'summary', 'sections'],
    additionalProperties: false
  };

  var SYSTEM =
    '你是一名中文内容编辑。用户提供的是 B 站视频的「口播字幕自动转写」——没有标点、断句零碎、常有口语重复、口头禅和同音错别字。\n' +
    '任务：把它整理成结构清晰、通顺可读的中文长文（合集），让人不看视频也能读懂内容。\n' +
    '要求：\n' +
    '1. 补全标点、合并碎句、修正明显的同音错别字（如「非对称」误作「非对城」），删掉「呃 / 那个 / 就是说」等口水词与重复表达。\n' +
    '2. 按内容逻辑分若干板块（section），每个板块一个小标题，用通顺的书面中文重写；忠于原意、不要逐字照抄，也不要编造原文里没有的信息。\n' +
    '3. 保留有价值的具体信息：数据、专有名词、人名 / 产品名、步骤、案例、金额、链接等。\n' +
    '4. 有多个视频时，找出共同主题，跨视频归纳合并、去重，同类内容并到同一板块。\n' +
    '5. source_indices 用从 1 开始的编号，标出该板块主要来自哪几个视频（对应输入里的【1】【2】…）。\n' +
    '6. 一律用简体中文。title 简洁有信息量；summary 用两三句话概括全文核心要点。';

  function videosBlock(vids) {
    return vids.map(function (v, i) {
      var t = (v.transcript || '').slice(0, 30000);
      return '【' + (i + 1) + '】标题：' + (v.title || '（无）') +
        '\nUP主：' + (v.author || '（无）') + '　分区：' + (v.tname || '（无）') +
        '\n链接：' + (v.url || '（无）') +
        '\n字幕转写：\n' + (t || '（无字幕）');
    }).join('\n\n———\n\n');
  }

  // vids: [{title, author, tname, transcript, url}]；existing: 已有合集对象（追加整合时传入）或 null
  async function consolidate(vids, existing) {
    var cfg = getConfig();
    if (!cfg.apiKey) throw new Error(T('未设置 AI 令牌','AI token not set'));
    if (!vids || !vids.length) throw new Error(T('没有可整理的视频','No videos to consolidate'));

    var userText = '';
    if (existing) {
      userText += '这是一篇已有的合集，请把下面的新视频整合进去（可补充到已有板块，或新增板块），最后返回整合后的【完整合集】（包含原有内容）：\n\n' +
        '已有合集标题：' + (existing.title || '') + '\n' +
        (existing.sections || []).map(function (s) { return '## ' + s.heading + '\n' + s.content; }).join('\n\n') +
        '\n\n———\n\n';
    }
    userText += '以下是 ' + vids.length + ' 个 B 站视频的字幕转写：\n\n' + videosBlock(vids);

    var body = {
      model: cfg.model || DEFAULT_MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userText }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } }
    };

    var r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(body)
      });
    } catch (e) { throw new Error(T('网络错误：','Network error: ') + e.message); }

    if (r.status === 401) throw new Error(T('API 令牌无效或已过期 (401)','API token invalid or expired (401)'));
    if (r.status === 400) { var t = await r.text().catch(function () { return ''; }); throw new Error(T('请求被拒 (400) ','Request rejected (400) ') + t.slice(0, 160)); }
    if (r.status === 429) throw new Error(T('触发频率限制 (429)，请稍后再试','Rate limited (429), please retry later'));
    if (!r.ok) throw new Error(T('请求失败 HTTP ','Request failed HTTP ') + r.status);

    var j = await r.json();
    if (j.stop_reason === 'refusal') throw new Error(T('模型拒绝了该请求','The model refused the request'));
    var textBlock = (j.content || []).filter(function (b) { return b.type === 'text'; })[0];
    if (!textBlock) throw new Error(T('未返回内容','No content returned') + (j.stop_reason === 'max_tokens' ? T('（输出过长，请减少视频数量）',' (output too long, reduce the number of videos)') : ''));
    var data;
    try { data = JSON.parse(textBlock.text); }
    catch (e) { throw new Error(T('解析返回的 JSON 失败','Failed to parse returned JSON')); }
    if (!data || !Array.isArray(data.sections)) throw new Error(T('返回结构不完整','Returned structure incomplete'));
    return data;
  }

  B.ai = {
    getConfig: getConfig, saveConfig: saveConfig, isReady: isReady,
    consolidate: consolidate, MODELS: MODELS, DEFAULT_MODEL: DEFAULT_MODEL
  };
})(window.BILI);
