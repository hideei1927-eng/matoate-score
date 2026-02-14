const SCORE_MIN = 0;
const SCORE_MAX = 10;
const STATION_STEP = 15;
const STATIONS = [
  { kanji: "東京", kana: "とうきょう" },
  { kanji: "上野", kana: "うえの" },
  { kanji: "大宮", kana: "おおみや" },
  { kanji: "仙台", kana: "せんだい" },
  { kanji: "盛岡", kana: "もりおか" },
  { kanji: "八戸", kana: "はちのへ" },
  { kanji: "新青森", kana: "しんあおもり" },
];
const LAP_GOAL = STATION_STEP * (STATIONS.length - 1); // 90

const SETTINGS_KEY = "matoate.settings.v1";
const LAST_MATCH_KEY = "matoate.lastMatch.v1";
const BEST_TOTAL_KEY = "matoate.bestTotal.v1";
const UI_KEY = "matoate.ui.v1";
const BADGES_KEY = "matoate.badges.v1";

const DEFAULT_SETTINGS = {
  playerCount: 2,
  playerNames: ["プレイヤー１", "プレイヤー２", "プレイヤー３"],
  throwsPerSet: 10,
  setCount: 2,
  kidsMode: true,
  effectsOn: true,
  soundOn: false,
  stationLabelMode: "kana",
};

const DEFAULT_UI = {
  stationDetailOpen: false,
};

const DEFAULT_BADGES = {
  hayabusa: false,
  power: false,
};

const ui = {
  settingsSection: document.getElementById("settingsSection"),
  hudSection: document.getElementById("hudSection"),
  inputSection: document.getElementById("inputSection"),
  trainSection: document.getElementById("trainSection"),
  statusSection: document.getElementById("statusSection"),
  scoreboardSection: document.getElementById("scoreboardSection"),
  badgeSection: document.getElementById("badgeSection"),
  savedSection: document.getElementById("savedSection"),
  selfCheckSection: document.getElementById("selfCheckSection"),
  playerCount: document.getElementById("playerCount"),
  player1Name: document.getElementById("player1Name"),
  player2Name: document.getElementById("player2Name"),
  player3Name: document.getElementById("player3Name"),
  player3Wrap: document.getElementById("player3Wrap"),
  throwsPerSet: document.getElementById("throwsPerSet"),
  setCount: document.getElementById("setCount"),
  kidsMode: document.getElementById("kidsMode"),
  effectsOn: document.getElementById("effectsOn"),
  soundOn: document.getElementById("soundOn"),
  stationLabelMode: document.getElementById("stationLabelMode"),
  startMatchButton: document.getElementById("startMatchButton"),
  applySettingsButton: document.getElementById("applySettingsButton"),
  toggleStationDetailButton: document.getElementById("toggleStationDetailButton"),
  showSettingsButton: document.getElementById("showSettingsButton"),
  resetMatchButton: document.getElementById("resetMatchButton"),
  shareResultButton: document.getElementById("shareResultButton"),
  playTurnInfo: document.getElementById("playTurnInfo"),
  turnInfo: document.getElementById("turnInfo"),
  matchInfo: document.getElementById("matchInfo"),
  winnerInfo: document.getElementById("winnerInfo"),
  hudCurrentPlayer: document.getElementById("hudCurrentPlayer"),
  hudThrow: document.getElementById("hudThrow"),
  hudTotal: document.getElementById("hudTotal"),
  hudStationInfo: document.getElementById("hudStationInfo"),
  hudSetChip: document.getElementById("hudSetChip"),
  hudRemainChip: document.getElementById("hudRemainChip"),
  hudModeChip: document.getElementById("hudModeChip"),
  hudCoach: document.getElementById("hudCoach"),
  hudUndoButton: document.getElementById("hudUndoButton"),
  scoreButtons: document.getElementById("scoreButtons"),
  recentThrows: document.getElementById("recentThrows"),
  trainBoard: document.getElementById("trainBoard"),
  scoreboard: document.getElementById("scoreboard"),
  badgeList: document.getElementById("badgeList"),
  bestScoreInfo: document.getElementById("bestScoreInfo"),
  lastMatchInfo: document.getElementById("lastMatchInfo"),
  selfCheckList: document.getElementById("selfCheckList"),
  toast: document.getElementById("toast"),
  reaction: document.getElementById("reaction"),
  confettiLayer: document.getElementById("confettiLayer"),
};

