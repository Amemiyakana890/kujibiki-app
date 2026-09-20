/* =========================================================
   app-core.js
   day1.html / day2.html から共通で読み込まれるロジック。
   演出（スクラッチ / ガチャ）は reveal-scratch.js / reveal-gacha.js が
   window.Kuji.startReveal / window.Kuji.hideRevealOverlay を
   このファイルの読み込み後に登録することで差し替わる。
   ========================================================= */
(function(){
  "use strict";

  /* ===================== データ層 ===================== */
  var CONFIG_KEY = "kujiConfig_v1";
  var STATE_KEY  = "kujiState_v1";
  var MUTE_KEY   = "kujiMuted_v1";
  // 抽選履歴（集計ページ用）。在庫リセット・全データ初期化の影響を受けないよう、
  // 在庫（STATE_KEY）とは別のキーに保存する。集計・CSV出力・リセットは statistics.js が担当。
  var STATS_KEY  = "kujiStats_v1";

  var TIER_COLORS = { A:"tier-A", B:"tier-B", C:"tier-C", D:"tier-D" };
  var TIER_HEX = { A:"#DA9A2E", B:"#33447A", C:"#12896F", D:"#D14A78" };
  function tierHex(id){ return TIER_HEX[id] || "#6b7280"; }

  function defaultConfig(){
    return {
      eventTitle: "抽選くじ",
      adminPassword: "kuji2026",
      prizes: [
        { id:"A", label:"A賞", name:"クオカード 500円分", total:5 },
        { id:"B", label:"B賞", name:"ふぃなんしゅ＆マドレーヌ 1つ", total:45 },
        { id:"C", label:"C賞", name:"好きな駄菓子 1つ", total:50 },
        { id:"D", label:"D賞", name:"うまい棒 1本", total:150 }
      ]
    };
  }

  function shuffle(arr){
    for (var i = arr.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildPool(config){
    var pool = [];
    config.prizes.forEach(function(p){
      for (var i = 0; i < p.total; i++) pool.push(p.id);
    });
    return shuffle(pool);
  }

  function getConfig(){
    try{
      var raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) { var c = defaultConfig(); setConfig(c); return c; }
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.prizes)) throw new Error("bad config");
      return parsed;
    }catch(e){
      var c2 = defaultConfig(); setConfig(c2); return c2;
    }
  }
  function setConfig(cfg){ localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }

  // 在庫（pool）と抽選ログのみ保持。「何日目か」はページ（day1.html/day2.html）側が持つため、
  // ここでは日付を一切管理しない。両ページは同じ在庫を共有する。
  function initState(config){
    return { pool: buildPool(config), drawnLog: [] };
  }
  function getState(){
    try{
      var raw = localStorage.getItem(STATE_KEY);
      if (!raw){ var s = initState(getConfig()); setState(s); return s; }
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.pool)) throw new Error("bad state");
      return parsed;
    }catch(e){
      var s2 = initState(getConfig()); setState(s2); return s2;
    }
  }
  function setState(st){ localStorage.setItem(STATE_KEY, JSON.stringify(st)); }

  function remainingCounts(state, config){
    var counts = {};
    config.prizes.forEach(function(p){ counts[p.id] = 0; });
    state.pool.forEach(function(id){ if (counts[id] !== undefined) counts[id]++; else counts[id] = 1; });
    return counts;
  }

  function prizeById(config, id){
    for (var i=0;i<config.prizes.length;i++){ if (config.prizes[i].id === id) return config.prizes[i]; }
    return null;
  }

  function readStatsList(){
    try{
      var parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    }catch(e){ return []; }
  }

  // 抽選1回ぶんの履歴を追記する。日付・時刻・時間帯は ts から集計側で算出する。
  // 記録に失敗しても抽選そのものは止めない。
  function recordDraw(prize, ts){
    try{
      var list = readStatsList();
      list.push({ ts: ts, day: CURRENT_DAY, id: prize.id, label: prize.label });
      localStorage.setItem(STATS_KEY, JSON.stringify(list));
    }catch(e){ /* 保存できなくても抽選は続行 */ }
  }

  // 抽選の取り消し用。抽選時刻（ts）と賞IDが一致する履歴を1件だけ削除する。
  function removeStatsRecord(ts, id){
    try{
      var list = readStatsList();
      for (var i = list.length - 1; i >= 0; i--){
        if (list[i] && list[i].ts === ts && list[i].id === id){
          list.splice(i, 1);
          localStorage.setItem(STATS_KEY, JSON.stringify(list));
          return true;
        }
      }
    }catch(e){}
    return false;
  }

  function pad2(n){ return (n < 10 ? "0" : "") + n; }
  // 「9月20日 10:27:03」形式
  function formatDrawTime(ts){
    var d = new Date(ts);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
           pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  /* ===================== サウンド ===================== */
  var isMuted = localStorage.getItem(MUTE_KEY) === "1";
  var audioCtx = null;
  function ctx(){
    if (!audioCtx){
      try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ audioCtx = null; }
    }
    return audioCtx;
  }
  function beep(freq, start, dur, gainVal){
    if (isMuted) return;
    var c = ctx(); if (!c) return;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0;
    osc.connect(gain); gain.connect(c.destination);
    var t0 = c.currentTime + start;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainVal || 0.18, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  function playNormalChime(){ beep(720,0,.18); beep(960,.12,.22); }
  function playHeartbeat(){ beep(95,0,.16,.4); beep(100,.22,.18,.36); }
  function playRevealSting(){ beep(700,0,.08,.16); beep(1040,.07,.1,.18); beep(1400,.15,.16,.2); }
  function playGrandChime(){
    [660,880,990,1320].forEach(function(f,i){ beep(f, i*0.13, .35, 0.2); });
  }

  /* ===================== 紙吹雪・演出 ===================== */
  function confettiBurst(n, power){
    var root = document.getElementById("confetti");
    if (!root) return;
    root.innerHTML = "";
    var colors = ["#D9A441","#C64B3C","#2F8F82","#33436B","#BE5178","#F4CD7A"];
    for (var i=0;i<n;i++){
      var piece = document.createElement("i");
      piece.style.position = "absolute";
      piece.style.top = "-10px";
      piece.style.left = (Math.random()*100) + "vw";
      piece.style.width = (6 + Math.random()*6*power) + "px";
      piece.style.height = (10 + Math.random()*10*power) + "px";
      piece.style.opacity = "0.9";
      piece.style.background = colors[Math.floor(Math.random()*colors.length)];
      var rot = Math.random()*360;
      var delay = Math.random()*240;
      var dur = 1500 + Math.random()*1300*(1+0.4*power);
      var drift = (Math.random()-0.5) * (120 + 120*power);
      piece.animate(
        [ { transform:"translate(0,-10px) rotate("+rot+"deg)" },
          { transform:"translate("+drift+"px, 110vh) rotate("+(rot+360)+"deg)" } ],
        { duration:dur, delay:delay, iterations:1, easing:"linear", fill:"forwards" }
      );
      root.appendChild(piece);
    }
    setTimeout(function(){ root.innerHTML=""; }, 3600);
  }
  function celebrateGrand(){
    var overlay = document.getElementById("grandOverlay");
    if (!overlay) return;
    overlay.classList.remove("show"); void overlay.offsetHeight; overlay.classList.add("show");
    confettiBurst(220, 1.4);
    document.body.animate([{filter:"brightness(1)"},{filter:"brightness(1.7)"},{filter:"brightness(1)"}], {duration:600, easing:"ease-out"});
    playGrandChime();
  }

  /* ===================== 描画 ===================== */
  var els = {};
  ["eventTitle","dayBadge","totalLine","remainLine","stockList","resultArea",
   "drawBtn","muteBtn","scratchWrap","gearBtn","fullscreenBtn"].forEach(function(id){
    els[id] = document.getElementById(id);
  });

  var CURRENT_DAY = window.KUJI_DAY || 1;

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  function renderHeader(config, state){
    els.eventTitle.textContent = config.eventTitle || "抽選くじ";
    document.title = (config.eventTitle || "抽選くじ");
    if (els.dayBadge) els.dayBadge.textContent = CURRENT_DAY + "日目";
    var total = config.prizes.reduce(function(a,p){ return a + p.total; }, 0);
    if (els.totalLine){
      els.totalLine.innerHTML = "全" + total + "本　・　ただいまのこり <strong>" + state.pool.length + "</strong>本";
    }
  }

  // 残り本数の一覧。毎回作り直さず、賞ごとに更新する。
  //  ・残る賞   : 数字とバーをその場で更新する（バーが滑らかに縮む）
  //  ・なくなる賞: ふわっと消してから取り除く（fadeOutStockItem）
  //  ・戻ってきた賞（在庫リセットなど）: 設定順の正しい位置に作る
  function stockItemHtml(p, count){
    var cls = TIER_COLORS[p.id] || "tier-default";
    var pct = p.total > 0 ? Math.round((count / p.total) * 100) : 0;
    return '<div class="stock-item" data-tier="'+escapeHtml(p.id)+'">' +
           '<div class="stock-top">' +
           '<span class="chip '+cls+'">'+escapeHtml(p.label)+'</span>' +
           '<div class="info"><div class="name">'+escapeHtml(p.name)+'</div></div>' +
           '<div class="count">'+count+'</div>' +
           '</div>' +
           '<div class="stock-bar"><div class="stock-bar-fill" style="width:'+pct+'%;background:'+tierHex(p.id)+';"></div></div>' +
           '</div>';
  }

  var STOCK_FADE_MS = 560; // style.css の .stock-item の transition（.5s）より少し長く

  function fadeOutStockItem(el){
    // max-height は「今の高さ」から0へ動かさないとアニメーションしない。まず今の高さを固定する
    el.style.maxHeight = el.offsetHeight + "px";
    void el.offsetHeight; // 固定した高さを先に反映させる（reflow）
    el.classList.add("leaving");
    el.style.maxHeight = "0px";
    setTimeout(function(){ if (el.parentNode) el.parentNode.removeChild(el); }, STOCK_FADE_MS);
  }

  function renderStock(config, state){
    var counts = remainingCounts(state, config);
    var remaining = state.pool.length;
    if (els.remainLine) els.remainLine.innerHTML = "残り <strong>" + remaining + "</strong>本";
    var list = els.stockList;
    if (!list) return;
    var visible = config.prizes.filter(function(p){ return counts[p.id] > 0; });

    // いま表示中（消え始めていない）の行
    var live = {};
    Array.prototype.forEach.call(list.querySelectorAll(".stock-item:not(.leaving)"), function(el){
      live[el.getAttribute("data-tier")] = el;
    });
    var stays = {};
    visible.forEach(function(p){ stays[p.id] = true; });
    Object.keys(live).forEach(function(id){
      if (!stays[id]){ fadeOutStockItem(live[id]); delete live[id]; }
    });

    var emptyEl = list.querySelector(".empty-stock");
    if (visible.length === 0){
      if (!emptyEl) list.insertAdjacentHTML("beforeend", '<div class="empty-stock">すべての景品が引かれました！</div>');
      return;
    }
    if (emptyEl) emptyEl.parentNode.removeChild(emptyEl);

    visible.forEach(function(p, idx){
      var count = counts[p.id];
      var el = live[p.id];
      if (el){
        // 既存の行は、名前・数・バーだけ更新する
        var pct = p.total > 0 ? Math.round((count / p.total) * 100) : 0;
        el.querySelector(".chip").textContent = p.label;
        el.querySelector(".name").textContent = p.name;
        el.querySelector(".count").textContent = count;
        el.querySelector(".stock-bar-fill").style.width = pct + "%";
        return;
      }
      var tmp = document.createElement("div");
      tmp.innerHTML = stockItemHtml(p, count);
      el = tmp.firstChild;
      // 設定順で、自分より後ろにある賞の行の手前に入れる（なければ末尾）
      var before = null;
      for (var k = idx + 1; k < visible.length; k++){
        if (live[visible[k].id]){ before = live[visible[k].id]; break; }
      }
      list.insertBefore(el, before);
      live[p.id] = el;
    });
  }

  function renderAll(){
    var config = getConfig(); var state = getState();
    renderHeader(config, state);
    renderStock(config, state);
    els.drawBtn.disabled = state.pool.length === 0 || revealActive;
    if (state.pool.length === 0 && !revealActive){
      if (els.scratchWrap) els.scratchWrap.classList.remove("has-card");
      els.resultArea.innerHTML = '<div class="sold-out">本日分は抽選済みです。<br>設定画面から在庫をリセットしてください。</div>';
      if (typeof Kuji.hideRevealOverlay === "function") Kuji.hideRevealOverlay();
    }
  }

  /* ===================== 抽選ロジック（共通部） ===================== */
  var isDrawing = false;
  var revealActive = false;
  var pendingPrize = null;
  var pendingDrawTs = null;

  function drawOnce(){
    if (isDrawing || revealActive) return;
    var config = getConfig();
    var state = getState();
    if (state.pool.length === 0){ renderAll(); return; }

    isDrawing = true;
    els.drawBtn.disabled = true;

    var idx = Math.floor(Math.random() * state.pool.length);
    var winId = state.pool[idx];
    var prize = prizeById(config, winId) || { id:winId, label:winId, name:"" };

    var drawnAt = Date.now();
    state.pool.splice(idx, 1);
    state.drawnLog.push({ id: winId, ts: drawnAt });
    // 「直前の抽選」。在庫と同じ書き込みで保存するので、在庫が減ったのに結果が残らない、ということが起きない。
    // revealed は「演出が最後まで終わって結果が表示されたか」。false のまま画面が閉じられたら、次回の起動時に結果を復元する。
    state.lastDraw = { ts: drawnAt, day: CURRENT_DAY, id: winId, label: prize.label, name: prize.name || "", revealed: false };
    setState(state);
    recordDraw(prize, drawnAt);

    pendingPrize = prize;
    pendingDrawTs = drawnAt;
    renderResultContent(prize);

    revealActive = true;
    if (typeof Kuji.startReveal === "function"){
      Kuji.startReveal(prize);
    } else {
      // 演出スクリプトが読み込まれていない場合の保険：即座に結果を確定する
      finishReveal(prize);
    }

    isDrawing = false;
  }

  function renderResultContent(prize){
    if (els.scratchWrap) els.scratchWrap.classList.add("has-card");
    els.resultArea.innerHTML =
      '<div class="result-tag" style="color:'+tierHex(prize.id)+'">'+escapeHtml(prize.label)+'</div>' +
      '<div class="result-name">'+escapeHtml(prize.name || "")+'</div>' +
      '<div class="result-congrats">おめでとうございます！</div>';
  }

  function celebrate(prize){
    if (els.resultArea.animate){
      els.resultArea.animate(
        [{transform:"scale(.92)",opacity:.5},{transform:"scale(1.03)",opacity:1},{transform:"scale(1)"}],
        {duration:420, easing:"cubic-bezier(.2,.8,.2,1)"}
      );
    }
    if (prize.id === "A"){
      celebrateGrand();
    } else {
      var power = prize.id === "B" ? 1.0 : (prize.id === "C" ? 0.75 : 0.55);
      confettiBurst(Math.round(60*power+40), power);
      playNormalChime();
    }
  }

  // 演出スクリプト（reveal-scratch.js / reveal-gacha.js）が、演出の最後に必ず呼び出す関数。
  function finishReveal(prize){
    if (!revealActive) return;
    revealActive = false;
    celebrate(prize || pendingPrize);
    var state = getState();
    var config = getConfig();
    if (state.lastDraw && state.lastDraw.ts === pendingDrawTs && !state.lastDraw.revealed){
      state.lastDraw.revealed = true;
      setState(state);
    }
    renderHeader(config, state);
    renderStock(config, state);
    els.drawBtn.disabled = state.pool.length === 0;
  }

  function resetStock(){
    var config = getConfig();
    var state = getState();
    state.pool = buildPool(config);
    state.drawnLog = [];
    state.lastDraw = null; // 満タンに戻した後に取り消すと総数を超えてしまうため
    setState(state);
    revealActive = false;
    if (typeof Kuji.hideRevealOverlay === "function") Kuji.hideRevealOverlay();
    if (els.scratchWrap) els.scratchWrap.classList.remove("has-card");
    renderAll();
    els.resultArea.innerHTML = '<div class="result-placeholder">在庫をリセットしました。抽選を開始できます。</div>';
    confettiBurst(50, 0.6);
  }

  // 直前の1回を取り消す。景品を在庫へ戻し、集計の記録も1件削除する。
  // 戻り値: { ok, restored, draw } / 失敗時 { ok:false, reason }
  function cancelLastDraw(){
    var config = getConfig();
    var state = getState();
    var last = state.lastDraw;
    if (!last) return { ok:false, reason:"none" };
    var prize = prizeById(config, last.id);
    if (!prize) return { ok:false, reason:"removed" };

    // すでに総数まで在庫がある（手で在庫を直した後など）場合は、在庫を総数より増やさない
    var restored = false;
    if ((remainingCounts(state, config)[last.id] || 0) < prize.total){
      var insertAt = Math.floor(Math.random() * (state.pool.length + 1));
      state.pool.splice(insertAt, 0, last.id);
      restored = true;
    }
    state.drawnLog = (state.drawnLog || []).filter(function(e){ return e.ts !== last.ts; });
    state.lastDraw = null;
    setState(state);
    removeStatsRecord(last.ts, last.id);

    // 演出の最中なら止める（取り消した賞のお祝いが後から出ないように）
    revealActive = false;
    if (typeof Kuji.hideRevealOverlay === "function") Kuji.hideRevealOverlay();
    if (els.scratchWrap) els.scratchWrap.classList.remove("has-card");
    renderAll();
    els.resultArea.innerHTML = '<div class="result-placeholder">直前の抽選を取り消しました。もう一度抽選できます。</div>';
    return { ok:true, restored:restored, draw:last };
  }

  // 演出の途中で画面が閉じられた（再読み込み・強制終了など）抽選の結果を、画面に表示する。
  // 在庫はすでに減っているので、結果を見せないままにしない。表示したら「表示済み」にして、繰り返し出さない。
  function restoreInterruptedDraw(){
    var state = getState();
    var last = state.lastDraw;
    if (!last || last.revealed) return;
    renderResultContent({ id: last.id, label: last.label, name: last.name });
    var d = new Date(last.ts);
    els.resultArea.insertAdjacentHTML("beforeend",
      '<div class="result-notice">演出の途中で画面が閉じられたため、結果を表示しています（' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ' の抽選）</div>');
    last.revealed = true;
    setState(state);
  }

  /* ===================== イベント：メイン画面 ===================== */
  els.drawBtn.addEventListener("click", drawOnce);
  if (els.muteBtn){
    els.muteBtn.addEventListener("click", function(){
      isMuted = !isMuted;
      localStorage.setItem(MUTE_KEY, isMuted ? "1" : "0");
      els.muteBtn.textContent = isMuted ? "🔇" : "🔊";
    });
    els.muteBtn.textContent = isMuted ? "🔇" : "🔊";
  }

  function updateFullscreenButton(){
    if (!els.fullscreenBtn) return;
    var isFullscreen = !!document.fullscreenElement;
    els.fullscreenBtn.textContent = isFullscreen ? "全画面を終了" : "全画面表示";
    els.fullscreenBtn.title = isFullscreen ? "全画面表示を終了" : "全画面で表示";
  }

  if (els.fullscreenBtn){
    els.fullscreenBtn.addEventListener("click", function(){
      if (!document.fullscreenElement){
        document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(function(){});
      } else {
        document.exitFullscreen && document.exitFullscreen();
      }
    });
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    updateFullscreenButton();
  }

  /* ===================== 管理画面 ===================== */
  var pwBackdrop = document.getElementById("pwBackdrop");
  var adminBackdrop = document.getElementById("adminBackdrop");
  var confirmBackdrop = document.getElementById("confirmBackdrop");
  var confirmAction = null;

  function askConfirmation(message, action){
    confirmAction = action;
    document.getElementById("confirmMessage").textContent = message;
    confirmBackdrop.classList.add("show");
  }

  function closeConfirmation(){
    confirmAction = null;
    confirmBackdrop.classList.remove("show");
  }

  document.getElementById("confirmOkBtn").addEventListener("click", function(){
    var action = confirmAction;
    closeConfirmation();
    if (action) action();
  });
  document.getElementById("confirmCancelBtn").addEventListener("click", closeConfirmation);
  confirmBackdrop.addEventListener("click", function(e){
    if (e.target === confirmBackdrop) closeConfirmation();
  });

  document.getElementById("gearBtn").addEventListener("click", function(){
    document.getElementById("pwInput").value = "";
    document.getElementById("pwMsg").innerHTML = "";
    pwBackdrop.classList.add("show");
    document.getElementById("pwInput").focus();
  });
  document.getElementById("pwClose").addEventListener("click", function(){ pwBackdrop.classList.remove("show"); });
  pwBackdrop.addEventListener("click", function(e){ if (e.target === pwBackdrop) pwBackdrop.classList.remove("show"); });

  document.getElementById("pwSubmit").addEventListener("click", tryLogin);
  document.getElementById("pwInput").addEventListener("keydown", function(e){ if (e.key === "Enter") tryLogin(); });

  function tryLogin(){
    var config = getConfig();
    var val = document.getElementById("pwInput").value;
    if (val === config.adminPassword){
      pwBackdrop.classList.remove("show");
      openAdmin();
    } else {
      document.getElementById("pwMsg").innerHTML = '<div class="msg err">パスワードが違います。</div>';
    }
  }

  document.getElementById("adminClose").addEventListener("click", function(){ adminBackdrop.classList.remove("show"); });
  adminBackdrop.addEventListener("click", function(e){ if (e.target === adminBackdrop) adminBackdrop.classList.remove("show"); });

  function openAdmin(){
    var config = getConfig();
    document.getElementById("cfgTitle").value = config.eventTitle;
    var dayLabelEl = document.getElementById("adminDayLabel");
    if (dayLabelEl) dayLabelEl.textContent = CURRENT_DAY + "日目";
    renderTierRows(config);
    document.getElementById("configMsg").innerHTML = "";
    document.getElementById("passwordMsg").innerHTML = "";
    var cancelMsgEl = document.getElementById("cancelLastMsg");
    if (cancelMsgEl) cancelMsgEl.innerHTML = "";
    var backupMsgEl = document.getElementById("backupMsg");
    if (backupMsgEl) backupMsgEl.innerHTML = "";
    renderLastDrawInfo();
    adminBackdrop.classList.add("show");
  }

  // 運営画面の「直前の抽選」欄。取り消せる抽選がなければボタンを無効にする。
  function renderLastDrawInfo(){
    var info = document.getElementById("lastDrawInfo");
    var btn = document.getElementById("cancelLastBtn");
    if (!info || !btn) return;
    var last = getState().lastDraw;
    if (!last){
      info.innerHTML = '<div class="last-draw-empty">取り消せる抽選はありません。</div>';
      btn.disabled = true;
      return;
    }
    var html = '<div class="last-draw-prize"><strong>' + escapeHtml(last.label) + '</strong>　' + escapeHtml(last.name || "") + '</div>' +
               '<div class="last-draw-meta">' + last.day + '日目　' + formatDrawTime(last.ts) + '</div>';
    if (!last.revealed) html += '<div class="last-draw-note">演出の途中で終了した抽選です（結果はこの画面で確認できます）。</div>';
    var removed = !prizeById(getConfig(), last.id);
    if (removed) html += '<div class="last-draw-note">この賞は設定から削除されているため、取り消せません。</div>';
    info.innerHTML = html;
    btn.disabled = removed;
  }

  var cancelLastBtn = document.getElementById("cancelLastBtn");
  if (cancelLastBtn){
    cancelLastBtn.addEventListener("click", function(){
      var last = getState().lastDraw;
      if (!last) return;
      askConfirmation(
        "「" + last.label + "：" + (last.name || "") + "」の抽選（" + formatDrawTime(last.ts) + "）を取り消しますか？ 景品は在庫に戻り、集計の記録も1件削除されます。",
        function(){
          var res = cancelLastDraw();
          var msgEl = document.getElementById("cancelLastMsg");
          if (res.ok){
            syncStockInputsFromState();
            renderLastDrawInfo();
            msgEl.innerHTML = '<div class="msg ok">' + escapeHtml(res.draw.label) + 'の抽選を取り消しました。' +
              (res.restored ? '景品を在庫に戻し、集計の記録も削除しました。'
                            : '在庫はすでに総数に達しているため、在庫の数は変えていません。集計の記録は削除しました。') + '</div>';
          } else {
            renderLastDrawInfo();
            msgEl.innerHTML = '<div class="msg err">取り消せませんでした。' +
              (res.reason === "removed" ? 'この賞は設定から削除されています。' : '取り消せる抽選がありません。') + '</div>';
          }
        }
      );
    });
  }

  // 運営画面の「現在庫」欄を、実際の在庫（localStorage）の数に合わせ直す。
  // 欄は運営画面を開いた時点の数字のままなので、在庫リセット後に更新しないと、
  // 続けて「設定を保存」を押したときに古い数字が在庫へ書き戻されてしまう。
  // 追加しただけで未保存の賞の行は、実際の在庫がまだ無いので触らない。
  function syncStockInputsFromState(){
    var config = getConfig();
    var counts = remainingCounts(getState(), config);
    document.querySelectorAll("#tierRows [data-stock]").forEach(function(input){
      var id = input.getAttribute("data-stock");
      if (prizeById(config, id)) input.value = counts[id] || 0;
    });
  }

  var resetStockBtn = document.getElementById("resetStockBtn");
  if (resetStockBtn){
    resetStockBtn.addEventListener("click", function(){
      askConfirmation("在庫を満タンにリセットします。よろしいですか？", function(){
        resetStock();
        syncStockInputsFromState();
        renderLastDrawInfo();
        document.getElementById("resetStockMsg").innerHTML = '<div class="msg ok">在庫をリセットしました。</div>';
      });
    });
  }

  function renderTierRows(config, draftCounts){
    var wrap = document.getElementById("tierRows");
    var counts = draftCounts || remainingCounts(getState(), config);
    wrap.innerHTML = config.prizes.map(function(p, i){
      return '<div class="tier-row" data-idx="'+i+'" data-id="'+escapeHtml(p.id)+'">' +
        '<input type="text" class="t-label" value="'+escapeHtml(p.label)+'" placeholder="A賞">' +
        '<input type="text" class="t-name" value="'+escapeHtml(p.name)+'" placeholder="景品名">' +
        '<input type="number" class="t-total" min="0" value="'+p.total+'">' +
        '<input type="number" class="current-stock" min="0" max="'+p.total+'" value="'+(counts[p.id] || 0)+'" data-stock="'+escapeHtml(p.id)+'" aria-label="'+escapeHtml(p.label)+'の現在庫">' +
        '<button type="button" class="del" data-del="'+i+'" aria-label="'+escapeHtml(p.label)+'を削除">削除</button>' +
        '</div>';
    }).join("");
    wrap.querySelectorAll(".del").forEach(function(btn){
      btn.addEventListener("click", function(){
        var idx = parseInt(btn.getAttribute("data-del"), 10);
        var draftCounts = readStockCountsFromForm();
        var config2 = readConfigFromForm(false);
        var prize = config2.prizes[idx];
        if (!prize) return;
        askConfirmation("「" + prize.label + "：" + prize.name + "」を削除しますか？ 未抽選分の在庫も一覧から削除されます。", function(){
          config2.prizes.splice(idx, 1);
          delete draftCounts[prize.id];
          renderTierRows(config2, draftCounts);
        });
      });
    });
    wrap.querySelectorAll("[data-stock]").forEach(function(input){
      input.addEventListener("change", function(){
        var row = input.closest(".tier-row");
        var totalInput = row && row.querySelector(".t-total");
        var liveTotal = totalInput ? Math.max(0, parseInt(totalInput.value, 10) || 0) : undefined;
        setStockCount(input.getAttribute("data-stock"), input.value, liveTotal);
      });
    });
    wrap.querySelectorAll(".t-total").forEach(function(input){
      input.addEventListener("input", function(){
        var row = input.closest(".tier-row");
        if (!row) return;
        var total = Math.max(0, parseInt(input.value, 10) || 0);
        var stockInput = row.querySelector("[data-stock]");
        if (!stockInput) return;
        stockInput.max = total;
        if (parseInt(stockInput.value, 10) > total){
          stockInput.value = total;
          setStockCount(stockInput.getAttribute("data-stock"), total, total);
        }
      });
    });
  }

  document.getElementById("addTierBtn").addEventListener("click", function(){
    var draftCounts = readStockCountsFromForm();
    var config = readConfigFromForm(false);
    var usedIds = {};
    config.prizes.forEach(function(prize){ usedIds[prize.id] = true; });
    var nextCode = 65;
    while (usedIds[String.fromCharCode(nextCode)]) nextCode++;
    var nextId = String.fromCharCode(nextCode);
    config.prizes.push({ id: nextId, label: nextId + "賞", name: "景品名", total: 1 });
    draftCounts[nextId] = 1;
    renderTierRows(config, draftCounts);
  });

  function readStockCountsFromForm(){
    var counts = {};
    document.querySelectorAll("#tierRows .tier-row").forEach(function(row){
      var input = row.querySelector("[data-stock]");
      if (input) counts[row.getAttribute("data-id")] = Math.max(0, parseInt(input.value, 10) || 0);
    });
    return counts;
  }

  function readConfigFromForm(keepId){
    var base = getConfig();
    var rows = document.querySelectorAll("#tierRows .tier-row");
    var prizes = [];
    rows.forEach(function(row, i){
      var existing = base.prizes[i];
      var id = row.getAttribute("data-id") || (existing ? existing.id : String.fromCharCode(65 + i));
      prizes.push({
        id: id,
        label: row.querySelector(".t-label").value || id,
        name: row.querySelector(".t-name").value || "",
        total: Math.max(0, parseInt(row.querySelector(".t-total").value, 10) || 0)
      });
    });
    return {
      eventTitle: document.getElementById("cfgTitle").value || "抽選くじ",
      adminPassword: base.adminPassword,
      prizes: prizes
    };
  }

  document.getElementById("saveConfigBtn").addEventListener("click", function(){
    var config = readConfigFromForm(true);
    var requestedCounts = readStockCountsFromForm();
    setConfig(config);
    var state = getState();
    var validIds = {};
    config.prizes.forEach(function(p){ validIds[p.id] = true; });
    state.pool = state.pool.filter(function(id){ return validIds[id]; });
    config.prizes.forEach(function(prize){
      var currentCount = remainingCounts(state, config)[prize.id] || 0;
      var requestedCount = Math.max(0, Math.min(prize.total, requestedCounts[prize.id] || 0));
      while (currentCount < requestedCount){
        var insertAt = Math.floor(Math.random() * (state.pool.length + 1));
        state.pool.splice(insertAt, 0, prize.id);
        currentCount++;
      }
      while (currentCount > requestedCount){
        var removeAt = state.pool.indexOf(prize.id);
        if (removeAt === -1) break;
        state.pool.splice(removeAt, 1);
        currentCount--;
      }
    });
    setState(state);
    renderAll();
    document.getElementById("configMsg").innerHTML = '<div class="msg ok">設定を保存しました。総数を変更しても現在庫は変わりません。</div>';
  });

  function setStockCount(id, requestedCount, maxCount){
    var config = getConfig();
    var prize = prizeById(config, id);
    if (!prize) return;
    var state = getState();
    var currentCount = remainingCounts(state, config)[id] || 0;
    var limit = maxCount === undefined ? prize.total : Math.max(0, maxCount);
    var nextCount = Math.max(0, Math.min(limit, parseInt(requestedCount, 10) || 0));
    while (currentCount < nextCount){
      var insertAt = Math.floor(Math.random() * (state.pool.length + 1));
      state.pool.splice(insertAt, 0, id);
      currentCount++;
    }
    while (currentCount > nextCount){
      var removeAt = state.pool.indexOf(id);
      if (removeAt === -1) break;
      state.pool.splice(removeAt, 1);
      currentCount--;
    }
    setState(state);
    document.querySelectorAll('[data-stock="'+id+'"]').forEach(function(el){
      el.value = currentCount;
    });
    renderAll();
  }

  document.getElementById("changePwBtn").addEventListener("click", function(){
    var val = document.getElementById("newPassword").value;
    if (!val){
      document.getElementById("passwordMsg").innerHTML = '<div class="msg err">新しいパスワードを入力してください。</div>';
      return;
    }
    askConfirmation("注意：この操作を実行すると、次回から新しいパスワードが必要になります。パスワードを変更しますか？", function(){
      var config = getConfig();
      config.adminPassword = val;
      setConfig(config);
      document.getElementById("newPassword").value = "";
      document.getElementById("passwordMsg").innerHTML = '<div class="msg ok">パスワードを変更しました。</div>';
    });
  });

  document.getElementById("wipeBtn").addEventListener("click", function(){
    askConfirmation("設定と在庫を初期状態に戻しますか？この操作は取り消せません。", function(){
      localStorage.removeItem(CONFIG_KEY);
      localStorage.removeItem(STATE_KEY);
      adminBackdrop.classList.remove("show");
      renderAll();
    });
  });

  /* ===================== バックアップ（書き出し・読み込み） ===================== */
  // 設定・在庫・抽選履歴を1つのJSONファイルに書き出し、あとで読み込んで元に戻す。
  // 運営パスワードはファイルに残さない（読み込み後も現在のパスワードのまま）。
  var BACKUP_APP = "gakusai-kuji";
  var BACKUP_VERSION = 1;
  var BACKUP_MAX_BYTES = 5 * 1024 * 1024;

  function buildBackup(){
    var config = getConfig();
    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      day: CURRENT_DAY,
      config: { eventTitle: config.eventTitle, prizes: config.prizes },
      state: getState(),
      stats: readStatsList()
    };
  }

  function isNonEmptyString(v){ return typeof v === "string" && v.length > 0; }
  function isCount(v){ return typeof v === "number" && isFinite(v) && v >= 0 && Math.floor(v) === v; }
  function isFiniteNumber(v){ return typeof v === "number" && isFinite(v); }

  // ファイルの中身を検査して、書き込める形に整える。おかしければ Error を投げる（何も書き込まない）。
  function parseBackup(text){
    var data;
    try{ data = JSON.parse(String(text).replace(/^\uFEFF/, "")); }
    catch(e){ throw new Error("ファイルを読み込めません（バックアップファイルではないようです）。"); }
    if (!data || typeof data !== "object" || data.app !== BACKUP_APP) throw new Error("このアプリのバックアップファイルではありません。");
    if (data.version !== BACKUP_VERSION) throw new Error("バックアップの形式（バージョン）が違うため、読み込めません。");
    var c = data.config, st = data.state;
    if (!c || !Array.isArray(c.prizes) || !st || !Array.isArray(st.pool)) throw new Error("バックアップの内容が壊れています。");
    if (c.prizes.length === 0) throw new Error("賞品が1つも入っていないバックアップです。");

    var ids = Object.create(null);
    var prizes = c.prizes.map(function(p){
      if (!p || !isNonEmptyString(p.id) || ids[p.id] || !isCount(p.total)) throw new Error("賞品の設定が壊れています。");
      ids[p.id] = true;
      return { id: p.id, label: isNonEmptyString(p.label) ? p.label : p.id, name: typeof p.name === "string" ? p.name : "", total: p.total };
    });
    var pool = st.pool.map(function(id){
      if (!isNonEmptyString(id) || !ids[id]) throw new Error("在庫のデータが壊れています（設定にない賞が含まれています）。");
      return id;
    });
    var drawnLog = (Array.isArray(st.drawnLog) ? st.drawnLog : []).filter(function(e){
      return e && isNonEmptyString(e.id) && isFiniteNumber(e.ts);
    });
    var last = st.lastDraw;
    var lastDraw = null;
    if (last && isNonEmptyString(last.id) && isFiniteNumber(last.ts) && isFiniteNumber(last.day)){
      // 読み込み直後に「演出の途中で終了」と誤って表示しないよう、表示済みとして扱う
      lastDraw = { ts: last.ts, day: last.day, id: last.id,
                   label: isNonEmptyString(last.label) ? last.label : last.id,
                   name: typeof last.name === "string" ? last.name : "", revealed: true };
    }
    var rawStats = Array.isArray(data.stats) ? data.stats : [];
    var stats = rawStats.filter(function(r){
      return r && isFiniteNumber(r.ts) && isFiniteNumber(r.day) && isNonEmptyString(r.id);
    }).map(function(r){
      return { ts: r.ts, day: r.day, id: r.id, label: typeof r.label === "string" ? r.label : r.id };
    });

    return {
      config: { eventTitle: isNonEmptyString(c.eventTitle) ? c.eventTitle : "抽選くじ", prizes: prizes },
      state: { pool: pool, drawnLog: drawnLog, lastDraw: lastDraw },
      stats: stats,
      dropped: rawStats.length - stats.length,
      exportedAt: data.exportedAt,
      day: data.day
    };
  }

  // 3つのデータをまとめて書き込む。途中で失敗したら、書き込む前の状態に戻す。
  function applyBackup(b){
    var password = getConfig().adminPassword;
    var keys = [CONFIG_KEY, STATE_KEY, STATS_KEY];
    var prev = keys.map(function(k){ return localStorage.getItem(k); });
    try{
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ eventTitle: b.config.eventTitle, adminPassword: password, prizes: b.config.prizes }));
      localStorage.setItem(STATE_KEY, JSON.stringify(b.state));
      localStorage.setItem(STATS_KEY, JSON.stringify(b.stats));
      return true;
    }catch(e){
      keys.forEach(function(k, i){
        try{ if (prev[i] === null) localStorage.removeItem(k); else localStorage.setItem(k, prev[i]); }catch(e2){}
      });
      return false;
    }
  }

  function showBackupMsg(kind, text){
    document.getElementById("backupMsg").innerHTML = '<div class="msg ' + kind + '">' + escapeHtml(text) + '</div>';
  }

  function exportBackup(){
    var now = new Date();
    var name = "kuji-backup_" + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
               "-" + pad2(now.getHours()) + pad2(now.getMinutes()) + ".json";
    var blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    showBackupMsg("ok", name + " を書き出しました。USBメモリなど、このPCとは別の場所にも保管しておくと安心です。");
  }

  function afterBackupImported(){
    // 演出の最中なら止める
    revealActive = false;
    if (typeof Kuji.hideRevealOverlay === "function") Kuji.hideRevealOverlay();
    if (els.scratchWrap) els.scratchWrap.classList.remove("has-card");
    var config = getConfig();
    renderAll();
    if (getState().pool.length > 0){
      els.resultArea.innerHTML = '<div class="result-placeholder">バックアップを読み込みました。抽選を開始できます。</div>';
    }
    // 開いたままの運営画面の入力欄も、読み込んだ内容に合わせる（未保存の編集は破棄される）
    document.getElementById("cfgTitle").value = config.eventTitle;
    renderTierRows(config);
    document.getElementById("configMsg").innerHTML = "";
    document.getElementById("resetStockMsg").innerHTML = "";
    var cancelMsgEl = document.getElementById("cancelLastMsg");
    if (cancelMsgEl) cancelMsgEl.innerHTML = "";
    renderLastDrawInfo();
  }

  function handleBackupFile(file){
    if (file.size > BACKUP_MAX_BYTES){ showBackupMsg("err", "ファイルが大きすぎます。バックアップファイルを選んでください。"); return; }
    var reader = new FileReader();
    reader.onerror = function(){ showBackupMsg("err", "ファイルを読み込めませんでした。"); };
    reader.onload = function(){
      var b;
      try{ b = parseBackup(reader.result); }
      catch(e){ showBackupMsg("err", e.message); return; }

      var when = "";
      var t = Date.parse(b.exportedAt);
      if (isFinite(t)) when = "（" + formatDrawTime(t) + " に書き出し）";
      var cur = getState();
      askConfirmation(
        "バックアップ「" + file.name + "」" + when + "を読み込みます。" +
        " 【バックアップの内容】残り" + b.state.pool.length + "本・抽選履歴" + b.stats.length + "件" +
        " 【現在の内容】残り" + cur.pool.length + "本・抽選履歴" + readStatsList().length + "件。" +
        " 現在の設定・在庫・抽選履歴はすべてバックアップの内容に置き換わり、元に戻せません。運営パスワードは変わりません。",
        function(){
          if (!applyBackup(b)){
            showBackupMsg("err", "保存に失敗したため、読み込みを中止しました（現在のデータは変わっていません）。");
            return;
          }
          afterBackupImported();
          showBackupMsg("ok", "バックアップを読み込みました（残り" + b.state.pool.length + "本・抽選履歴" + b.stats.length + "件）。" +
            (b.dropped > 0 ? " 壊れていた抽選履歴" + b.dropped + "件は読み込んでいません。" : ""));
        }
      );
    };
    reader.onloadend = function(){ document.getElementById("importBackupFile").value = ""; };
    reader.readAsText(file);
  }

  var exportBackupBtn = document.getElementById("exportBackupBtn");
  var importBackupBtn = document.getElementById("importBackupBtn");
  var importBackupFile = document.getElementById("importBackupFile");
  if (exportBackupBtn && importBackupBtn && importBackupFile){
    exportBackupBtn.addEventListener("click", exportBackup);
    importBackupBtn.addEventListener("click", function(){ importBackupFile.click(); });
    importBackupFile.addEventListener("change", function(){
      var file = importBackupFile.files && importBackupFile.files[0];
      if (file) handleBackupFile(file);
    });
  }

  /* ===================== 他スクリプトへの公開API ===================== */
  // reveal-scratch.js / reveal-gacha.js は、このオブジェクトの
  // startReveal と hideRevealOverlay を自分の実装で上書きする。
  window.Kuji = {
    // データ層
    getConfig: getConfig, setConfig: setConfig,
    getState: getState, setState: setState,
    prizeById: prizeById, remainingCounts: remainingCounts,
    tierHex: tierHex, escapeHtml: escapeHtml,
    // 表示要素・現在の日
    els: els, day: CURRENT_DAY,
    // サウンド
    beep: beep, playNormalChime: playNormalChime,
    playGrandChime: playGrandChime, playHeartbeat: playHeartbeat,
    playRevealSting: playRevealSting,
    // 演出
    confettiBurst: confettiBurst, celebrateGrand: celebrateGrand,
    renderResultContent: renderResultContent,
    // 演出スクリプトが呼び出す完了フック
    finishReveal: finishReveal,
    // 演出スクリプト側で上書きされる拡張ポイント
    startReveal: null,
    hideRevealOverlay: null
  };
  var Kuji = window.Kuji;

  /* ===================== 大画面での拡大表示 ===================== */
  // CSS は rem で書いてあるので、<html> の文字サイズを大きくするだけで、文字・余白・カードが比例して大きくなる。
  // 画面の幅と高さに「収まる最大の倍率」を探して適用する（小さい画面では何もしない）。
  var BASE_FONT_PX = 16;                 // style.css の html{font-size} と同じ
  var STAGE_DESIGN_W = 1080 + 24 * 2;    // .stage の最大幅 + 左右の余白。これより画面が広いときだけ拡大できる
  var MAX_STAGE_SCALE = 3;

  function stageFits(){
    var stage = document.querySelector(".stage");
    if (document.documentElement.scrollHeight > window.innerHeight + 1) return false; // ページが縦にはみ出す
    if (stage && stage.scrollHeight > stage.clientHeight + 1) return false;            // 全画面: 固定の高さの枠から内容があふれる
    return true;
  }
  function setStageScale(scale){
    document.documentElement.style.fontSize = scale > 1 ? (BASE_FONT_PX * scale) + "px" : "";
  }
  function applyStageScale(){
    var hi = Math.min(MAX_STAGE_SCALE, window.innerWidth / STAGE_DESIGN_W);
    if (hi <= 1){ setStageScale(1); return; }
    setStageScale(hi);
    if (stageFits()) return;
    var lo = 1;                          // 等倍は常に許容（等倍で収まらない小さい画面は、従来どおりスクロールする）
    for (var i = 0; i < 9; i++){         // 収まる最大の倍率を二分探索
      var mid = (lo + hi) / 2;
      setStageScale(mid);
      if (stageFits()) lo = mid; else hi = mid;
    }
    setStageScale(lo);
  }
  var stageScaleTimer = null;
  function scheduleStageScale(){
    clearTimeout(stageScaleTimer);
    stageScaleTimer = setTimeout(applyStageScale, 80);
  }
  window.addEventListener("resize", scheduleStageScale);
  document.addEventListener("fullscreenchange", scheduleStageScale);
  window.addEventListener("load", scheduleStageScale);

  /* ===================== 初期化 ===================== */
  renderAll();
  restoreInterruptedDraw();
  applyStageScale();
})();
