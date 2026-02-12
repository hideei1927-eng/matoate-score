const SCORE_MIN = 0;
const SCORE_MAX = 10;
const STATION_STEP = 15;
const STATIONS = ["東京", "上野", "大宮", "仙台", "盛岡", "八戸", "新青森"];
const LAP_GOAL = STATION_STEP * (STATIONS.length - 1); // 90

const SETTINGS_KEY = "matoate.settings.v1";
const LAST_MATCH_KEY = "matoate.lastMatch.v1";
const BEST_TOTAL_KEY = "matoate.bestTotal.v1";

const DEFAULT_SETTINGS = {
  playerNames: ["プレイヤー1", "プレイヤー2"],
  throwsPerSet: 10,
  setCount: 2,
};

const ui = {
  player1Name: document.getElementById("player1Name"),
  player2Name: document.getElementById("player2Name"),
  throwsPerSet: document.getElementById("throwsPerSet"),
  setCount: document.getElementById("setCount"),
  applySettingsButton: document.getElementById("applySettingsButton"),
  resetMatchButton: document.getElementById("resetMatchButton"),
  turnInfo: document.getElementById("turnInfo"),
  matchInfo: document.getElementById("matchInfo"),
  winnerInfo: document.getElementById("winnerInfo"),
  undoButton: document.getElementById("undoButton"),
  scoreButtons: document.getElementById("scoreButtons"),
  scoreboard: document.getElementById("scoreboard"),
  trainBoard: document.getElementById("trainBoard"),
  bestScoreInfo: document.getElementById("bestScoreInfo"),
  lastMatchInfo: document.getElementById("lastMatchInfo"),
  selfCheckList: document.getElementById("selfCheckList"),
};

let settings = loadSettings();
let bestTotal = loadBestTotal();
let lastMatch = loadLastMatch();

let appState = createMatchState(settings);
let undoStack = [];

init();

function init() {
  bindEvents();
  buildScoreButtons();
  syncSettingsToInputs();
  render();
  runSelfChecks();
  registerServiceWorker();
}

function bindEvents() {
  ui.applySettingsButton.addEventListener("click", applySettingsAndRestart);
  ui.resetMatchButton.addEventListener("click", resetMatchWithConfirm);
  ui.undoButton.addEventListener("click", () => {
    undoLastThrow();
  });
}

function buildScoreButtons() {
  ui.scoreButtons.innerHTML = "";
  for (let score = SCORE_MIN; score <= SCORE_MAX; score += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "score-btn";
    button.textContent = String(score);
    button.addEventListener("click", () => handleScoreInput(score));
    ui.scoreButtons.appendChild(button);
  }
}

function applySettingsAndRestart() {
  const next = readSettingsFromInputs();
  if (!next) return;
  const confirmMessage = "設定を保存して新しい試合を開始します。現在の試合を破棄しますか？";
  if (!window.confirm(confirmMessage)) return;
  settings = next;
  saveSettings(settings);
  startNewMatch();
}

function resetMatchWithConfirm() {
  if (!window.confirm("現在の試合をリセットします。よろしいですか？")) return;
  startNewMatch();
}

function startNewMatch() {
  appState = createMatchState(settings);
  undoStack = [];
  render();
}

function readSettingsFromInputs() {
  const p1 = sanitizeName(ui.player1Name.value, "プレイヤー1");
  const p2 = sanitizeName(ui.player2Name.value, "プレイヤー2");
  const throwsPerSet = clampNumber(parseInt(ui.throwsPerSet.value, 10), 1, 30, 10);
  const setCount = clampNumber(parseInt(ui.setCount.value, 10), 1, 4, 2);
  return {
    playerNames: [p1, p2],
    throwsPerSet,
    setCount,
  };
}

function sanitizeName(value, fallback) {
  const name = String(value || "").trim();
  return name.length > 0 ? name : fallback;
}

