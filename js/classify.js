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
})(window.BILI);