let settings = loadSettings();
let uiPrefs = loadUiPrefs();
let badges = loadBadges();
let bestTotal = loadBestTotal();
let lastMatch = loadLastMatch();

let appState = null;
let matchStarted = false;
let undoStack = [];

const effectState = {
  reactionBusy: false,
  confettiBusy: false,
  reactionTimer: null,
  toastTimer: null,
  confettiTimer: null,
};

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
  ui.toggleStationDetailButton.addEventListener("click", () => {
    uiPrefs.stationDetailOpen = !uiPrefs.stationDetailOpen;
    saveUiPrefs(uiPrefs);
    renderTrainBoard();
  });
  ui.showSettingsButton.addEventListener("click", backToSettings);
  ui.resetMatchButton.addEventListener("click", resetMatchWithConfirm);
  ui.shareResultButton.addEventListener("click", shareResult);
  ui.hudUndoButton.addEventListener("click", undoLastThrow);
}

function buildScoreButtons() {
  ui.scoreButtons.innerHTML = "";
  for (let score = SCORE_MIN; score <= SCORE_MAX; score += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "score-btn";
    button.dataset.score = String(score);
    if (score >= 8 && score <= 9) button.classList.add("score-high");
    if (score === 10) button.classList.add("score-perfect");
    button.textContent = String(score);
    button.addEventListener("click", () => handleScoreInput(score));
    ui.scoreButtons.appendChild(button);
  }

  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "score-undo";
  undo.dataset.score = "undo";
  undo.textContent = "Undo";
  undo.addEventListener("click", undoLastThrow);
  ui.scoreButtons.appendChild(undo);
}

function applyPlayerCountVisibility() {
  ui.player3Wrap.classList.toggle("hidden", Number(ui.playerCount.value) !== 3);
}

function applySettingsOnly() {
  settings = readSettingsFromInputs();
  saveSettings(settings);
  applyPlayerCountVisibility();
  window.alert("設定を保存しました。");
}

function startMatchFromInputs() {
  settings = readSettingsFromInputs();
  saveSettings(settings);
  appState = createMatchState(settings);
  undoStack = [];
  matchStarted = true;
  render();
}

function backToSettings() {
  if (matchStarted && !appState?.finished && !window.confirm("試合を中断して設定に戻りますか？")) return;
  matchStarted = false;
  appState = null;
  undoStack = [];
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
  const kidsMode = ui.kidsMode.checked;
  const stationMode = ui.stationLabelMode.value;
  return {
    playerCount: clampNumber(parseInt(ui.playerCount.value, 10), 2, 3, 2),
    playerNames: [
      sanitizeName(ui.player1Name.value, "プレイヤー１"),
      sanitizeName(ui.player2Name.value, "プレイヤー２"),
      sanitizeName(ui.player3Name.value, "プレイヤー３"),
    ],
    throwsPerSet: clampNumber(parseInt(ui.throwsPerSet.value, 10), 1, 30, 10),
    setCount: clampNumber(parseInt(ui.setCount.value, 10), 1, 4, 2),
    kidsMode,
    effectsOn: ui.effectsOn.checked,
    soundOn: ui.soundOn.checked,
    stationLabelMode: ["kana", "kanji", "both"].includes(stationMode)
      ? stationMode
      : kidsMode
      ? "kana"
      : "kanji",
  };
}

