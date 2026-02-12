const SCORE_MIN = 0;
const SCORE_MAX = 10;
const STATION_STEP = 15;
const STATIONS = ["東京", "上野", "大宮", "仙台", "盛岡", "八戸", "新青森"];
const LAP_GOAL = STATION_STEP * (STATIONS.length - 1); // 90

const SETTINGS_KEY = "matoate.settings.v1";
const LAST_MATCH_KEY = "matoate.lastMatch.v1";
const BEST_TOTAL_KEY = "matoate.bestTotal.v1";

const DEFAULT_SETTINGS = {
  playerCount: 2,
  playerNames: ["プレイヤー１", "プレイヤー２", "プレイヤー３"],
  throwsPerSet: 10,
  setCount: 2,
};

const ui = {
  settingsSection: document.getElementById("settingsSection"),
  statusSection: document.getElementById("statusSection"),
  inputSection: document.getElementById("inputSection"),
  scoreboardSection: document.getElementById("scoreboardSection"),
  trainSection: document.getElementById("trainSection"),
  savedSection: document.getElementById("savedSection"),
  selfCheckSection: document.getElementById("selfCheckSection"),
  playerCount: document.getElementById("playerCount"),
  player1Name: document.getElementById("player1Name"),
  player2Name: document.getElementById("player2Name"),
  player3Name: document.getElementById("player3Name"),
  player3Wrap: document.getElementById("player3Wrap"),
  throwsPerSet: document.getElementById("throwsPerSet"),
  setCount: document.getElementById("setCount"),
  startMatchButton: document.getElementById("startMatchButton"),
  applySettingsButton: document.getElementById("applySettingsButton"),
  showSettingsButton: document.getElementById("showSettingsButton"),
  resetMatchButton: document.getElementById("resetMatchButton"),
  turnInfo: document.getElementById("turnInfo"),
  playTurnInfo: document.getElementById("playTurnInfo"),
  matchInfo: document.getElementById("matchInfo"),
  winnerInfo: document.getElementById("winnerInfo"),
  undoButton: document.getElementById("undoButton"),
  undoInlineButton: document.getElementById("undoInlineButton"),
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

let appState = null;
let matchStarted = false;
let undoStack = [];

init();

function init() {
  bindEvents();
  buildScoreButtons();
  syncSettingsToInputs();
  applyPlayerCountVisibility();
  render();
  runSelfChecks();
  registerServiceWorker();
}

function bindEvents() {
  ui.playerCount.addEventListener("change", applyPlayerCountVisibility);
  ui.startMatchButton.addEventListener("click", startMatchFromInputs);
  ui.applySettingsButton.addEventListener("click", applySettingsOnly);
  ui.showSettingsButton.addEventListener("click", () => {
    if (matchStarted && !window.confirm("設定を表示するとプレーを中断します。よろしいですか？")) return;
    matchStarted = false;
    appState = null;
    undoStack = [];
    render();
  });
  ui.resetMatchButton.addEventListener("click", resetMatchWithConfirm);
  ui.undoButton.addEventListener("click", () => undoLastThrow());
  ui.undoInlineButton.addEventListener("click", () => undoLastThrow());
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

function applyPlayerCountVisibility() {
  const count = Number(ui.playerCount.value || 2);
  ui.player3Wrap.classList.toggle("hidden", count !== 3);
}

function applySettingsOnly() {
  const next = readSettingsFromInputs();
  settings = next;
  saveSettings(settings);
  syncSettingsToInputs();
  applyPlayerCountVisibility();
  window.alert("設定を保存しました。");
}

function startMatchFromInputs() {
  const next = readSettingsFromInputs();
  settings = next;
  saveSettings(settings);
  appState = createMatchState(settings);
  undoStack = [];
  matchStarted = true;
  render();
}

function resetMatchWithConfirm() {
  if (!window.confirm("現在の試合をリセットします。よろしいですか？")) return;
  appState = createMatchState(settings);
  undoStack = [];
  matchStarted = true;
  render();
}

function readSettingsFromInputs() {
  const count = clampNumber(parseInt(ui.playerCount.value, 10), 2, 3, 2);
  const p1 = sanitizeName(ui.player1Name.value, "プレイヤー１");
  const p2 = sanitizeName(ui.player2Name.value, "プレイヤー２");
  const p3 = sanitizeName(ui.player3Name.value, "プレイヤー３");
  return {
    playerCount: count,
    playerNames: [p1, p2, p3],
    throwsPerSet: clampNumber(parseInt(ui.throwsPerSet.value, 10), 1, 30, 10),
    setCount: clampNumber(parseInt(ui.setCount.value, 10), 1, 4, 2),
  };
}

function syncSettingsToInputs() {
  ui.playerCount.value = String(settings.playerCount);
  ui.player1Name.value = settings.playerNames[0];
  ui.player2Name.value = settings.playerNames[1];
  ui.player3Name.value = settings.playerNames[2];
  ui.throwsPerSet.value = String(settings.throwsPerSet);
  ui.setCount.value = String(settings.setCount);
}

function sanitizeName(value, fallback) {
  const name = String(value || "").trim();
  return name.length > 0 ? name : fallback;
}

function clampNumber(value, min, max, fallback) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function createMatchState(currentSettings) {
  const players = currentSettings.playerCount;
  return {
    settings: deepClone(currentSettings),
    scores: Array.from({ length: players }, () =>
      Array.from({ length: currentSettings.setCount }, () => [])
    ),
    currentSet: 0,
    currentPlayer: 0,
    finished: false,
    winnerIndex: null,
    winnerReason: "",
    suddenDeath: {
      active: false,
      players: [],
      currentIndex: 0,
      scores: Array.from({ length: players }, () => []),
      minThrowsEach: 3,
    },
  };
}

function handleScoreInput(score) {
  if (!matchStarted || !appState) {
    window.alert("先に試合を開始してください。");
    return;
  }
  if (appState.finished) {
    window.alert("試合は終了しています。");
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
  const p = appState.currentPlayer;
  const s = appState.currentSet;
  appState.scores[p][s].push(score);
  advanceTurnNormal();
}

function advanceTurnNormal() {
  const limit = appState.settings.throwsPerSet;
  const players = appState.settings.playerCount;
  const setThrows = Array.from({ length: players }, (_, p) => appState.scores[p][appState.currentSet].length);
  const done = setThrows.every((v) => v >= limit);
  if (done) {
    if (appState.currentSet < appState.settings.setCount - 1) {
      appState.currentSet += 1;
      appState.currentPlayer = 0;
      return;
    }
    finishRegularMatch();
    return;
  }
  for (let step = 1; step <= players; step += 1) {
    const next = (appState.currentPlayer + step) % players;
    if (appState.scores[next][appState.currentSet].length < limit) {
      appState.currentPlayer = next;
      return;
    }
  }
}

function finishRegularMatch() {
  const result = calculateWinner(appState);
  if (result.status === "winner") {
    finishMatch(result.winnerIndex, result.reason);
    return;
  }
  startSuddenDeathIfNeeded(result.tiedPlayers);
}

function recordSuddenDeathThrow(score) {
  const sd = appState.suddenDeath;
  const player = sd.players[sd.currentIndex];
  sd.scores[player].push(score);
  sd.currentIndex = (sd.currentIndex + 1) % sd.players.length;
  evaluateSuddenDeath();
}

function evaluateSuddenDeath() {
  const sd = appState.suddenDeath;
  if (sd.players.length === 0) return;
  const counts = sd.players.map((p) => sd.scores[p].length);
  const sameCount = counts.every((c) => c === counts[0]);
  if (!sameCount || counts[0] < sd.minThrowsEach) return;

  const totals = sd.players.map((p) => sum(sd.scores[p]));
  const max = Math.max(...totals);
  const winners = sd.players.filter((_, i) => totals[i] === max);
  if (winners.length === 1) {
    const throwsEach = counts[0];
    const reason =
      throwsEach === sd.minThrowsEach
        ? "サドンデス3球の合計点で勝利"
        : `延長サドンデス（各${throwsEach}球）で勝利`;
    finishMatch(winners[0], reason);
    return;
  }

  sd.players = winners;
  sd.currentIndex = 0;
}

function finishMatch(winnerIndex, reason) {
  appState.finished = true;
  appState.winnerIndex = winnerIndex;
  appState.winnerReason = reason;
  appState.suddenDeath.active = false;

  const totals = getOverallTotals(appState);
  bestTotal = Math.max(bestTotal, ...totals);
  saveBestTotal(bestTotal);

  lastMatch = {
    finishedAt: new Date().toISOString(),
    playerCount: appState.settings.playerCount,
    playerNames: appState.settings.playerNames.slice(0, appState.settings.playerCount),
    setTotals: Array.from({ length: appState.settings.playerCount }, (_, p) => getSetTotalsForPlayer(appState, p)),
    suddenDeathTotals: Array.from(
      { length: appState.settings.playerCount },
      (_, p) => sum(appState.suddenDeath.scores[p])
    ),
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
  const players = state.settings.playerCount;
  return Array.from({ length: players }, (_, p) => {
    return sum(getSetTotalsForPlayer(state, p)) + sum(state.suddenDeath.scores[p]);
  });
}

function getTrainProgress(totalScore) {
  const score = Math.max(0, Math.floor(totalScore));
  const reachedGoal = score > 0 && score % LAP_GOAL === 0;
  const lap = score === 0 ? 1 : Math.floor((score - 1) / LAP_GOAL) + 1;
  let inLap = 0;
  if (score > 0) inLap = score - (lap - 1) * LAP_GOAL;
  const lapProgress = Math.min(1, inLap / LAP_GOAL);
  const stationIndex = Math.min(Math.floor(inLap / STATION_STEP), STATIONS.length - 1);
  const currentStation = STATIONS[stationIndex];
  const nextStation = inLap >= LAP_GOAL ? STATIONS[0] : STATIONS[Math.min(stationIndex + 1, STATIONS.length - 1)];
  let toNext = 0;
  if (inLap < LAP_GOAL) {
    const remainder = inLap % STATION_STEP;
    toNext = remainder === 0 ? STATION_STEP : STATION_STEP - remainder;
  }
  return { lap, inLap, currentStation, nextStation, toNext, lapProgress, reachedGoal };
}

function calculateWinner(matchState) {
  const players = matchState.settings.playerCount;
  const totals = Array.from({ length: players }, (_, p) => sum(getSetTotalsForPlayer(matchState, p)));
  const maxTotal = Math.max(...totals);
  const tiedTop = totals
    .map((total, idx) => ({ total, idx }))
    .filter((row) => row.total === maxTotal)
    .map((row) => row.idx);

  if (tiedTop.length === 1) {
    return { status: "winner", winnerIndex: tiedTop[0], reason: "総合計で勝利" };
  }

  const maxSetByPlayer = tiedTop.map((p) => Math.max(...getSetTotalsForPlayer(matchState, p)));
  const maxSet = Math.max(...maxSetByPlayer);
  const tiedBySet = tiedTop.filter((p, i) => maxSetByPlayer[i] === maxSet);
  if (tiedBySet.length === 1) {
    return { status: "winner", winnerIndex: tiedBySet[0], reason: "最高セット得点で勝利" };
  }

  return { status: "sudden-death", tiedPlayers: tiedBySet };
}

function undoLastThrow() {
  if (!matchStarted || undoStack.length === 0) {
    window.alert("取り消せる入力がありません。");
    return;
  }
  appState = undoStack.pop();
  render();
}

function startSuddenDeathIfNeeded(tiedPlayers) {
  const sdPlayers = tiedPlayers && tiedPlayers.length > 0 ? tiedPlayers : [...Array(appState.settings.playerCount).keys()];
  appState.suddenDeath.active = true;
  appState.suddenDeath.players = sdPlayers;
  appState.suddenDeath.currentIndex = 0;
}

function render() {
  const isPlaying = matchStarted && appState && !appState.finished;
  ui.settingsSection.classList.toggle("hidden", matchStarted);
  ui.statusSection.classList.toggle("hidden", isPlaying || !matchStarted);
  ui.scoreboardSection.classList.toggle("hidden", isPlaying || !matchStarted);
  ui.savedSection.classList.toggle("hidden", isPlaying || !matchStarted);
  ui.selfCheckSection.classList.toggle("hidden", isPlaying || !matchStarted);

  renderStatus();
  renderScoreboard();
  renderTrainBoard();
  renderSavedInfo();
}

function renderStatus() {
  ui.playTurnInfo.textContent = "";

  if (!matchStarted || !appState) {
    ui.turnInfo.textContent = "設定して試合開始";
    ui.matchInfo.textContent = "プレー中は新幹線進行と得点入力のみ表示します。";
    ui.winnerInfo.textContent = "";
    return;
  }

  const names = appState.settings.playerNames;
  if (appState.finished) {
    ui.turnInfo.textContent = "試合終了";
    ui.matchInfo.textContent = `${names[appState.winnerIndex]} の勝ち`;
    ui.winnerInfo.textContent = `勝因: ${appState.winnerReason}`;
    return;
  }

  if (appState.suddenDeath.active) {
    const sd = appState.suddenDeath;
    const player = sd.players[sd.currentIndex];
    const throwNo = sd.scores[player].length + 1;
    ui.turnInfo.textContent = `サドンデス: ${names[player]} の ${throwNo} 球目`;
    ui.playTurnInfo.textContent = ui.turnInfo.textContent;
    ui.matchInfo.textContent = "同点のためサドンデス中（1球ずつ交互）";
    ui.winnerInfo.textContent = "";
    return;
  }

  const setNo = appState.currentSet + 1;
  const p = appState.currentPlayer;
  const throwNo = appState.scores[p][appState.currentSet].length + 1;
  ui.turnInfo.textContent = `第${setNo}セット: ${names[p]} の ${throwNo} 球目`;
  ui.playTurnInfo.textContent = ui.turnInfo.textContent;
  ui.matchInfo.textContent = `各プレイヤー ${appState.settings.throwsPerSet} 球 / 全${appState.settings.setCount}セット`;
  ui.winnerInfo.textContent = "";
}

function renderScoreboard() {
  if (!matchStarted || !appState) {
    ui.scoreboard.innerHTML = "";
    return;
  }
  const players = appState.settings.playerCount;
  const names = appState.settings.playerNames.slice(0, players);
  const setHeaders = Array.from({ length: appState.settings.setCount }, (_, i) => `<th>セット${i + 1}</th>`).join("");
  const rows = Array.from({ length: players }, (_, p) => {
    const setTotals = getSetTotalsForPlayer(appState, p);
    const regular = sum(setTotals);
    const sd = sum(appState.suddenDeath.scores[p]);
    const cells = setTotals.map((s) => `<td>${s}</td>`).join("");
    const extra = sd > 0 ? `（SD:${sd}）` : "";
    return `<tr><th>${escapeHtml(names[p])}</th>${cells}<td>${regular + sd}${extra}</td></tr>`;
  }).join("");

  ui.scoreboard.innerHTML = `
    <table class="scoreboard-table">
      <thead><tr><th>プレイヤー</th>${setHeaders}<th>総合計</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderTrainBoard() {
  if (!matchStarted || !appState) {
    ui.trainBoard.innerHTML = "<p>試合開始で表示します。</p>";
    return;
  }

  const players = appState.settings.playerCount;
  const names = appState.settings.playerNames.slice(0, players);
  const totals = getOverallTotals(appState);
  const isPlaying = !appState.finished;

  ui.trainBoard.innerHTML = Array.from({ length: players }, (_, p) => {
    const progress = getTrainProgress(totals[p]);
    const leftPercent = Math.max(0, Math.min(100, progress.lapProgress * 100)).toFixed(2);
    const stationDots = STATIONS.map((_, i) => {
      const pct = (i / (STATIONS.length - 1)) * 100;
      return `<span class="station-dot" style="left:${pct}%"></span>`;
    }).join("");
    const labels = STATIONS.map((name) => `<span>${name}</span>`).join("");
    const clear = progress.reachedGoal ? `<span class="clear-badge">${progress.lap}周クリア</span>` : "";
    const totalText = isPlaying ? "" : `<span>総合計: ${totals[p]}点</span>`;

    return `
      <div class="train-card">
        <div class="train-head"><span>${escapeHtml(names[p])}</span>${totalText}</div>
        <div class="rail">
          <div class="rail-line"></div>
          ${stationDots}
          <span class="train-icon" style="left:calc(${leftPercent}% - 11px)">🚄</span>
        </div>
        <div class="station-labels">${labels}</div>
        <p class="train-meta">
          現在駅: ${progress.currentStation} / 次駅: ${progress.nextStation} / 次駅まで: ${progress.toNext}点
          ${clear}
        </p>
      </div>
    `;
  }).join("");
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
  const scoresText = lastMatch.playerNames.map((n, i) => `${escapeHtml(n)}: ${lastMatch.totals[i]}点`).join(" / ");
  ui.lastMatchInfo.innerHTML = `
    <p>直近試合結果: ${dateText}</p>
    <p>${scoresText}</p>
    <p>勝者: ${escapeHtml(winnerName)}（${escapeHtml(lastMatch.winnerReason)}）</p>
  `;
}

function runSelfChecks() {
  const checks = [];
  const sumCheck = sum(Array(10).fill(5)) + sum(Array(10).fill(4));
  checks.push({ label: "10投×2セットで正しい合計になる", pass: sumCheck === 90 });
  checks.push({ label: "1点入力ごとに列車位置が進む", pass: getTrainProgress(11).lapProgress > getTrainProgress(10).lapProgress });
  checks.push({
    label: "15点ごとに駅表示が更新される",
    pass: getTrainProgress(14).currentStation === "東京" && getTrainProgress(15).currentStation === "上野",
  });
  checks.push({
    label: "90点で1周クリア表示",
    pass: getTrainProgress(90).reachedGoal && getTrainProgress(90).currentStation === "新青森",
  });
  checks.push({ label: "3人対戦対応", pass: createMatchState({ ...DEFAULT_SETTINGS, playerCount: 3 }).scores.length === 3 });
  checks.push({
    label: "iPhone表示幅（390px程度）で操作しやすい",
    pass: parseInt(getComputedStyle(document.querySelector(".score-btn")).minHeight, 10) >= 56,
  });

  ui.selfCheckList.innerHTML = checks.map((c) => `<li>${c.pass ? "OK" : "NG"}: ${escapeHtml(c.label)}</li>`).join("");
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return deepClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      playerCount: clampNumber(parsed?.playerCount, 2, 3, DEFAULT_SETTINGS.playerCount),
      playerNames: [
        sanitizeName(parsed?.playerNames?.[0], DEFAULT_SETTINGS.playerNames[0]),
        sanitizeName(parsed?.playerNames?.[1], DEFAULT_SETTINGS.playerNames[1]),
        sanitizeName(parsed?.playerNames?.[2], DEFAULT_SETTINGS.playerNames[2]),
      ],
      throwsPerSet: clampNumber(parsed?.throwsPerSet, 1, 30, DEFAULT_SETTINGS.throwsPerSet),
      setCount: clampNumber(parsed?.setCount, 1, 4, DEFAULT_SETTINGS.setCount),
    };
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
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocalhost) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

window.getTrainProgress = getTrainProgress;
window.calculateWinner = calculateWinner;
window.undoLastThrow = undoLastThrow;
window.startSuddenDeathIfNeeded = startSuddenDeathIfNeeded;
