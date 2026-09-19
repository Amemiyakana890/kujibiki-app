/* =========================================================
   reveal-scratch.js
   1日目用の演出。app-core.js の読み込み後に読み込むこと。
   演出が終わったら Kuji.finishReveal(prize) を呼び出す。
   ========================================================= */
(function(){
  "use strict";
  var Kuji = window.Kuji;
  var els = Kuji.els;

  var scratchCanvas = document.getElementById("scratchCanvas");
  var scratchHint = document.getElementById("scratchHint");

  var scratchActive = false;
  var scratchCtx = null;
  var pendingPrize = null;
  var lastTickTime = 0;
  var scratchRunId = 0;
  var scratchWatchdog = null;

  function roundRectPath(c,x,y,w,h,r){
    c.beginPath();
    c.moveTo(x+r,y);
    c.arcTo(x+w,y,x+w,y+h,r);
    c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r);
    c.arcTo(x,y,x+w,y,r);
    c.closePath();
  }

  function startScratchCard(prize){
    pendingPrize = prize;
    scratchActive = true;
    var rect = setupScratchCanvas();
    scratchWatchdog = setTimeout(function(){
      if (!scratchActive) return;
      els.scratchWrap.classList.remove("suspense");
      finishAutoScratch(rect);
    }, 10000);
    runAutoScratch(rect);
  }

  function setupScratchCanvas(){
    var canvas = scratchCanvas;
    canvas.classList.remove("fading");
    canvas.style.display = "block";
    canvas.style.opacity = "1";
    var rect = els.scratchWrap.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var w = rect.width, h = rect.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    var c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    scratchCtx = c;

    var grad = c.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#e3e7ee");
    grad.addColorStop(.35, "#fbfcff");
    grad.addColorStop(.55, "#c7ccd6");
    grad.addColorStop(1, "#eef0f5");
    c.fillStyle = grad;
    roundRectPath(c, 0, 0, w, h, 20);
    c.fill();

    c.save();
    roundRectPath(c, 0, 0, w, h, 20);
    c.clip();
    c.globalAlpha = 0.12;
    c.strokeStyle = "#5a6072";
    c.lineWidth = 6;
    for (var x = -h; x < w + h; x += 14){
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + h, h);
      c.stroke();
    }
    c.restore();
    c.globalAlpha = 1;

    c.fillStyle = "rgba(55,55,70,.6)";
    c.font = "700 16px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("抽選中…", w / 2, h / 2 + 40);

    c.globalCompositeOperation = "destination-out";
    return { w: w, h: h };
  }

  function buildScratchPath(w, h){
    var pad = 16;
    var rowGap = 30;
    var rows = Math.max(4, Math.round((h - pad * 2) / rowGap));
    var rowH = (h - pad * 2) / (rows - 1 || 1);
    var colStep = 11;
    var path = [];
    for (var r = 0; r < rows; r++){
      var y = pad + r * rowH;
      var leftToRight = (r % 2 === 0);
      var steps = Math.max(2, Math.round((w - pad * 2) / colStep));
      for (var s = 0; s <= steps; s++){
        var t = s / steps;
        var x = leftToRight ? (pad + t * (w - pad * 2)) : (w - pad - t * (w - pad * 2));
        var jitter = Math.sin(r * 2.7 + s * 0.55) * 4;
        path.push({ x: x, y: y + jitter });
      }
    }
    return path;
  }

  function positionHint(pt){
    scratchHint.style.left = pt.x + "px";
    scratchHint.style.top = pt.y + "px";
    scratchHint.classList.toggle("flip", Math.round(pt.x) % 22 < 11);
  }

  function buildTeaseSpots(w, h){
    var pts = [];
    var cx = w / 2, cy = h / 2;
    for (var i = 0; i < 4; i++){
      pts.push({ x: cx + (Math.random() - 0.5) * w * 0.34, y: cy + (Math.random() - 0.5) * h * 0.3 });
    }
    return pts;
  }

  function playScratchTick(){
    Kuji.beep(260 + Math.random() * 260, 0, 0.045, 0.05);
  }

  function runAutoScratch(rect){
    var myRun = ++scratchRunId;
    var path = buildScratchPath(rect.w, rect.h);
    var teaseSpots = buildTeaseSpots(rect.w, rect.h);
    var mainStop = Math.floor(path.length * 0.8);
    var idx = 0, teaseIdx = 0;

    scratchHint.classList.remove("hide");
    positionHint(teaseSpots[0]);

    function isDead(){ return !scratchActive || myRun !== scratchRunId; }

    function teaseStep(){
      if (isDead()) return;
      if (teaseIdx < teaseSpots.length){
        var pt = teaseSpots[teaseIdx++];
        scratchCtx.beginPath();
        scratchCtx.arc(pt.x, pt.y, 19, 0, Math.PI * 2);
        scratchCtx.fill();
        positionHint(pt);
        playScratchTick();
        setTimeout(teaseStep, 260);
      } else {
        setTimeout(function(){ if (!isDead()) mainSweep(); }, 120);
      }
    }

    function mainSweep(){ requestAnimationFrame(stepMain); }

    function stepMain(){
      if (isDead()) return;
      var pointsPerFrame = 2;
      for (var b = 0; b < pointsPerFrame && idx < mainStop; b++, idx++){
        var pt = path[idx];
        scratchCtx.beginPath();
        scratchCtx.arc(pt.x, pt.y, 26, 0, Math.PI * 2);
        scratchCtx.fill();
        positionHint(pt);
      }
      var now = performance.now();
      if (now - lastTickTime > 62){
        lastTickTime = now;
        playScratchTick();
      }
      if (idx < mainStop){
        requestAnimationFrame(stepMain);
      } else {
        suspensePause();
      }
    }

    function suspensePause(){
      if (isDead()) return;
      scratchHint.classList.add("hide");
      els.scratchWrap.classList.add("suspense");
      Kuji.playHeartbeat();
      setTimeout(function(){
        if (isDead()) return;
        Kuji.playHeartbeat();
      }, 420);
      setTimeout(function(){
        if (isDead()) return;
        els.scratchWrap.classList.remove("suspense");
        finalSweep(rect, path, idx);
      }, 780);
    }

    teaseStep();
  }

  function finalSweep(rect, path, idx){
    for (var i = idx; i < path.length; i++){
      var pt = path[i];
      scratchCtx.beginPath();
      scratchCtx.arc(pt.x, pt.y, 30, 0, Math.PI * 2);
      scratchCtx.fill();
    }
    finishAutoScratch(rect);
  }

  function finishAutoScratch(rect){
    if (!scratchActive) return;
    if (scratchWatchdog){
      clearTimeout(scratchWatchdog);
      scratchWatchdog = null;
    }
    if (scratchCtx){ scratchCtx.clearRect(0, 0, rect.w, rect.h); }
    Kuji.playRevealSting();
    els.scratchWrap.classList.add("pop");
    setTimeout(function(){ els.scratchWrap.classList.remove("pop"); }, 460);
    finish();
  }

  function finish(){
    if (!scratchActive) return;
    scratchActive = false;
    scratchRunId++;
    if (scratchWatchdog){
      clearTimeout(scratchWatchdog);
      scratchWatchdog = null;
    }
    scratchHint.classList.add("hide");
    scratchCanvas.classList.add("fading");
    setTimeout(function(){ scratchCanvas.style.display = "none"; }, 460);
    Kuji.finishReveal(pendingPrize);
  }

  function hideScratchOverlay(){
    scratchActive = false;
    scratchRunId++;
    if (scratchWatchdog){
      clearTimeout(scratchWatchdog);
      scratchWatchdog = null;
    }
    scratchHint.classList.add("hide");
    scratchCanvas.classList.remove("fading");
    scratchCanvas.style.display = "none";
    els.scratchWrap.classList.remove("suspense", "pop");
  }

  Kuji.startReveal = startScratchCard;
  Kuji.hideRevealOverlay = hideScratchOverlay;
})();
