/* ============================================================
   coach.js — Conseils pédagogiques
   ============================================================ */

function describeCards(cards) {
  const rank = cards[0].rank;
  const n = cards.length;
  const noun = n === 1 ? 'carte' : n === 2 ? 'paire' : n === 3 ? 'brelan' : 'carré';
  if (n === 1) return `le ${rank}`;
  return `la ${noun} de ${rank}`;
}

/**
 * Construit un conseil pour le joueur humain à son tour.
 * Retourne { move, headline, reason } ou { move: null, headline, reason } si passer est conseillé.
 */
function getAdvice(game, playerId) {
  const best = window.PresidentBot.computeBestMove(game, playerId);
  const player = game.players[playerId];
  const freeLead = game.pile.count === 0;

  if (!best) {
    return {
      move: null,
      headline: 'Vous devriez passer.',
      reason: "Aucune combinaison de votre main ne peut battre le pli actuel.",
    };
  }

  const { move, score } = best;
  const isPower = move.value >= 10;
  const handAfter = player.hand.length - move.cards.length;

  // Décide si passer est préférable (cas des bots prudents appliqué au conseil)
  if (!freeLead && isPower && score < 6 && handAfter > 0) {
    return {
      move: null,
      headline: 'Vous pourriez passer ici.',
      reason: `Jouer ${describeCards(move.cards)} maintenant vous forcerait à utiliser une carte forte trop tôt. Gardez-la pour reprendre la main plus tard, à moins de vouloir absolument éviter de reprendre le pli.`,
      alternative: move,
    };
  }

  let reason;
  if (handAfter === 0) {
    reason = `Ce coup vous permet de terminer votre main immédiatement — c'est la meilleure issue possible.`;
  } else if (move.bomb) {
    reason = `Ce carré efface le pli et vous redonne la main tout en vous débarrassant de 4 cartes d'un coup.`;
  } else if (isPower) {
    reason = `Vous n'avez pas d'autre choix judicieux : autant utiliser ${describeCards(move.cards)} maintenant plutôt que de rester bloqué avec elle plus tard.`;
  } else {
    const keptPower = player.hand.some((c) => c.value >= 10 && !move.cards.includes(c));
    reason = keptPower
      ? `Vous conservez ainsi vos cartes fortes (As, 2) pour reprendre la main plus tard.`
      : `C'est le coup le plus efficace pour réduire votre main sans vous exposer inutilement.`;
  }

  return {
    move,
    headline: `Vous devriez jouer ${describeCards(move.cards)}.`,
    reason,
  };
}

if (typeof window !== 'undefined') {
  window.PresidentCoach = { getAdvice, describeCards };
}
