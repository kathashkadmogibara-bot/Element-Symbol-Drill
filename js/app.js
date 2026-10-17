(function(){
  "use strict";

  var ELEMENTS = [];

  var grid = document.getElementById("elementGrid");
  var countNum = document.getElementById("countNum");
  var totalNum = document.getElementById("totalNum");
  var pickErr = document.getElementById("pickErr");
  var filterBox = document.getElementById("filterBox");
  var loadHint = document.getElementById("loadHint");
  var startBtn = document.getElementById("startBtn");

  function buildGrid(){
    totalNum.textContent = ELEMENTS.length;
    ELEMENTS.forEach(function(el, i){
      var id = "el_" + i;
      var tile = document.createElement("label");
      tile.className = "el-tile checked";
      tile.setAttribute("for", id);
      tile.dataset.name = el.name.toLowerCase();
      tile.dataset.sym = el.symbol.toLowerCase();
      tile.innerHTML =
        '<input type="checkbox" id="' + id + '" checked data-name="' + el.name + '" data-sym="' + el.symbol + '">' +
        '<span class="sym">' + el.symbol + '</span>' +
        '<span class="nm">' + el.name + '</span>';
      grid.appendChild(tile);
    });
    loadHint.textContent = "Tap a tile to include it in the quiz. Filter narrows the list below.";
    startBtn.disabled = false;
    refreshTileStates();
  }

  // Each element lives in its own JSON file under elements/, listed in elements/manifest.json.
  // Editing one element later means editing just that one file.
  fetch("elements/manifest.json")
    .then(function(r){ return r.json(); })
    .then(function(files){
      return Promise.all(files.map(function(f){
        return fetch("elements/" + f).then(function(r){ return r.json(); });
      }));
    })
    .then(function(list){
      list.sort(function(a,b){ return a.number - b.number; });
      ELEMENTS = list;
      buildGrid();
    })
    .catch(function(err){
      loadHint.textContent = "Could not load element files. Serve this folder from a local web server (not opened directly as file://) and reload.";
      console.error(err);
    });

  function allChecks(){
    return Array.prototype.slice.call(grid.querySelectorAll('input[type="checkbox"]'));
  }

  function visibleChecks(){
    return allChecks().filter(function(cb){ return !cb.closest(".el-tile").hidden; });
  }

  function refreshTileStates(){
    allChecks().forEach(function(cb){
      cb.closest(".el-tile").classList.toggle("checked", cb.checked);
    });
    var n = allChecks().filter(function(cb){ return cb.checked; }).length;
    countNum.textContent = n;
    if(n > 0) pickErr.classList.remove("show");
  }

  grid.addEventListener("change", refreshTileStates);

  document.getElementById("selectAll").addEventListener("click", function(){
    visibleChecks().forEach(function(cb){ cb.checked = true; });
    refreshTileStates();
  });
  document.getElementById("selectNone").addEventListener("click", function(){
    visibleChecks().forEach(function(cb){ cb.checked = false; });
    refreshTileStates();
  });

  filterBox.addEventListener("input", function(){
    var q = filterBox.value.trim().toLowerCase();
    var tiles = Array.prototype.slice.call(grid.querySelectorAll(".el-tile"));
    tiles.forEach(function(tile){
      var match = !q || tile.dataset.name.indexOf(q) !== -1 || tile.dataset.sym.indexOf(q) !== -1;
      tile.hidden = !match;
    });
  });

  // ---- timer setup controls ----
  var timerOn = document.getElementById("timerOn");
  var timeFields = document.getElementById("timeFields");
  var timeHr = document.getElementById("timeHr");
  var timeMin = document.getElementById("timeMin");
  var timeSec = document.getElementById("timeSec");

  timerOn.addEventListener("change", function(){
    timeFields.hidden = !timerOn.checked;
  });

  function clampNum(input, max){
    input.addEventListener("input", function(){
      var v = parseInt(input.value, 10);
      if(isNaN(v)) v = 0;
      if(v < 0) v = 0;
      if(v > max) v = max;
      input.value = v;
    });
  }
  clampNum(timeHr, 23);
  clampNum(timeMin, 59);
  clampNum(timeSec, 59);

  // ---- screens ----
  var setupSec = document.getElementById("setup");
  var quizSec = document.getElementById("quiz");
  var resultsSec = document.getElementById("results");

  var progressTxt = document.getElementById("progressTxt");
  var progressFill = document.getElementById("progressFill");
  var clockTxt = document.getElementById("clockTxt");
  var qName = document.getElementById("qName");
  var answerForm = document.getElementById("answerForm");
  var answerInput = document.getElementById("answerInput");
  var feedback = document.getElementById("feedback");

  var state = {
    questions: [],
    idx: 0,
    score: 0,
    misses: [],
    timerSeconds: 0,
    remaining: 0,
    intervalId: null,
    locked: false
  };

  function shuffle(arr){
    var a = arr.slice();
    for(var i = a.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function fmtClock(totalSec){
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    var mm = (m < 10 ? "0" : "") + m;
    var ss = (s < 10 ? "0" : "") + s;
    if(h > 0){
      var hh = (h < 10 ? "0" : "") + h;
      return hh + ":" + mm + ":" + ss;
    }
    return mm + ":" + ss;
  }

  startBtn.addEventListener("click", function(){
    var selected = allChecks()
      .filter(function(cb){ return cb.checked; })
      .map(function(cb){ return [cb.dataset.name, cb.dataset.sym]; });

    if(selected.length === 0){
      pickErr.classList.add("show");
      return;
    }

    state.questions = shuffle(selected);
    state.idx = 0;
    state.score = 0;
    state.misses = [];
    state.locked = false;

    if(timerOn.checked){
      var total = (parseInt(timeHr.value,10) || 0) * 3600 +
                  (parseInt(timeMin.value,10) || 0) * 60 +
                  (parseInt(timeSec.value,10) || 0);
      if(total <= 0) total = 60;
      state.timerSeconds = total;
      state.remaining = total;
      clockTxt.hidden = false;
      startClock();
    } else {
      state.timerSeconds = 0;
      clockTxt.hidden = true;
      if(state.intervalId) clearInterval(state.intervalId);
    }

    setupSec.hidden = true;
    resultsSec.hidden = true;
    quizSec.hidden = false;
    renderQuestion();
  });

  function startClock(){
    if(state.intervalId) clearInterval(state.intervalId);
    clockTxt.textContent = fmtClock(state.remaining);
    clockTxt.classList.remove("low");
    state.intervalId = setInterval(function(){
      state.remaining--;
      if(state.remaining <= 10 && state.remaining >= 0) clockTxt.classList.add("low");
      if(state.remaining <= 0){
        clockTxt.textContent = fmtClock(0);
        clearInterval(state.intervalId);
        finishQuiz(true);
        return;
      }
      clockTxt.textContent = fmtClock(state.remaining);
    }, 1000);
  }

  function renderQuestion(){
    var total = state.questions.length;
    progressTxt.textContent = "Question " + (state.idx + 1) + "/" + total;
    progressFill.style.width = ((state.idx) / total * 100) + "%";
    var q = state.questions[state.idx];
    qName.textContent = q[0];
    answerInput.value = "";
    feedback.textContent = "";
    feedback.className = "feedback";
    state.locked = false;
    setTimeout(function(){ answerInput.focus(); }, 30);
  }

  answerForm.addEventListener("submit", function(e){
    e.preventDefault();
    if(state.locked) return;
    state.locked = true;

    var q = state.questions[state.idx];
    var given = answerInput.value.trim();
    var correct = given.toLowerCase() === q[1].toLowerCase();

    if(correct){
      state.score++;
      feedback.textContent = "Correct — " + q[1];
      feedback.className = "feedback good";
    } else {
      state.misses.push({ name: q[0], correct: q[1], given: given || "(blank)" });
      feedback.textContent = "Not quite — " + q[0] + " is " + q[1];
      feedback.className = "feedback bad";
    }

    setTimeout(function(){
      state.idx++;
      if(state.idx >= state.questions.length){
        finishQuiz(false);
      } else {
        renderQuestion();
      }
    }, correct ? 450 : 1100);
  });

  function finishQuiz(timedOut){
    if(state.intervalId) clearInterval(state.intervalId);
    progressFill.style.width = "100%";

    var total = state.questions.length;
    var answered = timedOut ? state.idx : total;
    var scoreTotalBase = timedOut ? answered : total;

    quizSec.hidden = true;
    resultsSec.hidden = false;

    document.getElementById("resultHeadline").textContent = timedOut ? "Time's up" : "Quiz over";
    document.getElementById("scoreNum").textContent = state.score;
    document.getElementById("scoreTotal").textContent = scoreTotalBase || total;

    var pct = scoreTotalBase > 0 ? Math.round((state.score / scoreTotalBase) * 100) : 0;
    document.getElementById("scorePct").textContent = pct + "%";

    var tag = document.getElementById("resultTag");
    var tagText;
    if(scoreTotalBase > 0 && state.score === scoreTotalBase){
      tagText = "Perfect score";
    } else if(pct >= 80){
      tagText = "Excellent";
    } else if(pct >= 60){
      tagText = "Good job";
    } else {
      tagText = "Keep practising";
    }
    tag.textContent = tagText;

    var missList = document.getElementById("missList");
    var noMiss = document.getElementById("noMiss");
    var missItems = document.getElementById("missItems");
    missItems.innerHTML = "";

    if(state.misses.length === 0){
      missList.hidden = true;
      noMiss.hidden = false;
    } else {
      noMiss.hidden = true;
      missList.hidden = false;
      state.misses.forEach(function(m){
        var row = document.createElement("div");
        row.className = "miss-item";
        row.innerHTML =
          '<span>' + m.name + '</span>' +
          '<span><span class="got">' + m.given + '</span> → <span class="want">' + m.correct + '</span></span>';
        missItems.appendChild(row);
      });
    }
  }

  document.getElementById("againBtn").addEventListener("click", function(){
    startBtn.click();
  });
  document.getElementById("changeBtn").addEventListener("click", function(){
    resultsSec.hidden = true;
    setupSec.hidden = false;
    clockTxt.hidden = true;
    if(state.intervalId) clearInterval(state.intervalId);
  });
})();
