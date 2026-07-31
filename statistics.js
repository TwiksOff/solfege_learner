/* ============================================================
   statistics.js — Sauvegarde & historique (LocalStorage)
   ============================================================ */

const STORAGE_KEY = 'president_trainer_stats_v1';

function defaultStats() {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    accuracyHistory: [], // liste des % de précision par partie
    bestScore: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastResults: [], // 10 dernières parties : { date, place, accuracy, players }
  };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStats();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultStats(), parsed);
  } catch (e) {
    return defaultStats();
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch (e) {
    console.warn('Impossible de sauvegarder les statistiques :', e);
  }
}

/** Enregistre le résultat d'une partie terminée (pas un exercice) */
function recordGameResult({ place, accuracy, players, score }) {
  const stats = loadStats();
  stats.gamesPlayed += 1;
  const won = place === 1;
  if (won) {
    stats.gamesWon += 1;
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }
  stats.accuracyHistory.push(accuracy);
  if (stats.accuracyHistory.length > 50) stats.accuracyHistory.shift();
  stats.bestScore = Math.max(stats.bestScore, score || 0);

  stats.lastResults.unshift({
    date: new Date().toISOString(),
    place,
    accuracy,
    players,
  });
  if (stats.lastResults.length > 10) stats.lastResults.pop();

  saveStats(stats);
  return stats;
}

function averageAccuracy(stats) {
  if (!stats.accuracyHistory.length) return 0;
  const sum = stats.accuracyHistory.reduce((a, b) => a + b, 0);
  return Math.round(sum / stats.accuracyHistory.length);
}

function winRate(stats) {
  if (!stats.gamesPlayed) return 0;
  return Math.round((stats.gamesWon / stats.gamesPlayed) * 100);
}

function resetStats() {
  saveStats(defaultStats());
  return defaultStats();
}

if (typeof window !== 'undefined') {
  window.PresidentStats = { loadStats, saveStats, recordGameResult, averageAccuracy, winRate, resetStats };
}
