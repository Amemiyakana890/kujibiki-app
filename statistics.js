/* =========================================================
   statistics.js
   statistics.html 専用。抽選履歴（localStorage: kujiStats_v1）を読み込み、
   時間帯別・賞別に集計して表示する。CSV出力と統計データのリセットもここで行う。

   履歴は app-core.js の drawOnce() が1回の抽選ごとに追記する。
   保存形式: [{ ts: 抽選時刻(ミリ秒), day: 何日目か, id: 賞ID, label: 抽選時の賞名 }, ...]
   日付・時刻・時間帯は ts から、このファイルで算出する。
   ========================================================= */
(function(){
  "use strict";

  var CONFIG_KEY = "kujiConfig_v1";
  var STATS_KEY  = "kujiStats_v1";

  var TIER_COLORS = { A:"tier-A", B:"tier-B", C:"tier-C", D:"tier-D" };
  var TIER_HEX = { A:"#DA9A2E", B:"#33447A", C:"#12896F", D:"#D14A78" };
  function tierHex(id){ return TIER_HEX[id] || "#6b7280"; }

  /* ---------- 時間帯（9:30〜16:30 の1時間ごと・7区分） ---------- */
  // 各区間は「開始を含み、終了を含まない」。9:30:00 は最初の区間、16:30:00 ちょうどは対象外。
  var SLOT_START_MIN = 9 * 60 + 30;
  var SLOT_LENGTH_MIN = 60;
  var SLOT_COUNT = 7;
  var WAVE = "\u301C"; // 〜

  function pad2(n){ return (n < 10 ? "0" : "") + n; }
  function fmtHM(min){ return Math.floor(min / 60) + ":" + pad2(min % 60); }

  var SLOTS = [];
  (function(){
    for (var i = 0; i < SLOT_COUNT; i++){
      var from = SLOT_START_MIN + i * SLOT_LENGTH_MIN;
      SLOTS.push({ label: fmtHM(from) + WAVE + fmtHM(from + SLOT_LENGTH_MIN) });
    }
  })();

  // ts が属する時間帯の番号（0〜6）。時間外は -1。
  function slotIndex(ts){
    var d = new Date(ts);
    var minutes = d.getHours() * 60 + d.getMinutes();
    var i = Math.floor((minutes - SLOT_START_MIN) / SLOT_LENGTH_MIN);
    return (i >= 0 && i < SLOT_COUNT) ? i : -1;
  }

  /* ---------- データ読み込み ---------- */
  function loadRecords(){
    var list = [];
    try{
      var parsed = JSON.parse(localStorage.getItem(STATS_KEY) || "[]");
      if (Array.isArray(parsed)) list = parsed;
    }catch(e){ list = []; }
    return list.filter(function(r){
      return r && typeof r.ts === "number" && isFinite(r.ts) &&
             typeof r.day === "number" && r.id !== undefined && r.id !== null;
    });
  }

  function loadPrizes(){
    try{
      var cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
      if (cfg && Array.isArray(cfg.prizes)) return cfg.prizes;
    }catch(e){}
    return [];
  }

  /* ---------- 集計 ---------- */
  function aggregate(records, day){
    var res = { total: 0, outside: 0, slots: [], byPrize: {} };
    for (var i = 0; i < SLOT_COUNT; i++) res.slots.push(0);
    records.forEach(function(r){
      if (r.day !== day) return;
      var si = slotIndex(r.ts);
      if (si < 0){ res.outside++; return; }
      res.total++;
      res.slots[si]++;
      var p = res.byPrize[r.id] || (res.byPrize[r.id] = { count: 0, label: r.label });
      p.count++;
      p.label = r.label || p.label;
    });
    return res;
  }

  // 表示する賞の一覧。現在の設定の順序を基本にし、設定から削除された賞の記録が残っていれば末尾に足す。
  function buildPrizeRows(agg, prizes){
    var rows = [];
    var seen = {};
    prizes.forEach(function(p){
      seen[p.id] = true;
      var hit = agg.byPrize[p.id];
      rows.push({ id: p.id, label: p.label || p.id, name: p.name || "", count: hit ? hit.count : 0, removed: false });
    });
    Object.keys(agg.byPrize).sort().forEach(function(id){
      if (seen[id]) return;
      var hit = agg.byPrize[id];
      rows.push({ id: id, label: hit.label || id, name: "（設定から削除された賞）", count: hit.count, removed: true });
    });
    return rows;
  }

  /* ---------- 表示 ---------- */
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function byId(id){ return document.getElementById(id); }

  var currentDay = 1;

  function renderSummary(agg){
    var html = '<div class="total-block">' +
      '<div class="total-label">' + currentDay + '日目の総抽選回数</div>' +
      '<div class="total-num">' + agg.total + '<small>回</small></div>' +
      '</div>';

    if (agg.total > 0){
      var max = Math.max.apply(null, agg.slots);
      var peaks = [];
      agg.slots.forEach(function(n, i){ if (n === max) peaks.push(SLOTS[i].label); });
      var peakText = peaks.length <= 2 ? peaks.join("、") : "複数の時間帯";
      html += '<div class="peak-box">' +
        '<div class="total-label">最も多かった時間帯</div>' +
        '<div class="peak-time">' + escapeHtml(peakText) + '</div>' +
        '<div class="peak-count">' + max + '回' + (peaks.length > 2 ? '（各時間帯）' : '') + '</div>' +
        '</div>';
    } else {
      html += '<div class="peak-box empty"><p>この日の抽選データはまだありません。<br>抽選を行うと、自動で記録されます。</p></div>';
    }

    if (agg.outside > 0){
      html += '<p class="stock-warning outside-note">この日は、9:30より前または16:30以降の抽選が ' + agg.outside +
              '回 記録されています（テスト抽選など）。時間帯別・賞別の集計には含まれません。</p>';
    }
    byId("summary").innerHTML = html;
  }

  function renderSlots(agg){
    var max = Math.max.apply(null, agg.slots);
    byId("slotBody").innerHTML = agg.slots.map(function(n, i){
      var pct = max > 0 ? (n / max) * 100 : 0;
      var peak = max > 0 && n === max;
      return '<tr' + (peak ? ' class="peak"' : '') + '>' +
        '<th scope="row" class="slot-label">' + escapeHtml(SLOTS[i].label) + '</th>' +
        '<td class="slot-bar-cell"><div class="slot-track" aria-hidden="true"><div class="slot-fill" style="width:' + pct + '%"></div></div></td>' +
        '<td class="slot-count">' + n + '<span class="unit">回</span></td>' +
        '</tr>';
    }).join("");
  }

  function renderPrizes(agg, prizes){
    var rows = buildPrizeRows(agg, prizes);
    var list = byId("prizeList");
    if (rows.length === 0){
      list.innerHTML = '<div class="empty-stock">賞が設定されていません。</div>';
      return;
    }
    list.innerHTML = rows.map(function(r){
      var share = agg.total > 0 ? (r.count / agg.total) * 100 : 0;
      var shareText = agg.total > 0 ? share.toFixed(1) + '%' : '―';
      var cls = TIER_COLORS[r.id] || "tier-default";
      return '<div class="stock-item">' +
        '<div class="stock-top">' +
        '<span class="chip ' + cls + '">' + escapeHtml(r.label) + '</span>' +
        '<div class="info"><div class="name">' + escapeHtml(r.name) + '</div>' +
        '<div class="sub">全体の ' + shareText + '</div></div>' +
        '<div class="count">' + r.count + '<span class="unit">回</span></div>' +
        '</div>' +
        '<div class="stock-bar"><div class="stock-bar-fill" style="width:' + share + '%;background:' + tierHex(r.id) + ';"></div></div>' +
        '</div>';
    }).join("");
  }

  function renderManage(records){
    var exportable = exportableRecords(records).length;
    byId("csvHint").textContent = exportable > 0
      ? "1日目・2日目すべての抽選履歴（" + exportable + "件）を、1回ごとのデータとして書き出します。Excelで開けます。"
      : "書き出せる抽選履歴がまだありません。";
    byId("csvBtn").disabled = exportable === 0;
    byId("resetBtn").disabled = records.length === 0;
  }

  function render(){
    var records = loadRecords();
    var prizes = loadPrizes();
    var agg = aggregate(records, currentDay);
    renderSummary(agg);
    renderSlots(agg);
    renderPrizes(agg, prizes);
    renderManage(records);
    Array.prototype.forEach.call(document.querySelectorAll(".day-tab"), function(btn){
      btn.setAttribute("aria-pressed", String(parseInt(btn.getAttribute("data-day"), 10) === currentDay));
    });
  }

  /* ---------- CSV出力 ---------- */
  // 集計対象（9:30〜16:30の7区間内）の履歴だけを、抽選時刻の古い順に返す。
  function exportableRecords(records){
    return records.filter(function(r){ return slotIndex(r.ts) >= 0; })
                  .sort(function(a, b){ return a.ts - b.ts; });
  }

  function csvField(v){
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function fmtDate(d){ return d.getFullYear() + "/" + pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()); }
  function fmtTime(d){ return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()); }

  function buildCsv(records){
    var lines = [["日付", "時刻", "日", "時間帯", "賞"].join(",")];
    exportableRecords(records).forEach(function(r){
      var d = new Date(r.ts);
      lines.push([
        fmtDate(d), fmtTime(d), r.day + "日目", SLOTS[slotIndex(r.ts)].label, r.label || r.id
      ].map(csvField).join(","));
    });
    // 先頭のBOMは、ExcelでUTF-8のCSVを文字化けせずに開くために必要。
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }

  function downloadCsv(){
    var records = loadRecords();
    if (exportableRecords(records).length === 0) return;
    var now = new Date();
    var name = "kuji-history_" + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
               "-" + pad2(now.getHours()) + pad2(now.getMinutes()) + ".csv";
    var blob = new Blob([buildCsv(records)], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    byId("resetMsg").innerHTML = "";
    byId("csvMsg").innerHTML = '<div class="msg ok">' + escapeHtml(name) + ' を書き出しました。</div>';
  }

  /* ---------- 確認モーダル ---------- */
  var confirmBackdrop = byId("confirmBackdrop");
  var confirmAction = null;
  function askConfirmation(message, action){
    confirmAction = action;
    byId("confirmMessage").textContent = message;
    confirmBackdrop.classList.add("show");
  }
  function closeConfirmation(){
    confirmAction = null;
    confirmBackdrop.classList.remove("show");
  }
  byId("confirmOkBtn").addEventListener("click", function(){
    var action = confirmAction;
    closeConfirmation();
    if (action) action();
  });
  byId("confirmCancelBtn").addEventListener("click", closeConfirmation);
  confirmBackdrop.addEventListener("click", function(e){
    if (e.target === confirmBackdrop) closeConfirmation();
  });

  /* ---------- イベント ---------- */
  byId("csvBtn").addEventListener("click", downloadCsv);

  byId("resetBtn").addEventListener("click", function(){
    var count = loadRecords().length;
    askConfirmation(
      "記録されている抽選データ（全" + count + "件・1日目と2日目の合計）をすべて削除します。この操作は取り消せません。必要な場合は、先にCSVを書き出してください。",
      function(){
        try{ localStorage.removeItem(STATS_KEY); }catch(e){}
        render();
        byId("csvMsg").innerHTML = "";
        byId("resetMsg").innerHTML = '<div class="msg ok">統計データをリセットしました。</div>';
      }
    );
  });

  Array.prototype.forEach.call(document.querySelectorAll(".day-tab"), function(btn){
    btn.addEventListener("click", function(){
      currentDay = parseInt(btn.getAttribute("data-day"), 10);
      render();
    });
  });

  /* ---------- 初期化 ---------- */
  render();
})();
