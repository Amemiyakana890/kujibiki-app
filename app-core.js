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

  // 抽選1回ぶんの履歴を追記する。日付・時刻・時間帯は ts から集計側で算出する。
  // 記録に失敗しても抽選そのものは止めない。
  function recordDraw(prize, ts){
    try{
      var list = [];
      try{
        var parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "[]");
        if (Array.isArray(parsed)) list = parsed;
      }catch(e){ list = []; }
      list.push({ ts: ts, day: CURRENT_DAY, id: prize.id, label: prize.label });
      localStorage.setItem(STATS_KEY, JSON.stringify(list));
    }catch(e){ /* 保存できなくても抽選は続行 */ }
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

  function renderStock(config, state){
    var counts = remainingCounts(state, config);
    var remaining = state.pool.length;
    if (els.remainLine) els.remainLine.innerHTML = "残り <strong>" + remaining + "</strong>本";
    var list = els.stockList;
    if (!list) return;
    var visible = config.prizes.filter(function(p){ return counts[p.id] > 0; });
    if (visible.length === 0){
      list.innerHTML = '<div class="empty-stock">すべての景品が引かれました！</div>';
      return;
    }
    list.innerHTML = visible.map(function(p){
      var cls = TIER_COLORS[p.id] || "tier-default";
      var pct = p.total > 0 ? Math.round((counts[p.id] / p.total) * 100) : 0;
      return '<div class="stock-item" data-tier="'+p.id+'">' +
             '<div class="stock-top">' +
             '<span class="chip '+cls+'">'+escapeHtml(p.label)+'</span>' +
             '<div class="info"><div class="name">'+escapeHtml(p.name)+'</div></div>' +
             '<div class="count">'+counts[p.id]+'</div>' +
             '</div>' +
             '<div class="stock-bar"><div class="stock-bar-fill" style="width:'+pct+'%;background:'+tierHex(p.id)+';"></div></div>' +
             '</div>';
    }).join("");
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
    setState(state);
    recordDraw(prize, drawnAt);

    pendingPrize = prize;
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
    renderHeader(config, state);
    renderStock(config, state);
    els.drawBtn.disabled = state.pool.length === 0;
  }

  function resetStock(){
    var config = getConfig();
    var state = getState();
    state.pool = buildPool(config);
    state.drawnLog = [];
    setState(state);
    revealActive = false;
    if (typeof Kuji.hideRevealOverlay === "function") Kuji.hideRevealOverlay();
    if (els.scratchWrap) els.scratchWrap.classList.remove("has-card");
    renderAll();
    els.resultArea.innerHTML = '<div class="result-placeholder">在庫をリセットしました。抽選を開始できます。</div>';
    confettiBurst(50, 0.6);
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
    adminBackdrop.classList.add("show");
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

  /* ===================== 初期化 ===================== */
  renderAll();
})();
