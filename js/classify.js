/* 分类：直接用 B 站「分区」(tname) 当类目，配套 emoji；tname 缺失时按关键词兜底。 */
window.BILI = window.BILI || {};
(function (B) {
  'use strict';
  var EMOJI = {
    '游戏':'🎮','单机游戏':'🎮','网络游戏':'🎮','手机游戏':'🎮','电子竞技':'🎮','桌游棋牌':'🎲','音游':'🎮',
    '知识':'📚','科学科普':'🔬','社科·法律·心理':'🧠','人文历史':'🏛️','财经商业':'📈','校园学习':'🎓','职业职场':'💼','野生技能协会':'🛠️','科学·探索·自然':'🔬',
    '科技':'💻','数码':'📱','软件应用':'💻','计算机技术':'💻','极客DIY':'🔧','手机平板':'📱','电脑装机':'🖥️',
    '生活':'🌿','日常':'📔','美食':'🍜','美食圈':'🍜','动物圈':'🐱','手工':'✂️','绘画':'🎨','运动':'🏀','健身':'🏋️','汽车':'🚗','家居房产':'🛋️','亲子':'🍼','出行':'✈️','三农':'🌾',
    '音乐':'🎵','音乐综合':'🎵','翻唱':'🎤','演奏':'🎸','音乐现场':'🎫','MV':'🎬',
    '影视':'🎬','影视杂谈':'🎬','影视剪辑':'🎞️','电影':'🎞️','电视剧':'📺','纪录片':'🎥','预告·资讯':'📰',
    '动画':'🌸','番剧':'📺','国创':'🐉','MAD·AMV':'🌸','MMD·3D':'🧊',
    '鬼畜':'🤪','舞蹈':'💃','时尚':'👗','美妆护肤':'💄','穿搭分享':'👗',
    '娱乐':'🎉','综艺':'🎉','娱乐杂谈':'🎉','明星综合':'🌟','搞笑':'😂','vlog':'📹','Vlog':'📹',
    '资讯':'📰','热点':'📰','社会':'📰','环球':'🌍',
    '设计·创意':'🎨','广告':'📣'
  };
  // B 站分区名英译（仅显示层；存储的 note.category / tname 始终是中文，不动；缺失则回退中文名）
  var CAT_EN = {
    '游戏':'Gaming','单机游戏':'Single-player','网络游戏':'Online games','手机游戏':'Mobile games','电子竞技':'Esports','桌游棋牌':'Board games','音游':'Rhythm games',
    '知识':'Knowledge','科学科普':'Science','社科·法律·心理':'Social science','人文历史':'History','财经商业':'Finance & Business','校园学习':'Study','职业职场':'Career','野生技能协会':'DIY skills','科学·探索·自然':'Science & Nature',
    '科技':'Tech','数码':'Digital','软件应用':'Software','计算机技术':'Computing','极客DIY':'Geek DIY','手机平板':'Phones & Tablets','电脑装机':'PC builds',
    '生活':'Life','日常':'Daily','美食':'Food','美食圈':'Food','动物圈':'Animals','手工':'Handcraft','绘画':'Drawing','运动':'Sports','健身':'Fitness','汽车':'Cars','家居房产':'Home','亲子':'Parenting','出行':'Travel','三农':'Rural life',
    '音乐':'Music','音乐综合':'Music','翻唱':'Covers','演奏':'Performance','音乐现场':'Live music','MV':'MV',
    '影视':'Film & TV','影视杂谈':'Film talk','影视剪辑':'Film edits','电影':'Movies','电视剧':'TV series','纪录片':'Documentary','预告·资讯':'Trailers & News',
    '动画':'Anime','番剧':'Anime series','国创':'Chinese anime','MAD·AMV':'MAD·AMV','MMD·3D':'MMD·3D',
    '鬼畜':'Kichiku','舞蹈':'Dance','时尚':'Fashion','美妆护肤':'Beauty','穿搭分享':'Outfits',
    '娱乐':'Entertainment','综艺':'Variety','娱乐杂谈':'Ent. talk','明星综合':'Celebrities','搞笑':'Comedy','vlog':'Vlog','Vlog':'Vlog',
    '资讯':'News','热点':'Hot topics','社会':'Society','环球':'Global',
    '设计·创意':'Design','广告':'Ads','其它':'Other','其他':'Other'
  };
  function catLabel(name){
    var en = CAT_EN[name];
    return (B.i18n && B.i18n.lang === 'en' && en) ? en : name;
  }

  function emojiFor(tname){
    if (!tname) return '📺';
    if (EMOJI[tname]) return EMOJI[tname];
    var keys = Object.keys(EMOJI);
    for (var i = 0; i < keys.length; i++) { if (tname.indexOf(keys[i]) !== -1 || keys[i].indexOf(tname) !== -1) return EMOJI[keys[i]]; }
    return '📺';
  }
  function classify(note){
    var name = note.category || note.tname || '其它';
    var primary = { name: name, emoji: note.categoryEmoji || emojiFor(name) };
    return { primary: primary, ranked: [primary] };
  }
  B.classify = classify;
  B.emojiFor = emojiFor;
  B.catLabel = catLabel;
})(window.BILI);