function clampNumber(value, min, max, fallback) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function syncSettingsToInputs() {
  ui.player1Name.value = settings.playerNames[0];
  ui.player2Name.value = settings.playerNames[1];
  ui.throwsPerSet.value = String(settings.throwsPerSet);
  ui.setCount.value = String(settings.setCount);
}

function createMatchState(currentSettings) {
  return {
    settings: deepClone(currentSettings),
    scores: [
      Array.from({ length: currentSettings.setCount }, () => []),
      Array.from({ length: currentSettings.setCount }, () => []),
    ],
    currentSet: 0,
    currentPlayer: 0,
    finished: false,
    winnerIndex: null,
    winnerReason: "",
    suddenDeath: {
      active: false,
      currentPlayer: 0,
      scores: [[], []],
      minThrowsEach: 3,
    },
  };
}

function handleScoreInput(score) {
  if (appState.finished) {
    window.alert("試合は終了しています。新規試合を開始してください。");
    return;
  }
  pushUndoSnapshot();

  if (appState.suddenDeath.active) {
    recordSuddenDeathThrow(score);
  } else {
    recordNormalThrow(score);
  }

  render();
}

function pushUndoSnapshot() {
  undoStack.push(deepClone(appState));
}

function recordNormalThrow(score) {
  const player = appState.currentPlayer;
  const setIndex = appState.currentSet;
  appState.scores[player][setIndex].push(score);
  advanceTurnNormal();
}

function advanceTurnNormal() {
  const p0Count = appState.scores[0][appState.currentSet].length;
  const p1Count = appState.scores[1][appState.currentSet].length;
  const limit = appState.settings.throwsPerSet;

  const setDone = p0Count >= limit && p1Count >= limit;
  if (setDone) {
    if (appState.currentSet < appState.settings.setCount - 1) {
      appState.currentSet += 1;
      appState.currentPlayer = 0;
      return;
    }
    finishRegularMatch();
    return;
  }

  if (p0Count >= limit && p1Count < limit) {
    appState.currentPlayer = 1;
    return;
  }
  if (p1Count >= limit && p0Count < limit) {
    appState.currentPlayer = 0;
    return;
  }
  appState.currentPlayer = appState.currentPlayer === 0 ? 1 : 0;
}

function finishRegularMatch() {
  const result = calculateWinner(appState);
  if (result.status === "winner") {
    finishMatch(result.winnerIndex, result.reason);
    return;
  }
  startSuddenDeathIfNeeded();
}

function recordSuddenDeathThrow(score) {
  const sd = appState.suddenDeath;
  const player = sd.currentPlayer;
  sd.scores[player].push(score);
  sd.currentPlayer = sd.currentPlayer === 0 ? 1 : 0;
  evaluateSuddenDeath();
}

function evaluateSuddenDeath() {
  const sd = appState.suddenDeath;
  const aCount = sd.scores[0].length;
  const bCount = sd.scores[1].length;
  if (aCount !== bCount) return;
  if (aCount < sd.minThrowsEach) return;

  const aTotal = sum(sd.scores[0]);
  const bTotal = sum(sd.scores[1]);
  if (aTotal === bTotal) return;

  const winnerIndex = aTotal > bTotal ? 0 : 1;
  const reason =
    aCount === sd.minThrowsEach
      ? "サドンデス3球の合計点で勝利"
      : `延長サドンデス（各${aCount}球）で勝利`;
  finishMatch(winnerIndex, reason);
}

function finishMatch(winnerIndex, reason) {
  appState.finished = true;
  appState.winnerIndex = winnerIndex;
  appState.winnerReason = reason;
  appState.suddenDeath.active = false;

  const totals = getOverallTotals(appState);
  bestTotal = Math.max(bestTotal, totals[0], totals[1]);
  saveBestTotal(bestTotal);

  lastMatch = {
    finishedAt: new Date().toISOString(),
    playerNames: deepClone(appState.settings.playerNames),
    setTotals: [
      getSetTotalsForPlayer(appState, 0),
      getSetTotalsForPlayer(appState, 1),
    ],
    suddenDeathTotals: [
      sum(appState.suddenDeath.scores[0]),
      sum(appState.suddenDeath.scores[1]),
    ],
    totals,
    winnerIndex,
    winnerReason: reason,
  };
  saveLastMatch(lastMatch);
}