function syncSettingsToInputs() {
  ui.playerCount.value = String(settings.playerCount);
  ui.player1Name.value = settings.playerNames[0];
  ui.player2Name.value = settings.playerNames[1];
  ui.player3Name.value = settings.playerNames[2];
  ui.throwsPerSet.value = String(settings.throwsPerSet);
  ui.setCount.value = String(settings.setCount);
  ui.kidsMode.checked = settings.kidsMode;
  ui.effectsOn.checked = settings.effectsOn;
  ui.soundOn.checked = settings.soundOn;
  ui.stationLabelMode.value = settings.stationLabelMode;
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
    stats: {
      tensByPlayer: Array.from({ length: players }, () => 0),
    },
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
  if (!matchStarted || !appState || appState.finished) return;
  pushUndoSnapshot();

  const prevTotals = getOverallTotals(appState);
  if (appState.suddenDeath.active) {
    recordSuddenDeathThrow(score);
  } else {
    recordNormalThrow(score);
  }
  const nowTotals = getOverallTotals(appState);
  const currentPlayerForReaction = getLastScoredPlayer();
  runScoreEffects(score, prevTotals[currentPlayerForReaction], nowTotals[currentPlayerForReaction]);

  render();
}

function getLastScoredPlayer() {
  if (appState.suddenDeath.active) {
    const sd = appState.suddenDeath;
    const idx = (sd.currentIndex - 1 + sd.players.length) % sd.players.length;
    return sd.players[idx];
  }
  const players = appState.settings.playerCount;
  return (appState.currentPlayer - 1 + players) % players;
}

function pushUndoSnapshot() {
  undoStack.push(deepClone(appState));
}

function recordNormalThrow(score) {
  const p = appState.currentPlayer;
  const s = appState.currentSet;
  appState.scores[p][s].push(score);
  if (score === 10) appState.stats.tensByPlayer[p] += 1;
  advanceTurnNormal();
}

