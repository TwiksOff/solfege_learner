/* ============================================================
   analysis.js — Notation des coups joués par le joueur humain
   ============================================================ */

const RATING_LEVELS = ['Excellent', 'Bon', 'Correct', 'Imprécis', 'Erreur'];

/**
 * Compare le coup joué (ou le passage) par le joueur au meilleur coup
 * calculé par l'IA experte, et retourne une note + explication.
 *
 * snapshotBefore : { game, playerId } état AVANT le coup (pour calculer le meilleur coup possible)
 * playedMove : { cards } ou null si le joueur a passé
 */
function analyzeMove(gameSnapshotBefore, playerId, playedCardsOrNull) {
  const best = window.PresidentBot.computeBestMove(gameSnapshotBefore, playerId);
  const player = gameSnapshotBefore.players[playerId];

  // Cas : le joueur a passé
  if (!playedCardsOrNull) {
    if (!best) {
      return {
        rating: 'Excellent',
        explanation: "Vous n'aviez aucun coup possible : passer était le seul choix.",
      };
    }
    const isPower = best.move.value >= 10;
    if (isPower && gameSnapshotBefore.pile.count > 0) {
      return {
        rating: 'Bon',
        explanation: `Passer était raisonnable ici : le seul coup disponible impliquait ${window.PresidentCoach.describeCards(best.move.cards)}, une carte forte à économiser.`,
      };
    }
    return {
      rating: 'Erreur',
      explanation: `Vous auriez pu jouer ${window.PresidentCoach.describeCards(best.move.cards)} pour rester dans le coup et réduire votre main.`,
    };
  }

  // Cas : le joueur a joué des cartes
  const playedValue = playedCardsOrNull[0].value;
  const playedCount = playedCardsOrNull.length;

  if (!best) {
    return { rating: 'Correct', explanation: 'Coup joué sans alternative claire à comparer.' };
  }

  const playedScore = window.PresidentBot.scoreMove(
    { cards: playedCardsOrNull, value: playedValue, count: playedCount },
    player.hand,
    gameSnapshotBefore.pile,
    gameSnapshotBefore,
    playerId,
    window.PresidentBot.makeBotProfile('expert', 'équilibré')
  );

  const bestScore = best.score;
  const delta = bestScore - playedScore;

  let rating;
  let explanation;

  if (playedValue === best.move.value && playedCount === best.move.count) {
    rating = 'Excellent';
    explanation = "C'est exactement le coup optimal dans cette situation.";
  } else if (delta <= 2) {
    rating = 'Bon';
    explanation = 'Un très bon coup, proche de la meilleure option possible.';
  } else if (delta <= 6) {
    rating = 'Correct';
    explanation = 'Un coup raisonnable, même si une meilleure option existait.';
  } else if (delta <= 12) {
    rating = 'Imprécis';
    explanation = `Un coup un peu prématuré : ${window.PresidentCoach.describeCards(best.move.cards)} aurait été préférable ici.`;
  } else {
    rating = 'Erreur';
    const isPower = playedValue >= 10;
    explanation = isPower
      ? `Vous avez utilisé une carte forte trop tôt. Cette carte devait être conservée pour contrôler la fin de manche.`
      : `Ce coup vous coûte du contrôle sur la partie : ${window.PresidentCoach.describeCards(best.move.cards)} aurait mieux préparé votre fin de main.`;
  }

  return { rating, explanation, bestMove: best.move };
}

/** Agrège une liste d'analyses en un résumé de fin de partie */
function summarizeAnalyses(analyses) {
  const counts = { Excellent: 0, Bon: 0, Correct: 0, Imprécis: 0, Erreur: 0 };
  analyses.forEach((a) => (counts[a.rating] = (counts[a.rating] || 0) + 1));
  const total = analyses.length || 1;
  const goodCount = counts.Excellent + counts.Bon;
  const accuracy = Math.round((goodCount / total) * 100);

  const errors = analyses.filter((a) => a.rating === 'Erreur' || a.rating === 'Imprécis').slice(-3);
  const best = analyses.filter((a) => a.rating === 'Excellent').slice(-3);

  return { counts, accuracy, topErrors: errors, topMoves: best, total };
}

if (typeof window !== 'undefined') {
  window.PresidentAnalysis = { RATING_LEVELS, analyzeMove, summarizeAnalyses };
}