function getSetTotalsForPlayer(state, playerIndex) {
  return state.scores[playerIndex].map((setThrows) => sum(setThrows));
}

function getOverallTotals(state) {
  const regular0 = sum(getSetTotalsForPlayer(state, 0));
  const regular1 = sum(getSetTotalsForPlayer(state, 1));
  const sd0 = sum(state.suddenDeath.scores[0]);
  const sd1 = sum(state.suddenDeath.scores[1]);
  return [regular0 + sd0, regular1 + sd1];
}

function getTrainProgress(totalScore) {
  const score = Math.max(0, Math.floor(totalScore));
  const reachedGoal = score > 0 && score % LAP_GOAL === 0;
  const lap = score === 0 ? 1 : Math.floor((score - 1) / LAP_GOAL) + 1;

  let inLap = 0;
  if (score > 0) {
    inLap = score - (lap - 1) * LAP_GOAL;
  }

  const lapProgress = Math.min(1, inLap / LAP_GOAL);
  const stationIndex = Math.min(Math.floor(inLap / STATION_STEP), STATIONS.length - 1);
  const currentStation = STATIONS[stationIndex];
  const nextStation =
    inLap >= LAP_GOAL ? STATIONS[0] : STATIONS[Math.min(stationIndex + 1, STATIONS.length - 1)];

  let toNext = 0;
  if (inLap < LAP_GOAL) {
    const remainder = inLap % STATION_STEP;
    toNext = remainder === 0 ? STATION_STEP : STATION_STEP - remainder;
  }

  return {
    lap,
    inLap,
    currentStation,
    nextStation,
    toNext,
    lapProgress,
    reachedGoal,
  };
}

function calculateWinner(matchState) {
  const setTotals0 = getSetTotalsForPlayer(matchState, 0);
  const setTotals1 = getSetTotalsForPlayer(matchState, 1);
  const total0 = sum(setTotals0);
  const total1 = sum(setTotals1);

  if (total0 !== total1) {
    return {
      status: "winner",
      winnerIndex: total0 > total1 ? 0 : 1,
      reason: "総合計で勝利",
    };
  }

  const maxSet0 = Math.max(...setTotals0);
  const maxSet1 = Math.max(...setTotals1);
  if (maxSet0 !== maxSet1) {
    return {
      status: "winner",
      winnerIndex: maxSet0 > maxSet1 ? 0 : 1,
      reason: "最高セット得点で勝利",
    };
  }

  return { status: "sudden-death" };
}

function undoLastThrow() {
  if (undoStack.length === 0) {
    window.alert("取り消せる入力がありません。");
    return;
  }
  appState = undoStack.pop();
  render();
}

function startSuddenDeathIfNeeded() {
  appState.suddenDeath.active = true;
  appState.suddenDeath.currentPlayer = 0;
}

function render() {
  renderStatus();
  renderScoreboard();
  renderTrainBoard();
  renderSavedInfo();
}

function renderStatus() {
  const names = appState.settings.playerNames;
  if (appState.finished) {
    const winnerName = names[appState.winnerIndex];
    ui.turnInfo.textContent = "試合終了";
    ui.matchInfo.textContent = `${winnerName} の勝ち`;
    ui.winnerInfo.textContent = `勝因: ${appState.winnerReason}`;
    return;
  }

  if (appState.suddenDeath.active) {
    const sd = appState.suddenDeath;
    const throwNo = sd.scores[sd.currentPlayer].length + 1;
    ui.turnInfo.textContent = `サドンデス: ${names[sd.currentPlayer]} の ${throwNo} 球目`;
    ui.matchInfo.textContent = "同点のためサドンデス中（1球ずつ交互入力）";
    ui.winnerInfo.textContent = "";
    return;
  }

  const setNo = appState.currentSet + 1;
  const player = appState.currentPlayer;
  const throwNo = appState.scores[player][appState.currentSet].length + 1;
  ui.turnInfo.textContent = `第${setNo}セット: ${names[player]} の ${throwNo} 球目`;
  ui.matchInfo.textContent = `各プレイヤー ${appState.settings.throwsPerSet} 球 / 全${appState.settings.setCount}セット`;
  ui.winnerInfo.textContent = "";
}

