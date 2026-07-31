/* ============================================================
   ui.js — Affichage, animations, interactions
   Contrôleur principal de l'application.
   ============================================================ */

const SETTINGS_KEY = 'president_trainer_settings_v1';

function defaultSettings() {
  return {
    playerCount: 4,
    difficulty: 'moyen',
    botSpeed: 'normale',
    animations: true,
    autohints: false,
    darkmode: true,
    use3ClubStart: true,
    twoIsPower: true,
    bombsAllowed: true,
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    return Object.assign(defaultSettings(), JSON.parse(raw));
  } catch (e) {
    return defaultSettings();
  }
}

function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* noop */ }
}

const BOT_SPEED_MS = { lente: 1400, normale: 850, rapide: 350 };

const App = {
  settings: loadSettings(),
  game: null,
  selected: [], // cartes sélectionnées (objets carte)
  analyses: [],
  lastAnalysis: null,
  botTimer: null,
  currentScenario: null,
  trainingSelected: [],

  els: {},

  init() {
    this.cacheEls();
    this.bindEvents();
    this.applyThemeClass();
    this.newGame();
  },

  cacheEls() {
    const ids = [
      'btn-new-game', 'btn-training', 'btn-stats', 'btn-settings', 'btn-reset',
      'table-oval', 'bot-seats', 'pile-cards', 'pile-zone', 'trick-counter',
      'side-panel', 'player-status-list', 'history-list', 'coach-block', 'coach-message',
      'hand-zone', 'hand-count', 'turn-indicator', 'btn-clear-selection', 'btn-advice',
      'btn-analysis', 'btn-pass', 'btn-play', 'hand-cards',
      'modal-settings', 'set-player-count', 'set-difficulty', 'set-bot-speed',
      'set-animations', 'set-autohints', 'set-darkmode', 'set-3club', 'set-twopower', 'set-bombs',
      'btn-apply-settings', 'btn-reset-stats-inline',
      'modal-stats', 'stats-grid', 'stats-history-list', 'btn-reset-stats',
      'modal-training', 'training-title', 'training-context', 'training-pile', 'training-hand',
      'training-feedback', 'btn-training-clear', 'btn-training-submit', 'btn-training-next',
      'modal-analysis', 'analysis-content',
      'modal-endgame', 'endgame-content', 'btn-endgame-newgame',
    ];
    ids.forEach((id) => { this.els[id] = document.getElementById(id); });
  },

  bindEvents() {
    this.els['btn-new-game'].addEventListener('click', () => this.confirmNewGame());
    this.els['btn-reset'].addEventListener('click', () => this.confirmNewGame());
    this.els['btn-settings'].addEventListener('click', () => this.openSettings());
    this.els['btn-stats'].addEventListener('click', () => this.openStats());
    this.els['btn-training'].addEventListener('click', () => this.openTraining());

    this.els['btn-apply-settings'].addEventListener('click', () => this.applySettingsAndRestart());
    this.els['btn-reset-stats-inline'].addEventListener('click', () => this.resetStats());
    this.els['btn-reset-stats'].addEventListener('click', () => this.resetStats());

    this.els['btn-clear-selection'].addEventListener('click', () => this.clearSelection());
    this.els['btn-play'].addEventListener('click', () => this.playSelected());
    this.els['btn-pass'].addEventListener('click', () => this.passTurn());
    this.els['btn-advice'].addEventListener('click', () => this.showAdvice());
    this.els['btn-analysis'].addEventListener('click', () => this.showLastAnalysis());

    this.els['btn-training-clear'].addEventListener('click', () => this.trainingClear());
    this.els['btn-training-submit'].addEventListener('click', () => this.trainingSubmit());
    this.els['btn-training-next'].addEventListener('click', () => this.loadTrainingScenario());

    this.els['btn-endgame-newgame'].addEventListener('click', () => {
      this.closeModal(this.els['modal-endgame']);
      this.newGame();
    });

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', (e) => this.closeModal(e.target.closest('.modal-overlay')));
    });
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeModal(overlay); });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach((o) => { if (!o.hidden) this.closeModal(o); });
      }
    });
  },

  applyThemeClass() {
    document.body.classList.toggle('theme-light', !this.settings.darkmode);
  },

  // ---------------------------------------------------------
  // GESTION DE PARTIE
  // ---------------------------------------------------------

  confirmNewGame() {
    if (this.game && !this.game.over) {
      if (!confirm('Démarrer une nouvelle partie ? La partie en cours sera perdue.')) return;
    }
    this.newGame();
  },

  buildGameSettings() {
    return {
      playerCount: Number(this.settings.playerCount),
      use3ClubStart: this.settings.use3ClubStart,
      twoIsPower: this.settings.twoIsPower,
      bombsAllowed: this.settings.bombsAllowed,
    };
  },

  newGame() {
    clearTimeout(this.botTimer);
    this.selected = [];
    this.analyses = [];
    this.lastAnalysis = null;

    const callbacks = {
      onLog: () => this.renderHistory(),
      onPlay: () => {},
      onPass: () => {},
      onTrickWon: () => {},
      onFinish: () => {},
      onGameEnd: (order) => this.handleGameEnd(order),
    };

    this.game = new PresidentGame(this.buildGameSettings(), callbacks);

    // Assigne profils et noms des bots
    const usedNames = [];
    const difficulties = PresidentBot.BOT_DIFFICULTIES;
    this.game.players.forEach((p) => {
      if (!p.isHuman) {
        const name = PresidentBot.pickBotName(usedNames);
        usedNames.push(name);
        p.name = name;
        const diff = this.settings.difficulty === 'mixte'
          ? difficulties[Math.floor(Math.random() * difficulties.length)]
          : this.settings.difficulty;
        const style = PresidentBot.BOT_STYLES[Math.floor(Math.random() * PresidentBot.BOT_STYLES.length)];
        p.botProfile = PresidentBot.makeBotProfile(diff, style);
      }
    });

    this.game.start();
    this.renderAll();
    this.setCoachMessage("Cliquez sur « Conseils » pendant votre tour pour obtenir de l'aide.");
    this.continueLoop();
  },

  // ---------------------------------------------------------
  // BOUCLE DE JEU (tours des bots)
  // ---------------------------------------------------------

  continueLoop() {
    if (this.game.over) return;
    const player = this.game.currentPlayer();
    if (player.isHuman) {
      this.renderAll();
      return;
    }
    this.renderAll();
    const delay = BOT_SPEED_MS[this.settings.botSpeed] || 850;
    this.botTimer = setTimeout(() => this.playBotTurn(player.id), delay);
  },

  playBotTurn(playerId) {
    if (this.game.over || this.game.turnIndex !== playerId) { this.continueLoop(); return; }
    const move = PresidentBot.decideBotMove(this.game, playerId);
    if (move) {
      this.game.playCards(playerId, move.cards);
    } else {
      this.game.pass(playerId);
    }
    if (!this.game.over) this.continueLoop();
    else this.renderAll();
  },

  // ---------------------------------------------------------
  // ACTIONS DU JOUEUR HUMAIN
  // ---------------------------------------------------------

  toggleCardSelection(card) {
    const player = this.game.players[0];
    if (this.game.turnIndex !== 0 || this.game.over) return;
    const idx = this.selected.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      this.selected.splice(idx, 1);
    } else {
      if (this.selected.length && this.selected[0].value !== card.value) {
        this.selected = [card];
      } else {
        this.selected.push(card);
      }
    }
    this.renderHand();
    this.updateActionButtons();
  },

  clearSelection() {
    this.selected = [];
    this.renderHand();
    this.updateActionButtons();
  },

  playSelected() {
    if (this.game.turnIndex !== 0 || !this.selected.length) return;
    const cardsToPlay = this.selected.slice();

    // Analyse AVANT de jouer (état encore intact)
    const analysis = PresidentAnalysis.analyzeMove(this.game, 0, cardsToPlay);
    const result = this.game.playCards(0, cardsToPlay);

    if (!result.ok) {
      this.setCoachMessage(`⚠️ ${result.reason}`);
      return;
    }

    this.analyses.push(analysis);
    this.lastAnalysis = analysis;
    this.selected = [];
    this.setCoachMessage(`${analysis.rating} — ${analysis.explanation}`);

    if (!this.game.over) this.continueLoop();
    else this.renderAll();
  },

  passTurn() {
    if (this.game.turnIndex !== 0) return;
    const analysis = PresidentAnalysis.analyzeMove(this.game, 0, null);
    const result = this.game.pass(0);
    if (!result.ok) {
      this.setCoachMessage(`⚠️ ${result.reason}`);
      return;
    }
    this.analyses.push(analysis);
    this.lastAnalysis = analysis;
    this.setCoachMessage(`${analysis.rating} — ${analysis.explanation}`);
    if (!this.game.over) this.continueLoop();
    else this.renderAll();
  },

  showAdvice() {
    if (this.game.turnIndex !== 0) {
      this.setCoachMessage("Ce n'est pas votre tour pour le moment.");
      return;
    }
    const advice = PresidentCoach.getAdvice(this.game, 0);
    this.setCoachMessage(`${advice.headline} ${advice.reason}`);
  },

  showLastAnalysis() {
    if (!this.lastAnalysis) {
      alert("Aucun coup analysé pour l'instant. Jouez ou passez pour obtenir une analyse.");
      return;
    }
    const a = this.lastAnalysis;
    this.els['analysis-content'].innerHTML = `
      <span class="rating-badge rating-${a.rating}">${a.rating}</span>
      <p>${a.explanation}</p>
    `;
    this.openModal(this.els['modal-analysis']);
  },

  setCoachMessage(msg) {
    this.els['coach-message'].textContent = msg;
  },

  // ---------------------------------------------------------
  // RENDU
  // ---------------------------------------------------------

  renderAll() {
    this.renderBotSeats();
    this.renderPile();
    this.renderStatusList();
    this.renderHistory();
    this.renderHand();
    this.updateActionButtons();
    this.updateTurnIndicator();
  },

  renderBotSeats() {
    const container = this.els['bot-seats'];
    container.innerHTML = '';
    const bots = this.game.players.filter((p) => !p.isHuman);
    const n = bots.length;
    bots.forEach((p, i) => {
      const angle = n === 1 ? -90 : -170 + (i * (160 / (n - 1)));
      const rad = (angle * Math.PI) / 180;
      const left = 50 + 42 * Math.cos(rad);
      const top = 50 + 36 * Math.sin(rad);

      const seat = document.createElement('div');
      seat.className = 'bot-seat';
      if (this.game.turnIndex === p.id && !this.game.over) seat.classList.add('active');
      if (p.finished) seat.classList.add('finished');
      seat.style.left = `${left}%`;
      seat.style.top = `${top}%`;

      const statusLabel = p.finished ? (p.title || 'Terminé')
        : p.status === 'joue' ? 'joue' : p.status === 'passe' ? 'a passé' : 'attend';
      const statusClass = p.status === 'joue' ? 'playing' : p.status === 'passe' ? 'passed' : '';

      seat.innerHTML = `
        <div class="bot-avatar">${p.name.slice(0, 2).toUpperCase()}</div>
        <div class="bot-name">${p.name}</div>
        <div class="bot-meta">${p.botProfile ? `${p.botProfile.difficulty} · ${p.botProfile.style}` : ''}</div>
        <div class="bot-cardcount">${p.hand.length} carte${p.hand.length > 1 ? 's' : ''}</div>
        <div class="bot-status-chip ${statusClass}">${statusLabel}</div>
      `;
      container.appendChild(seat);
    });
  },

  renderPile() {
    const pileEl = this.els['pile-cards'];
    pileEl.innerHTML = '';
    if (!this.game.pile.count) {
      pileEl.innerHTML = '<span class="pile-empty">Pli libre — à vous d\'ouvrir</span>';
    } else {
      this.game.pile.cards.forEach((c) => pileEl.appendChild(this.buildCardEl(c, false)));
    }
    this.els['trick-counter'].textContent = `Manche · pli n°${this.game.trickNumber}`;
  },

  renderStatusList() {
    const list = this.els['player-status-list'];
    list.innerHTML = '';
    this.game.players.forEach((p) => {
      const li = document.createElement('li');
      if (this.game.turnIndex === p.id && !this.game.over) li.classList.add('is-turn');
      const statusLabel = p.finished ? (p.title || 'Terminé') : (p.status === 'joue' ? 'a joué' : p.status === 'passe' ? 'a passé' : 'attend');
      li.innerHTML = `<span class="pl-name">${p.name}${p.isHuman ? ' (vous)' : ''}</span><span class="pl-count">${p.hand.length} · ${statusLabel}</span>`;
      list.appendChild(li);
    });
  },

  renderHistory() {
    const list = this.els['history-list'];
    if (!list) return;
    list.innerHTML = '';
    this.game.history.slice(0, 30).forEach((msg) => {
      const li = document.createElement('li');
      li.textContent = msg;
      list.appendChild(li);
    });
  },

  renderHand() {
    const container = this.els['hand-cards'];
    container.innerHTML = '';
    const player = this.game.players[0];
    const selectedIds = new Set(this.selected.map((c) => c.id));
    player.hand.forEach((c) => {
      const el = this.buildCardEl(c, true);
      if (selectedIds.has(c.id)) el.classList.add('selected');
      el.addEventListener('click', () => this.toggleCardSelection(c));
      container.appendChild(el);
    });
    this.els['hand-count'].textContent = `${player.hand.length} carte${player.hand.length !== 1 ? 's' : ''}`;
  },

  buildCardEl(card, interactive) {
    const el = document.createElement('div');
    const isRed = card.suit === '♥' || card.suit === '♦';
    el.className = `card${isRed ? ' red' : ''}`;
    el.innerHTML = `
      <div class="corner-top">${card.rank}<br>${card.suit}</div>
      <div class="suit-center">${card.suit}</div>
      <div class="corner-bottom">${card.rank}<br>${card.suit}</div>
    `;
    return el;
  },

  updateActionButtons() {
    const isTurn = this.game.turnIndex === 0 && !this.game.over;
    const hasSelection = this.selected.length > 0;
    let validSelection = false;
    if (hasSelection) {
      const moves = this.game.getValidMoves(0);
      validSelection = moves.some((m) =>
        m.cards.length === this.selected.length &&
        m.value === this.selected[0].value &&
        this.selected.every((c) => c.value === m.value)
      );
    }
    this.els['btn-play'].disabled = !(isTurn && hasSelection && validSelection);
    this.els['btn-pass'].disabled = !isTurn;
    this.els['btn-advice'].disabled = !isTurn;
    this.els['btn-clear-selection'].disabled = !hasSelection;
  },

  updateTurnIndicator() {
    const el = this.els['turn-indicator'];
    if (this.game.over) {
      el.textContent = 'Partie terminée';
      el.classList.remove('my-turn');
      return;
    }
    const isTurn = this.game.turnIndex === 0;
    el.textContent = isTurn ? 'C\'est votre tour !' : `Tour de ${this.game.currentPlayer().name}…`;
    el.classList.toggle('my-turn', isTurn);
  },

  // ---------------------------------------------------------
  // FIN DE PARTIE
  // ---------------------------------------------------------

  handleGameEnd(order) {
    const summary = PresidentAnalysis.summarizeAnalyses(this.analyses);
    const human = this.game.players[0];
    const place = human.finishOrder;
    const n = this.game.players.length;
    const score = Math.round(((n - place + 1) / n) * 100 + summary.accuracy * 0.5);

    PresidentStats.recordGameResult({ place, accuracy: summary.accuracy, players: n, score });

    this.renderEndgame(order, summary, score);
    this.openModal(this.els['modal-endgame']);
    this.renderAll();
  },

  renderEndgame(order, summary, score) {
    const n = this.game.players.length;
    const rankingHtml = order.map((pid, idx) => {
      const p = this.game.players[pid];
      let sealClass = 'seal-mid';
      if (idx === 0) sealClass = 'seal-1';
      else if (idx === 1 && n > 2) sealClass = 'seal-2';
      else if (idx === order.length - 1) sealClass = 'seal-last';
      return `<li><span class="seal ${sealClass}">${idx + 1}</span> ${p.name}${p.isHuman ? ' (vous)' : ''} — <em>${p.title}</em></li>`;
    }).join('');

    const errorsHtml = summary.topErrors.length
      ? `<ul class="move-list">${summary.topErrors.map((e) => `<li><strong>${e.rating}.</strong> ${e.explanation}</li>`).join('')}</ul>`
      : '<p><em>Aucune erreur notable — bravo !</em></p>';

    const bestHtml = summary.topMoves.length
      ? `<ul class="move-list">${summary.topMoves.map((e) => `<li><strong>Excellent.</strong> ${e.explanation}</li>`).join('')}</ul>`
      : '<p><em>Pas encore de coup jugé excellent — continuez à vous entraîner !</em></p>';

    this.els['endgame-content'].innerHTML = `
      <ol class="ranking-list">${rankingHtml}</ol>
      <div class="endgame-summary-grid">
        <div class="stat-card"><div class="stat-value">${summary.accuracy}%</div><div class="stat-label">Précision estimée</div></div>
        <div class="stat-card"><div class="stat-value">${summary.counts.Excellent + summary.counts.Bon}</div><div class="stat-label">Bons coups</div></div>
        <div class="stat-card"><div class="stat-value">${summary.counts.Erreur}</div><div class="stat-label">Erreurs</div></div>
      </div>
      <h3>Vos trois erreurs principales</h3>
      ${errorsHtml}
      <h3>Vos meilleurs coups</h3>
      ${bestHtml}
      <p style="margin-top:14px;font-family:var(--font-mono);font-size:13px;">Score global : <strong>${score}</strong></p>
    `;
  },

  // ---------------------------------------------------------
  // MODALES
  // ---------------------------------------------------------

  openModal(el) { el.hidden = false; },
  closeModal(el) { el.hidden = true; },

  openSettings() {
    const s = this.settings;
    this.els['set-player-count'].value = s.playerCount;
    this.els['set-difficulty'].value = s.difficulty;
    this.els['set-bot-speed'].value = s.botSpeed;
    this.els['set-animations'].checked = s.animations;
    this.els['set-autohints'].checked = s.autohints;
    this.els['set-darkmode'].checked = s.darkmode;
    this.els['set-3club'].checked = s.use3ClubStart;
    this.els['set-twopower'].checked = s.twoIsPower;
    this.els['set-bombs'].checked = s.bombsAllowed;
    this.openModal(this.els['modal-settings']);
  },

  applySettingsAndRestart() {
    this.settings = {
      playerCount: Number(this.els['set-player-count'].value),
      difficulty: this.els['set-difficulty'].value,
      botSpeed: this.els['set-bot-speed'].value,
      animations: this.els['set-animations'].checked,
      autohints: this.els['set-autohints'].checked,
      darkmode: this.els['set-darkmode'].checked,
      use3ClubStart: this.els['set-3club'].checked,
      twoIsPower: this.els['set-twopower'].checked,
      bombsAllowed: this.els['set-bombs'].checked,
    };
    saveSettings(this.settings);
    this.applyThemeClass();
    this.closeModal(this.els['modal-settings']);
    this.newGame();
  },

  openStats() {
    const stats = PresidentStats.loadStats();
    const avgAcc = PresidentStats.averageAccuracy(stats);
    const wr = PresidentStats.winRate(stats);
    this.els['stats-grid'].innerHTML = `
      <div class="stat-card"><div class="stat-value">${stats.gamesPlayed}</div><div class="stat-label">Parties jouées</div></div>
      <div class="stat-card"><div class="stat-value">${wr}%</div><div class="stat-label">Taux de victoire</div></div>
      <div class="stat-card"><div class="stat-value">${avgAcc}%</div><div class="stat-label">Précision moyenne</div></div>
      <div class="stat-card"><div class="stat-value">${stats.bestScore}</div><div class="stat-label">Meilleur score</div></div>
      <div class="stat-card"><div class="stat-value">${stats.currentStreak}</div><div class="stat-label">Série en cours</div></div>
      <div class="stat-card"><div class="stat-value">${stats.bestStreak}</div><div class="stat-label">Meilleure série</div></div>
    `;
    const list = this.els['stats-history-list'];
    list.innerHTML = '';
    if (!stats.lastResults.length) {
      list.innerHTML = '<li>Aucune partie terminée pour l\'instant.</li>';
    } else {
      stats.lastResults.forEach((r) => {
        const li = document.createElement('li');
        const date = new Date(r.date);
        li.innerHTML = `<span>${date.toLocaleDateString('fr-FR')} — ${r.players} joueurs</span><span>Place ${r.place} · ${r.accuracy}%</span>`;
        list.appendChild(li);
      });
    }
    this.openModal(this.els['modal-stats']);
  },

  resetStats() {
    if (!confirm('Réinitialiser toutes les statistiques ? Cette action est irréversible.')) return;
    PresidentStats.resetStats();
    this.openStats();
  },

  // ---------------------------------------------------------
  // ENTRAÎNEMENT / SCÉNARIOS
  // ---------------------------------------------------------

  openTraining() {
    this.loadTrainingScenario();
    this.openModal(this.els['modal-training']);
  },

  loadTrainingScenario() {
    const prevId = this.currentScenario ? this.currentScenario.id : null;
    this.currentScenario = PresidentScenarios.getRandomScenario(prevId);
    this.trainingSelected = [];
    this.renderTraining();
  },

  renderTraining() {
    const s = this.currentScenario;
    this.els['training-title'].textContent = `Entraînement — ${s.title}`;
    this.els['training-context'].textContent = s.context;

    const pileEl = this.els['training-pile'];
    pileEl.innerHTML = s.pileValue
      ? `<span style="font-size:13px;color:#6b5a36;">Pli en cours : ${s.pileCount}× ${s.pileValue}</span>`
      : `<span style="font-size:13px;color:#6b5a36;">Pli libre — vous ouvrez.</span>`;

    const handEl = this.els['training-hand'];
    handEl.innerHTML = '';
    const selectedIds = new Set(this.trainingSelected.map((c) => c.id));
    s.handCards.forEach((c) => {
      const el = this.buildCardEl(c, true);
      if (selectedIds.has(c.id)) el.classList.add('selected');
      el.addEventListener('click', () => this.toggleTrainingSelection(c));
      handEl.appendChild(el);
    });

    this.els['training-feedback'].hidden = true;
    this.els['btn-training-next'].hidden = true;
    this.els['btn-training-submit'].hidden = false;
  },

  toggleTrainingSelection(card) {
    const idx = this.trainingSelected.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      this.trainingSelected.splice(idx, 1);
    } else {
      if (this.trainingSelected.length && this.trainingSelected[0].rank !== card.rank) {
        this.trainingSelected = [card];
      } else {
        this.trainingSelected.push(card);
      }
    }
    this.renderTraining();
    // renderTraining reset selection display; reapply selected class after rebuild
    const selectedIds = new Set(this.trainingSelected.map((c) => c.id));
    this.els['training-hand'].querySelectorAll('.card').forEach((el, i) => {
      const cardObj = this.currentScenario.handCards[i];
      if (selectedIds.has(cardObj.id)) el.classList.add('selected');
    });
  },

  trainingClear() {
    this.trainingSelected = [];
    this.renderTraining();
  },

  trainingSubmit() {
    if (!this.trainingSelected.length) {
      alert('Sélectionnez au moins une carte avant de valider.');
      return;
    }
    const correct = PresidentScenarios.checkAnswer(this.currentScenario, this.trainingSelected);
    const fb = this.els['training-feedback'];
    fb.hidden = false;
    fb.className = `training-feedback ${correct ? 'correct' : 'incorrect'}`;
    fb.innerHTML = correct
      ? `<strong>Bonne réponse !</strong> ${this.currentScenario.explanation}`
      : `<strong>Pas tout à fait.</strong> ${this.currentScenario.explanation}`;
    this.els['btn-training-next'].hidden = false;
    this.els['btn-training-submit'].hidden = true;
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
