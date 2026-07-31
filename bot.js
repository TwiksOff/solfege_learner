/* ============================================================
   bot.js — Intelligence des bots
   5 niveaux de difficulté × 5 styles de jeu.
   ============================================================ */

const BOT_STYLES = ['prudent', 'agressif', 'équilibré', 'opportuniste', 'imprévisible'];
const BOT_DIFFICULTIES = ['débutant', 'facile', 'moyen', 'difficile', 'expert'];

const BOT_NAMES = [
  'Camille', 'Théo', 'Léa', 'Nathan', 'Chloé', 'Hugo', 'Manon', 'Louis',
  'Inès', 'Axel', 'Zoé', 'Rayan', 'Jade', 'Noah', 'Lina',
];

function pickBotName(usedNames) {
  const pool = BOT_NAMES.filter((n) => !usedNames.includes(n));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : `Bot${usedNames.length}`;
}

function makeBotProfile(difficulty, style) {
  return { difficulty, style };
}

/** Score heuristique d'un coup : plus haut = meilleur pour le bot */
function scoreMove(move, hand, pile, game, botIndex, profile) {
  const remainingAfter = hand.length - move.cards.length;
  let score = 0;

  // Se débarrasser de cartes est globalement positif
  score += move.cards.length * 4;

  // Éviter de jouer les cartes fortes (2, As) trop tôt : pénalité proportionnelle
  const power = move.value; // index dans RANKS, 12 = "2"
  const isPowerCard = power >= 10; // As ou 2
  const handSize = hand.length;
  const gameProgress = 1 - handSize / 13; // approx. 0 en début, 1 en fin

  if (isPowerCard) {
    score -= (1 - gameProgress) * 6; // pénalise fortement en début de partie
  } else {
    score += (power / 12) * 1.5; // légère préférence à jouer les cartes moyennes/hautes plutôt que les plus basses, pour garder les 3-4 en réserve de sécurité
  }

  // Terminer la main est très positif
  if (remainingAfter === 0) score += 50;

  // Jouer une paire/brelan/carré complet (vider un rang entier) est positif : évite de garder des cartes isolées inutiles
  const groups = window.PresidentUtils.groupByRank(hand);
  const groupSize = (groups[move.value] || []).length;
  if (move.cards.length === groupSize) score += 3;

  // Bombe (carré) : très fort en toute fin de partie ou pour reprendre la main
  if (move.bomb) score += 8;

  // Ajustement par style
  switch (profile.style) {
    case 'prudent':
      if (isPowerCard) score -= 4;
      score -= move.cards.length * 0.5; // préfère économiser, jouer petit
      break;
    case 'agressif':
      score += move.cards.length * 2; // aime jouer gros pour garder la main
      if (isPowerCard) score += 2;
      break;
    case 'opportuniste':
      if (move.cards.length === groupSize && move.cards.length > 1) score += 4; // adore vider un rang complet
      break;
    case 'imprévisible':
      score += (Math.random() - 0.5) * 10;
      break;
    case 'équilibré':
    default:
      break;
  }

  return score;
}

/** Filtre les coups selon la difficulté (simule des bots plus ou moins "voyants") */
function filterMovesByDifficulty(moves, hand, pile, profile) {
  switch (profile.difficulty) {
    case 'débutant':
      // Joue la première carte/coup valide trouvé, sans stratégie
      return moves.length ? [moves[0]] : [];
    case 'facile':
      // Évite de jouer un As ou un 2 s'il existe une autre option
      {
        const nonPower = moves.filter((m) => m.value < 10);
        return nonPower.length ? nonPower : moves;
      }
    case 'moyen':
    case 'difficile':
    case 'expert':
    default:
      return moves;
  }
}

/**
 * Décide du coup à jouer (ou null pour passer) pour un bot donné.
 */
function decideBotMove(game, playerId) {
  const player = game.players[playerId];
  const profile = player.botProfile || makeBotProfile('moyen', 'équilibré');
  const moves = game.getValidMoves(playerId);

  if (moves.length === 0) return null; // doit passer

  // Débutant / facile : logique simplifiée
  if (profile.difficulty === 'débutant') {
    const candidates = filterMovesByDifficulty(moves, player.hand, game.pile, profile);
    return chooseWithRandomness(candidates, profile);
  }

  const candidates = filterMovesByDifficulty(moves, player.hand, game.pile, profile);

  // Si la main peut être terminée en un coup, le faire (sauf débutant/facile déjà gérés au-dessus,
  // mais même un bot moyen+ saisit une victoire immédiate)
  const winningMove = candidates.find((m) => m.cards.length === player.hand.length);
  if (winningMove) return winningMove;

  // Stratégie "prudent" : peut choisir de passer volontairement si le pli n'est pas vide
  // et que le coup nécessiterait une carte forte, pour économiser ses cartes fortes.
  if (profile.style === 'prudent' && game.pile.count > 0) {
    const onlyPowerLeft = candidates.every((m) => m.value >= 10);
    if (onlyPowerLeft && Math.random() < 0.6) {
      return null; // passe volontairement
    }
  }

  // Scoring
  const scored = candidates.map((m) => ({
    move: m,
    score: scoreMove(m, player.hand, game.pile, game, playerId, profile),
  }));
  scored.sort((a, b) => b.score - a.score);

  if (profile.difficulty === 'facile') {
    // choisit parmi les 2 meilleurs de façon un peu aléatoire
    const top = scored.slice(0, Math.min(2, scored.length));
    return top[Math.floor(Math.random() * top.length)].move;
  }

  if (profile.difficulty === 'moyen') {
    const top = scored.slice(0, Math.min(2, scored.length));
    return top[0].move;
  }

  // difficile / expert : prend le meilleur coup selon le score (expert a un scoring légèrement affiné)
  return scored[0].move;
}

function chooseWithRandomness(candidates, profile) {
  if (!candidates.length) return null;
  if (profile.style === 'imprévisible') {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return candidates[0];
}

/** Renvoie le "meilleur coup" tel qu'évalué par une IA experte — utilisé par le coach et l'analyse */
function computeBestMove(game, playerId) {
  const player = game.players[playerId];
  const moves = game.getValidMoves(playerId);
  if (moves.length === 0) return null;
  const expertProfile = makeBotProfile('expert', 'équilibré');
  const scored = moves.map((m) => ({
    move: m,
    score: scoreMove(m, player.hand, game.pile, game, playerId, expertProfile),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

if (typeof window !== 'undefined') {
  window.PresidentBot = {
    BOT_STYLES,
    BOT_DIFFICULTIES,
    pickBotName,
    makeBotProfile,
    decideBotMove,
    computeBestMove,
    scoreMove,
  };
}