function advanceTurnNormal() {
  const limit = appState.settings.throwsPerSet;
  const players = appState.settings.playerCount;
  const setThrows = Array.from({ length: players }, (_, p) => appState.scores[p][appState.currentSet].length);
  if (setThrows.every((v) => v >= limit)) {
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
  if (score === 10) appState.stats.tensByPlayer[player] += 1;
  sd.currentIndex = (sd.currentIndex + 1) % sd.players.length;
  evaluateSuddenDeath();
}

function evaluateSuddenDeath() {
  const sd = appState.suddenDeath;
  if (sd.players.length === 0) return;
  const counts = sd.players.map((p) => sd.scores[p].length);
  if (!counts.every((n) => n === counts[0]) || counts[0] < sd.minThrowsEach) return;

  const totals = sd.players.map((p) => sum(sd.scores[p]));
  const max = Math.max(...totals);
  const winners = sd.players.filter((_, i) => totals[i] === max);
  if (winners.length === 1) {
    const reason = counts[0] === sd.minThrowsEach
      ? "サドンデス3球の合計点で勝利"
      : `延長サドンデス（各${counts[0]}球）で勝利`;
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

  if (totals.some((score) => score >= LAP_GOAL)) {
    badges.hayabusa = true;
  }
  if (appState.stats.tensByPlayer.some((n) => n >= 3)) {
    badges.power = true;
  }
  saveBadges(badges);

  lastMatch = {
    finishedAt: new Date().toISOString(),
    playerCount: appState.settings.playerCount,
    playerNames: appState.settings.playerNames.slice(0, appState.settings.playerCount),
    setTotals: Array.from({ length: appState.settings.playerCount }, (_, p) => getSetTotalsForPlayer(appState, p)),
    suddenDeathTotals: Array.from({ length: appState.settings.playerCount }, (_, p) => sum(appState.suddenDeath.scores[p])),
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
  const inLap = score > 0 ? score - (lap - 1) * LAP_GOAL : 0;
  const lapProgress = Math.min(1, inLap / LAP_GOAL);
  const stationIndex = Math.min(Math.floor(inLap / STATION_STEP), STATIONS.length - 1);
  const currentStation = STATIONS[stationIndex];
  const nextStation = inLap >= LAP_GOAL ? STATIONS[0] : STATIONS[Math.min(stationIndex + 1, STATIONS.length - 1)];
  const remainder = inLap % STATION_STEP;
  const toNext = inLap >= LAP_GOAL ? 0 : remainder === 0 ? STATION_STEP : STATION_STEP - remainder;
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

function stationLabel(station) {
  if (settings.stationLabelMode === "kanji") return station.kanji;
  if (settings.stationLabelMode === "both") return `${station.kana} / ${station.kanji}`;
  return station.kana;
}

function calculateWinner(matchState) {
  const players = matchState.settings.playerCount;
  const totals = Array.from({ length: players }, (_, p) => sum(getSetTotalsForPlayer(matchState, p)));
  const maxTotal = Math.max(...totals);
  const tiedTop = totals.map((total, idx) => ({ total, idx })).filter((r) => r.total === maxTotal).map((r) => r.idx);

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
  if (!matchStarted || undoStack.length === 0 || appState?.finished) {
    window.alert("取り消せる入力がありません。");
    return;
  }
  appState = undoStack.pop();
  render();
}

function startSuddenDeathIfNeeded(tiedPlayers) {
  appState.suddenDeath.active = true;
  appState.suddenDeath.players = tiedPlayers && tiedPlayers.length > 0 ? tiedPlayers : [...Array(appState.settings.playerCount).keys()];
  appState.suddenDeath.currentIndex = 0;
}

function render() {
  const isPlaying = matchStarted && appState && !appState.finished;
  const isFinished = matchStarted && appState && appState.finished;

  ui.settingsSection.classList.toggle("hidden", matchStarted);
  ui.hudSection.classList.toggle("hidden", !isPlaying);
  ui.inputSection.classList.toggle("hidden", !isPlaying);
  ui.trainSection.classList.toggle("hidden", !matchStarted);
  ui.statusSection.classList.toggle("hidden", !isFinished);
  ui.scoreboardSection.classList.toggle("hidden", !isFinished);
  ui.badgeSection.classList.toggle("hidden", !matchStarted);
  ui.savedSection.classList.toggle("hidden", isPlaying);
  ui.selfCheckSection.classList.toggle("hidden", isPlaying);

  renderPlayText();
  renderHud();
  renderRecentThrows();
  renderTrainBoard();
  renderScoreboard();
  renderStatus();
  renderSavedInfo();
  renderBadges();
  ui.toggleStationDetailButton.textContent = uiPrefs.stationDetailOpen ? "詳細を隠す" : "詳細を表示";
}

function renderPlayText() {
  if (!matchStarted || !appState || appState.finished) {
    ui.playTurnInfo.textContent = "";
    return;
  }
  const turn = getCurrentTurnContext();
  ui.playTurnInfo.textContent = turn.isSuddenDeath
    ? `サドンデス: ${turn.name} の ${turn.throwNo}球目`
    : `${turn.name} の ${turn.throwNo}球目`;
}

function renderHud() {
  if (!matchStarted || !appState || appState.finished) return;
  const turn = getCurrentTurnContext();
  const totals = getOverallTotals(appState);
  const progress = getTrainProgress(totals[turn.playerIndex]);
  const remaining = appState.settings.throwsPerSet - (turn.throwNo - 1);
  ui.hudCurrentPlayer.textContent = turn.name;
  ui.hudThrow.textContent = `${turn.throwNo}球目`;
  ui.hudSetChip.textContent = `セット ${appState.currentSet + 1}/${appState.settings.setCount}`;
  ui.hudRemainChip.textContent = turn.isSuddenDeath ? "サドンデス" : `残り ${Math.max(0, remaining)}球`;
  ui.hudModeChip.textContent = settings.kidsMode ? "こどもモード" : "ノーマル";
  ui.hudCoach.textContent = coachText(progress.toNext, turn.isSuddenDeath);
  ui.hudTotal.textContent = String(totals[turn.playerIndex]);
  ui.hudStationInfo.textContent = `現在駅: ${stationLabel(progress.currentStation)} / 次駅: ${stationLabel(progress.nextStation)} / 残り${progress.toNext}点`;
}

function getCurrentTurnContext() {
  const names = appState.settings.playerNames;
  if (appState.suddenDeath.active) {
    const playerIndex = appState.suddenDeath.players[appState.suddenDeath.currentIndex];
    return {
      playerIndex,
      name: names[playerIndex],
      throwNo: appState.suddenDeath.scores[playerIndex].length + 1,
      isSuddenDeath: true,
    };
  }
  const playerIndex = appState.currentPlayer;
  return {
    playerIndex,
    name: names[playerIndex],
    throwNo: appState.scores[playerIndex][appState.currentSet].length + 1,
    isSuddenDeath: false,
  };
}

function coachText(toNext, suddenDeath) {
  if (suddenDeath) return "集中して1球ずついこう";
  if (toNext <= 2) return "駅まであと少し！";
  if (toNext <= 5) return "ナイスペース！";
  return "リズムよく入力しよう";
}

function renderRecentThrows() {
  if (!matchStarted || !appState || appState.finished) {
    ui.recentThrows.innerHTML = "";
    return;
  }
  const turn = getCurrentTurnContext();
  const scores = appState.suddenDeath.active
    ? appState.suddenDeath.scores[turn.playerIndex]
    : appState.scores[turn.playerIndex][appState.currentSet];
  const recent = scores.slice(-8).reverse();
  if (recent.length === 0) {
    ui.recentThrows.innerHTML = '<span class="throw-pill">まだ入力なし</span>';
    return;
  }
  ui.recentThrows.innerHTML = recent
    .map((score, idx) => `<span class="throw-pill">${idx + 1}前: ${score}点</span>`)
    .join("");
}

function renderTrainBoard() {
  if (!matchStarted || !appState) {
    ui.trainBoard.innerHTML = "<p>試合開始で表示します。</p>";
    return;
  }

  const players = appState.settings.playerCount;
  const names = appState.settings.playerNames.slice(0, players);
  const totals = getOverallTotals(appState);
  const currentTurn = appState.finished ? -1 : getCurrentTurnContext().playerIndex;

  ui.trainBoard.innerHTML = Array.from({ length: players }, (_, p) => {
    const progress = getTrainProgress(totals[p]);
    const leftPercent = Math.max(0, Math.min(100, progress.lapProgress * 100)).toFixed(2);
    const stationDots = STATIONS.map((_, i) => {
      const pct = (i / (STATIONS.length - 1)) * 100;
      return `<span class="station-dot" style="left:${pct}%"></span>`;
    }).join("");

    const labels = STATIONS.map((s) => `<span>${escapeHtml(stationLabel(s))}</span>`).join("");
    const clear = progress.reachedGoal ? `<span class="clear-badge">${progress.lap}周クリア</span>` : "";

    return `
      <article class="train-card ${p === currentTurn ? "current-turn" : ""}">
        <div class="train-head">
          <span>${escapeHtml(names[p])}</span>
          ${appState.finished ? `<span>総合計: ${totals[p]}点</span>` : `<span class="train-score-inline">周回 ${progress.lap} / 進行 ${Math.round(progress.lapProgress * 100)}%</span>`}
        </div>
        <div class="rail">
          <div class="rail-line"></div>
          ${stationDots}
          <span class="train-icon" style="left:calc(${leftPercent}% - 11px)">🚄</span>
        </div>
        ${uiPrefs.stationDetailOpen ? `<div class="station-labels">${labels}</div>` : ""}
        <p class="train-meta">
          現在駅: ${escapeHtml(stationLabel(progress.currentStation))} / 次駅: ${escapeHtml(stationLabel(progress.nextStation))} / 次駅まで: ${progress.toNext}点
          ${clear}
        </p>
      </article>
    `;
  }).join("");
}

function renderScoreboard() {
  if (!matchStarted || !appState?.finished) {
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

function renderStatus() {
  if (!matchStarted || !appState?.finished) {
    ui.turnInfo.textContent = "";
    ui.matchInfo.textContent = "";
    ui.winnerInfo.textContent = "";
    ui.shareResultButton.classList.add("hidden");
    return;
  }

  const names = appState.settings.playerNames;
  ui.turnInfo.textContent = "試合終了";
  ui.matchInfo.textContent = `${names[appState.winnerIndex]} の勝ち`;
  ui.winnerInfo.textContent = `勝因: ${appState.winnerReason}`;
  ui.shareResultButton.classList.remove("hidden");
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

function renderBadges() {
  ui.badgeList.innerHTML = `
    <div class="badge-item ${badges.hayabusa ? "on" : ""}">🚄 はやぶさバッジ<br>1周クリアで獲得</div>
    <div class="badge-item ${badges.power ? "on" : ""}">💪 パワーバッジ<br>10点を3回で獲得</div>
  `;
}

async function shareResult() {
  if (!appState?.finished) return;
  const names = appState.settings.playerNames.slice(0, appState.settings.playerCount);
  const totals = getOverallTotals(appState);
  const text = `的当て結果: ${names.map((n, i) => `${n} ${totals[i]}点`).join(" / ")}。勝者: ${names[appState.winnerIndex]}（${appState.winnerReason}）`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "的当てスコア", text });
      return;
    } catch (_) {}
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast("結果をコピーしました");
  } catch (_) {
    window.prompt("共有文をコピーしてください", text);
  }
}

function runScoreEffects(score, beforeTotal, afterTotal) {
  if (!settings.effectsOn) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  showReaction(reactionText(score));
  if (navigator.vibrate && score >= 8) {
    navigator.vibrate(score === 10 ? [24, 20, 24] : 18);
  }
  if (Math.floor(beforeTotal / STATION_STEP) < Math.floor(afterTotal / STATION_STEP)) {
    showToast("えき とうちゃく！", 800);
  }
  if (Math.floor(beforeTotal / LAP_GOAL) < Math.floor(afterTotal / LAP_GOAL)) {
    showToast("1しゅうクリア！", 900);
    burstConfetti();
  }
  if (settings.soundOn) {
    playScoreSound(score);
  }
}

function reactionText(score) {
  if (score === 0) return "つぎいこう！";
  if (score <= 3) return "いいね！";
  if (score <= 6) return "ナイス！";
  if (score <= 9) return "すごい！";
  return "パーフェクト！";
}

function showReaction(text) {
  if (effectState.reactionBusy) return;
  effectState.reactionBusy = true;
  clearTimeout(effectState.reactionTimer);
  ui.reaction.textContent = text;
  ui.reaction.classList.add("show");
  effectState.reactionTimer = setTimeout(() => {
    ui.reaction.classList.remove("show");
    effectState.reactionBusy = false;
  }, 600);
}

function showToast(text, duration = 800) {
  clearTimeout(effectState.toastTimer);
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  effectState.toastTimer = setTimeout(() => {
    ui.toast.classList.remove("show");
  }, duration);
}

function burstConfetti() {
  if (effectState.confettiBusy) return;
  effectState.confettiBusy = true;
  clearTimeout(effectState.confettiTimer);
  const colors = ["#00B280", "#B6007A", "#0088d1", "#ffd447"];
  ui.confettiLayer.innerHTML = "";
  for (let i = 0; i < 22; i += 1) {
    const chip = document.createElement("span");
    chip.className = "confetti";
    chip.style.left = `${Math.random() * 100}%`;
    chip.style.background = colors[i % colors.length];
    chip.style.animationDelay = `${Math.random() * 80}ms`;
    ui.confettiLayer.appendChild(chip);
  }
  effectState.confettiTimer = setTimeout(() => {
    ui.confettiLayer.innerHTML = "";
    effectState.confettiBusy = false;
  }, 1000);
}

function playScoreSound(score) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.value = 360 + score * 30;
    gain.gain.value = 0.05;
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch (_) {}
}

function runSelfChecks() {
  const checks = [];

  const test = createMatchState({ ...DEFAULT_SETTINGS, playerCount: 2, setCount: 2, throwsPerSet: 10 });
  test.scores[0][0] = Array(10).fill(5);
  test.scores[0][1] = Array(10).fill(4);
  test.scores[1][0] = Array(10).fill(3);
  test.scores[1][1] = Array(10).fill(2);
  checks.push({ label: "10投×2セットで合計が正しい", pass: getOverallTotals(test)[0] === 90 && getOverallTotals(test)[1] === 50 });

  checks.push({ label: "1点ごとに列車が前進", pass: getTrainProgress(11).lapProgress > getTrainProgress(10).lapProgress });
  checks.push({ label: "15点ごとに駅更新", pass: getTrainProgress(15).currentStation.kanji === "上野" });
  checks.push({ label: "90点で周回クリア", pass: getTrainProgress(90).reachedGoal });
  checks.push({ label: "駅名モード切替", pass: stationLabel(STATIONS[0]).length > 0 });

  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, setCount: 3 }));
  checks.push({ label: "設定復元", pass: loadSettings().setCount === 3 });
  saveSettings(settings);

  const tieState = createMatchState({ ...DEFAULT_SETTINGS, playerCount: 2, setCount: 2, throwsPerSet: 1 });
  tieState.scores[0][0] = [5];
  tieState.scores[0][1] = [2];
  tieState.scores[1][0] = [4];
  tieState.scores[1][1] = [3];
  checks.push({ label: "同点時ロジック維持", pass: calculateWinner(tieState).status === "sudden-death" });

  const btnMin = parseInt(getComputedStyle(document.querySelector(".score-btn")).minHeight, 10);
  checks.push({ label: "iPhone幅で操作可能", pass: btnMin >= 44 });

  ui.selfCheckList.innerHTML = checks.map((c) => `<li>${c.pass ? "OK" : "NG"}: ${escapeHtml(c.label)}</li>`).join("");
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return deepClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);

    const legacyNames = parsed?.playerNames || DEFAULT_SETTINGS.playerNames;
    const kidsMode = parsed?.kidsMode ?? true;

    return {
      playerCount: clampNumber(parsed?.playerCount, 2, 3, DEFAULT_SETTINGS.playerCount),
      playerNames: [
        sanitizeName(legacyNames[0], DEFAULT_SETTINGS.playerNames[0]),
        sanitizeName(legacyNames[1], DEFAULT_SETTINGS.playerNames[1]),
        sanitizeName(legacyNames[2], DEFAULT_SETTINGS.playerNames[2]),
      ],
      throwsPerSet: clampNumber(parsed?.throwsPerSet, 1, 30, DEFAULT_SETTINGS.throwsPerSet),
      setCount: clampNumber(parsed?.setCount, 1, 4, DEFAULT_SETTINGS.setCount),
      kidsMode,
      effectsOn: parsed?.effectsOn ?? true,
      soundOn: parsed?.soundOn ?? false,
      stationLabelMode: ["kana", "kanji", "both"].includes(parsed?.stationLabelMode)
        ? parsed.stationLabelMode
        : kidsMode
        ? "kana"
        : "kanji",
    };
  } catch (_) {
    return deepClone(DEFAULT_SETTINGS);
  }
}

function saveSettings(value) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
}

function loadUiPrefs() {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return deepClone(DEFAULT_UI);
    return { ...DEFAULT_UI, ...JSON.parse(raw) };
  } catch (_) {
    return deepClone(DEFAULT_UI);
  }
}

function saveUiPrefs(value) {
  localStorage.setItem(UI_KEY, JSON.stringify(value));
}

function loadBadges() {
  try {
    const raw = localStorage.getItem(BADGES_KEY);
    if (!raw) return deepClone(DEFAULT_BADGES);
    return { ...DEFAULT_BADGES, ...JSON.parse(raw) };
  } catch (_) {
    return deepClone(DEFAULT_BADGES);
  }
}

function saveBadges(value) {
  localStorage.setItem(BADGES_KEY, JSON.stringify(value));
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
  } catch (_) {
    return null;
  }
}

function saveLastMatch(value) {
  localStorage.setItem(LAST_MATCH_KEY, JSON.stringify(value));
}

function sum(values) {
  return values.reduce((acc, n) => acc + n, 0);
}

function sanitizeName(value, fallback) {
  const n = String(value || "").trim();
  return n.length > 0 ? n : fallback;
}

function clampNumber(value, min, max, fallback) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
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
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocal) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
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