function renderScoreboard() {
  const setCount = appState.settings.setCount;
  const names = appState.settings.playerNames;
  const setHeaders = Array.from({ length: setCount }, (_, i) => `<th>セット${i + 1}</th>`).join("");

  const rowHtml = [0, 1]
    .map((player) => {
      const setTotals = getSetTotalsForPlayer(appState, player);
      const regularTotal = sum(setTotals);
      const suddenTotal = sum(appState.suddenDeath.scores[player]);
      const cells = setTotals.map((s) => `<td>${s}</td>`).join("");
      const extra = suddenTotal > 0 ? `（SD:${suddenTotal}）` : "";
      return `<tr>
        <th>${escapeHtml(names[player])}</th>
        ${cells}
        <td>${regularTotal + suddenTotal}${extra}</td>
      </tr>`;
    })
    .join("");

  ui.scoreboard.innerHTML = `
    <table class="scoreboard-table">
      <thead>
        <tr>
          <th>プレイヤー</th>
          ${setHeaders}
          <th>総合計</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>
  `;
}

function renderTrainBoard() {
  const names = appState.settings.playerNames;
  const totals = getOverallTotals(appState);
  ui.trainBoard.innerHTML = [0, 1]
    .map((player) => {
      const progress = getTrainProgress(totals[player]);
      const safeLapProgress = Number.isFinite(progress.lapProgress)
        ? progress.lapProgress
        : Math.min(1, Math.max(0, (progress.inLap || 0) / LAP_GOAL));
      const stationDots = STATIONS.map((_, i) => {
        const pct = (i / (STATIONS.length - 1)) * 100;
        return `<span class="station-dot" style="left:${pct}%"></span>`;
      }).join("");

      const labels = STATIONS.map((name) => `<span>${name}</span>`).join("");
      const clear = progress.reachedGoal ? `<span class="clear-badge">${progress.lap}周クリア</span>` : "";
      const trainLeftPercent = Math.max(0, Math.min(100, safeLapProgress * 100));
      const trainLeft = `${trainLeftPercent.toFixed(2)}%`;

      return `
        <div class="train-card">
          <div class="train-head">
            <span>${escapeHtml(names[player])}</span>
            <span>総合計: ${totals[player]}点</span>
          </div>
          <div class="rail">
            <div class="rail-line"></div>
            ${stationDots}
            <span class="train-icon" style="left:calc(${trainLeft} - 11px)">🚄</span>
          </div>
          <div class="station-labels">${labels}</div>
          <p class="train-meta">
            現在駅: ${progress.currentStation} / 次駅: ${progress.nextStation} / 次駅まで: ${progress.toNext}点
            ${clear}
          </p>
        </div>
      `;
    })
    .join("");
}

function renderSavedInfo() {
  ui.bestScoreInfo.textContent = `自己ベスト総合点（単一プレイヤー最高）: ${bestTotal}点`;

  if (!lastMatch) {
    ui.lastMatchInfo.textContent = "直近試合結果: まだありません。";
    return;
  }

  const date = new Date(lastMatch.finishedAt);
  const dateText = Number.isNaN(date.getTime()) ? lastMatch.finishedAt : date.toLocaleString("ja-JP");
  const winnerName = lastMatch.playerNames[lastMatch.winnerIndex] || "不明";
  ui.lastMatchInfo.innerHTML = `
    <p>直近試合結果: ${dateText}</p>
    <p>${escapeHtml(lastMatch.playerNames[0])}: ${lastMatch.totals[0]}点 / ${escapeHtml(lastMatch.playerNames[1])}: ${lastMatch.totals[1]}点</p>
    <p>勝者: ${escapeHtml(winnerName)}（${escapeHtml(lastMatch.winnerReason)}）</p>
  `;
}

