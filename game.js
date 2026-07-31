/* ============================================================
   game.js — Moteur de jeu du Président
   Gère : distribution, tours, validation des coups, plis,
   passage, victoire, classement final.
   ============================================================ */

const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_NAMES = { '♠': 'pique', '♥': 'cœur', '♦': 'carreau', '♣': 'trèfle' };

const TITLES = {
  2: ['Président', 'Trou du Cul'],
  3: ['Président', 'Neutre', 'Trou du Cul'],
  4: ['Président', 'Vice-Président', 'Vice-Trou', 'Trou du Cul'],
  5: ['Président', 'Vice-Président', 'Neutre', 'Vice-Trou', 'Trou du Cul'],
  6: ['Président', 'Vice-Président', 'Neutre', 'Neutre', 'Vice-Trou', 'Trou du Cul'],
  7: ['Président', 'Vice-Président', 'Neutre', 'Neutre', 'Neutre', 'Vice-Trou', 'Trou du Cul'],
  8: ['Président', 'Vice-Président', 'Neutre', 'Neutre', 'Neutre', 'Neutre', 'Vice-Trou', 'Trou du Cul'],
};

function makeDeck() {
  const deck = [];
  SUITS.forEach((suit) => {
    RANKS.forEach((rank, value) => {
      deck.push({ id: `${rank}${suit}`, rank, suit, value });
    });
  });
  return deck;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sortHand(hand) {
  return hand.slice().sort((a, b) => a.value - b.value || a.suit.localeCompare(b.suit));
}

/** Regroupe une main par rang -> liste de cartes */
function groupByRank(hand) {
  const groups = {};
  hand.forEach((c) => {
    if (!groups[c.value]) groups[c.value] = [];
    groups[c.value].push(c);
  });
  return groups;
}

/**
 * Énumère tous les coups jouables pour une main donnée,
 * compte tenu du pli courant.
 * Retourne une liste de { cards, value, count }.
 */
function enumerateMoves(hand, pile, rules) {
  const groups = groupByRank(hand);
  const moves = [];
  const freeLead = !pile || pile.count === 0;

  Object.keys(groups).forEach((valueStr) => {
    const value = Number(valueStr);
    const cards = groups[valueStr];
    const maxCount = cards.length;
    for (let count = 1; count <= maxCount; count++) {
      if (!freeLead && count !== pile.count) continue;
      if (!freeLead && value <= pile.value) continue;
      // combinations of `count` cards out of `cards` (same rank so any subset works identically in strength)
      moves.push({ cards: cards.slice(0, count), value, count });
    }
  });

  // Le "carré" (4 cartes identiques) peut être joué comme bombe même hors du bon compte
  if (rules.bombsAllowed) {
    Object.keys(groups).forEach((valueStr) => {
      const value = Number(valueStr);
      const cards = groups[valueStr];
      if (cards.length === 4 && (freeLead || pile.count !== 4)) {
        moves.push({ cards: cards.slice(), value, count: 4, bomb: true });
      }
    });
  }

  return moves;
}

class PresidentGame {
  constructor(settings, callbacks) {
    this.settings = Object.assign(
      {
        playerCount: 4,
        use3ClubStart: true,
        twoIsPower: true, // le 2 est la carte la plus forte
        bombsAllowed: true, // un carré efface le pli et redonne la main
        cardExchange: false,
      },
      settings
    );
    this.cb = callbacks || {};
    this.reset();
  }

  reset() {
    const n = this.settings.playerCount;
    this.players = [];
    for (let i = 0; i < n; i++) {
      this.players.push({
        id: i,
        name: i === 0 ? 'Vous' : `Bot ${i}`,
        isHuman: i === 0,
        hand: [],
        finished: false,
        finishOrder: null,
        status: 'attente',
        botProfile: null,
      });
    }
    this.pile = { count: 0, value: -1, cards: [] };
    this.lastPlay = null; // { playerId, cards }
    this.turnIndex = 0;
    this.passStreak = 0;
    this.activeCount = n;
    this.history = [];
    this.finishedOrder = [];
    this.over = false;
    this.trickNumber = 1;
  }

  dealCards() {
    const deck = shuffle(makeDeck());
    const n = this.players.length;
    deck.forEach((card, idx) => {
      this.players[idx % n].hand.push(card);
    });
    this.players.forEach((p) => (p.hand = sortHand(p.hand)));
  }

  determineStarter() {
    if (this.settings.use3ClubStart) {
      for (const p of this.players) {
        if (p.hand.find((c) => c.rank === '3' && c.suit === '♣')) {
          return p.id;
        }
      }
    }
    // fallback : celui qui a la carte la plus faible
    let best = { pid: 0, value: 99 };
    this.players.forEach((p) => {
      const minVal = Math.min(...p.hand.map((c) => c.value));
      if (minVal < best.value) best = { pid: p.id, value: minVal };
    });
    return best.pid;
  }

  start() {
    this.reset();
    this.dealCards();
    this.turnIndex = this.determineStarter();
    this.log(`Nouvelle partie — ${this.players[this.turnIndex].name} commence.`);
  }

  log(msg) {
    this.history.unshift(msg);
    if (this.cb.onLog) this.cb.onLog(msg);
  }

  currentPlayer() {
    return this.players[this.turnIndex];
  }

  getValidMoves(playerId) {
    const p = this.players[playerId];
    return enumerateMoves(p.hand, this.pile, this.settings);
  }

  canPlay(playerId) {
    return this.getValidMoves(playerId).length > 0;
  }

  /** Joue un ensemble de cartes (déjà validé côté appelant idéalement) */
  playCards(playerId, cards) {
    const p = this.players[playerId];
    if (playerId !== this.turnIndex) return { ok: false, reason: 'Ce n\'est pas votre tour.' };
    if (p.finished) return { ok: false, reason: 'Joueur déjà terminé.' };

    const value = cards[0].value;
    const sameRank = cards.every((c) => c.value === value);
    if (!sameRank) return { ok: false, reason: 'Les cartes doivent être du même rang.' };

    const isBomb = this.settings.bombsAllowed && cards.length === 4 && (this.pile.count === 0 || this.pile.count !== 4);
    const freeLead = this.pile.count === 0;

    if (!isBomb) {
      if (!freeLead && cards.length !== this.pile.count) {
        return { ok: false, reason: 'Vous devez jouer le même nombre de cartes.' };
      }
      if (!freeLead && value <= this.pile.value) {
        return { ok: false, reason: 'La carte doit être plus forte que le pli.' };
      }
    }

    // retire les cartes de la main
    const ids = new Set(cards.map((c) => c.id));
    p.hand = p.hand.filter((c) => !ids.has(c.id));
    p.status = 'joue';

    this.pile = { count: cards.length, value, cards, bomb: !!isBomb };
    this.lastPlay = { playerId, cards };
    this.passStreak = 0;

    this.log(`${p.name} joue ${cards.length}× ${cards[0].rank}${isBomb ? ' (carré, pli remporté !)' : ''}`);

    if (this.cb.onPlay) this.cb.onPlay(playerId, cards, isBomb);

    if (p.hand.length === 0) {
      this.finishPlayer(playerId);
    }

    if (isBomb) {
      // le pli est remporté immédiatement, le joueur rejoue
      this.clearPile();
      if (!p.finished) {
        this.turnIndex = playerId;
      } else {
        this.advanceToNextActive(playerId);
      }
    } else {
      this.advanceToNextActive(playerId);
    }

    this.checkGameEnd();
    return { ok: true };
  }

  pass(playerId) {
    if (playerId !== this.turnIndex) return { ok: false, reason: 'Ce n\'est pas votre tour.' };
    const p = this.players[playerId];
    p.status = 'passe';
    this.passStreak++;
    this.log(`${p.name} passe.`);
    if (this.cb.onPass) this.cb.onPass(playerId);

    // Si tous les joueurs actifs restants (hors le dernier à avoir joué) ont passé
    const remainingActive = this.players.filter((pl) => !pl.finished).length;
    if (this.lastPlay && this.passStreak >= remainingActive - 1) {
      this.winTrick(this.lastPlay.playerId);
      return { ok: true, trickWon: true };
    }

    this.advanceToNextActive(playerId);
    return { ok: true };
  }

  winTrick(playerId) {
    const p = this.players[playerId];
    this.log(`${p.name} remporte le pli.`);
    if (this.cb.onTrickWon) this.cb.onTrickWon(playerId);
    this.clearPile();
    this.trickNumber++;
    if (p.finished) {
      this.advanceToNextActive(playerId);
    } else {
      this.turnIndex = playerId;
      this.resetStatuses();
    }
  }

  clearPile() {
    this.pile = { count: 0, value: -1, cards: [] };
    this.lastPlay = null;
    this.passStreak = 0;
  }

  resetStatuses() {
    this.players.forEach((p) => {
      if (!p.finished) p.status = 'attente';
    });
  }

  finishPlayer(playerId) {
    const p = this.players[playerId];
    p.finished = true;
    p.status = 'termine';
    p.finishOrder = this.finishedOrder.length + 1;
    this.finishedOrder.push(playerId);
    this.log(`${p.name} a terminé sa main ! (${this.ordinal(p.finishOrder)})`);
    if (this.cb.onFinish) this.cb.onFinish(playerId, p.finishOrder);
  }

  ordinal(n) {
    if (n === 1) return '1er';
    return `${n}e`;
  }

  advanceToNextActive(fromId) {
    const n = this.players.length;
    let idx = fromId;
    for (let step = 1; step <= n; step++) {
      idx = (fromId + step) % n;
      const p = this.players[idx];
      if (!p.finished) {
        this.turnIndex = idx;
        return;
      }
    }
  }

  checkGameEnd() {
    const remaining = this.players.filter((p) => !p.finished);
    if (remaining.length <= 1) {
      if (remaining.length === 1) {
        remaining[0].finished = true;
        remaining[0].finishOrder = this.finishedOrder.length + 1;
        this.finishedOrder.push(remaining[0].id);
      }
      this.over = true;
      this.assignTitles();
      if (this.cb.onGameEnd) this.cb.onGameEnd(this.finishedOrder);
    }
  }

  assignTitles() {
    const n = this.players.length;
    const titles = TITLES[n] || TITLES[8];
    this.finishedOrder.forEach((pid, idx) => {
      this.players[pid].title = titles[idx] || 'Neutre';
    });
  }
}

if (typeof window !== 'undefined') {
  window.PresidentGame = PresidentGame;
  window.PresidentUtils = { RANKS, SUITS, SUIT_NAMES, makeDeck, shuffle, sortHand, groupByRank, enumerateMoves };
}
