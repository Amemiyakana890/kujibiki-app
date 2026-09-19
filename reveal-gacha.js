/* =========================================================
   reveal-gacha.js
   2日目用の演出。app-core.js の読み込み後に読み込むこと。
   演出が終わったら Kuji.finishReveal(prize) を呼び出す。
   ========================================================= */
(function(){
  "use strict";
  var Kuji = window.Kuji;
  var els = Kuji.els;

  var overlay = document.getElementById("gachaOverlay");
  var capsule = document.getElementById("gachaCapsule");
  var banner = document.getElementById("cutinBanner");
  var flash = document.getElementById("cutinFlash");
  var cutinTag = document.getElementById("cutinTag");
  var cutinName = document.getElementById("cutinName");

  var gachaActive = false;
  var pendingPrize = null;
  var runId = 0;
  var watchdog = null;

  function resetVisual(){
    overlay.classList.remove("fading");
    capsule.className = "capsule";
    banner.className = "cutin-banner";
    banner.style.opacity = "0";
    flash.classList.remove("pulse");
  }

  function startGachaReveal(prize){
    pendingPrize = prize;
    gachaActive = true;
    var myRun = ++runId;
    function isDead(){ return !gachaActive || myRun !== runId; }

    resetVisual();
    overlay.style.display = "block";
    capsule.classList.add("shake");
    cutinTag.textContent = "";
    cutinTag.style.color = "#fff";
    cutinName.textContent = "";

    watchdog = setTimeout(function(){
      if (!gachaActive) return;
      finish();
    }, 10000);

    var rattleTimer = setInterval(function(){
      if (isDead()){ clearInterval(rattleTimer); return; }
      Kuji.beep(320 + Math.random() * 180, 0, 0.04, 0.05);
    }, 110);

    setTimeout(function(){
      clearInterval(rattleTimer);
      if (isDead()) return;
      capsule.classList.remove("shake");
      capsule.classList.add("crack");
      flash.classList.add("pulse");
      Kuji.playRevealSting();

      setTimeout(function(){
        if (isDead()) return;
        cutinTag.textContent = prize.label;
        cutinTag.style.color = prize.id === "B" ? "#9FC5FF" : Kuji.tierHex(prize.id);
        cutinName.textContent = prize.name || "";
        banner.style.opacity = "1";
        banner.classList.add("slide-in");
        els.scratchWrap.classList.add("impact");
        setTimeout(function(){ els.scratchWrap.classList.remove("impact"); }, 340);

        setTimeout(function(){
          if (isDead()) return;
          finish();
        }, 900);
      }, 260);
    }, 900);
  }

  function finish(){
    if (!gachaActive) return;
    gachaActive = false;
    runId++;
    if (watchdog){
      clearTimeout(watchdog);
      watchdog = null;
    }
    overlay.classList.add("fading");
    setTimeout(function(){ hideGachaOverlay(); }, 420);
    Kuji.finishReveal(pendingPrize);
  }

  function hideGachaOverlay(){
    gachaActive = false;
    runId++;
    if (watchdog){
      clearTimeout(watchdog);
      watchdog = null;
    }
    overlay.classList.remove("fading");
    overlay.style.display = "none";
    capsule.className = "capsule";
    banner.className = "cutin-banner";
    banner.style.opacity = "0";
    flash.classList.remove("pulse");
    els.scratchWrap.classList.remove("impact");
  }

  Kuji.startReveal = startGachaReveal;
  Kuji.hideRevealOverlay = hideGachaOverlay;
})();