function runSelfChecks() {
  const checks = [];

  const testState = {
    scores: [
      [Array(10).fill(5), Array(10).fill(4)],
      [Array(10).fill(3), Array(10).fill(2)],
    ],
    suddenDeath: { scores: [[], []] },
  };
  const totalA = sum(testState.scores[0][0]) + sum(testState.scores[0][1]);
  const totalB = sum(testState.scores[1][0]) + sum(testState.scores[1][1]);
  checks.push({
    label: "10投×2セットで正しい合計になる",
    pass: totalA === 90 && totalB === 50,
  });

  const p10 = getTrainProgress(10).lapProgress;
  const p11 = getTrainProgress(11).lapProgress;
  checks.push({
    label: "1点入力ごとに列車位置が進む",
    pass: p11 > p10,
  });

  checks.push({
    label: "15点ごとに駅表示が更新される",
    pass:
      getTrainProgress(14).currentStation === "東京" &&
      getTrainProgress(15).currentStation === "上野" &&
      getTrainProgress(30).currentStation === "大宮",
  });

  const p90 = getTrainProgress(90);
  checks.push({
    label: "90点で1周クリア表示",
    pass: p90.reachedGoal === true && p90.currentStation === "新青森",
  });

  const tempSettings = {
    playerNames: ["A", "B"],
    throwsPerSet: 8,
    setCount: 3,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(tempSettings));
  const loaded = loadSettings();
  checks.push({
    label: "再読み込みで設定と履歴が復元される（設定値確認）",
    pass: loaded.throwsPerSet === 8 && loaded.setCount === 3,
  });
  saveSettings(settings);

  const anyScoreButton = document.querySelector(".score-btn");
  const buttonHeight = anyScoreButton ? parseInt(getComputedStyle(anyScoreButton).minHeight, 10) : 0;
  checks.push({
    label: "iPhone表示幅（390px程度）で操作しやすい（大ボタン）",
    pass: buttonHeight >= 64,
  });

  ui.selfCheckList.innerHTML = checks
    .map((c) => `<li>${c.pass ? "OK" : "NG"}: ${escapeHtml(c.label)}</li>`)
    .join("");
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return deepClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    const merged = {
      playerNames: [
        sanitizeName(parsed?.playerNames?.[0], DEFAULT_SETTINGS.playerNames[0]),
        sanitizeName(parsed?.playerNames?.[1], DEFAULT_SETTINGS.playerNames[1]),
      ],
      throwsPerSet: clampNumber(parsed?.throwsPerSet, 1, 30, DEFAULT_SETTINGS.throwsPerSet),
      setCount: clampNumber(parsed?.setCount, 1, 4, DEFAULT_SETTINGS.setCount),
    };
    return merged;
  } catch (error) {
    return deepClone(DEFAULT_SETTINGS);
  }
}

function saveSettings(value) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
}

function loadBestTotal() {
  const raw = localStorage.getItem(BEST_TOTAL_KEY);
  const val = raw ? Number(raw) : 0;
  return Number.isFinite(val) ? val : 0;
}

function saveBestTotal(value) {
  localStorage.setItem(BEST_TOTAL_KEY, String(value));
}

function loadLastMatch() {
  try {
    const raw = localStorage.getItem(LAST_MATCH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function saveLastMatch(value) {
  localStorage.setItem(LAST_MATCH_KEY, JSON.stringify(value));
}

function sum(values) {
  return values.reduce((acc, n) => acc + n, 0);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  const isLocalhost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // Failed registration does not block app usage.
    });
  });
}

window.getTrainProgress = getTrainProgress;
window.calculateWinner = calculateWinner;
window.undoLastThrow = undoLastThrow;
window.startSuddenDeathIfNeeded = startSuddenDeathIfNeeded;
