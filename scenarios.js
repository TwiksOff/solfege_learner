/* ============================================================
   scenarios.js — Exercices & puzzles ciblés
   ============================================================ */

/**
 * Chaque scénario décrit une situation figée :
 *  - hand : cartes du joueur (rangs uniquement, un exemplaire par carte listée,
 *           les suits sont attribués automatiquement)
 *  - pileDescription : texte affiché pour décrire le pli en cours
 *  - pileValue / pileCount : contraintes du pli (null = pli libre)
 *  - playersLeft : nombre de joueurs encore en jeu
 *  - correctRanks : rang(s) attendu(s) pour la bonne réponse (tableau de rangs,
 *           l'ordre n'importe pas ; le joueur doit sélectionner exactement ce groupe)
 *  - explanation : justification pédagogique
 */
const SCENARIOS = [
  {
    id: 'sc1',
    title: 'Fin de partie serrée',
    context: 'Il reste trois joueurs en jeu. Le pli est libre : vous ouvrez.',
    hand: ['3', '4', '4', '7', 'Q', 'A', '2'],
    pileValue: null,
    pileCount: null,
    correct: { rank: '3', count: 1 },
    explanation:
      "Ouvrez avec votre carte la plus faible (le 3) pour observer les réactions et garder vos cartes fortes (As, 2) en réserve pour contrôler la fin de partie.",
  },
  {
    id: 'sc2',
    title: 'Défausser une paire',
    context: 'Le pli en cours est une paire de 8. C\'est à vous de jouer.',
    hand: ['5', '9', '9', 'J', 'K', 'K', '2'],
    pileValue: '8',
    pileCount: 2,
    correct: { rank: '9', count: 2 },
    explanation:
      'Votre paire de 9 est la plus petite combinaison capable de battre la paire de 8 : elle vous permet de rester dans le coup sans gaspiller vos cartes plus fortes (K, 2).',
  },
  {
    id: 'sc3',
    title: 'Garder le contrôle',
    context: 'Le pli en cours est un simple 10. Vous êtes en tête de partie avec peu de cartes.',
    hand: ['10', 'A', '2'],
    pileValue: '10',
    pileCount: 1,
    correct: { rank: 'A', count: 1 },
    explanation:
      "Jouez l'As plutôt que le 2 : il suffit à battre le 10, et vous garderez le 2 (la carte la plus forte) pour sécuriser votre victoire ensuite.",
  },
  {
    id: 'sc4',
    title: 'Le piège du carré',
    context: 'Le pli en cours est une paire de valets. Vous avez un carré de 7 en main.',
    hand: ['7', '7', '7', '7', 'Q', '2'],
    pileValue: 'J',
    pileCount: 2,
    correct: { rank: '7', count: 4 },
    explanation:
      "Le carré efface le pli et vous redonne immédiatement la main : c'est souvent le bon moment de le jouer si vous n'avez pas d'autre option raisonnable pour battre la paire de valets.",
  },
  {
    id: 'sc5',
    title: 'Ouverture prudente',
    context: 'Vous avez la main la plus large de la table en tout début de partie. Le pli est libre.',
    hand: ['3', '3', '5', '6', '8', 'K', 'A', 'A', '2'],
    pileValue: null,
    pileCount: null,
    correct: { rank: '3', count: 2 },
    explanation:
      'En début de partie, ouvrez avec vos cartes les plus faibles. Jouer la paire de 3 vous débarrasse de deux cartes peu utiles en une seule fois.',
  },
];

const RANK_TO_VALUE = { '3':0,'4':1,'5':2,'6':3,'7':4,'8':5,'9':6,'10':7,'J':8,'Q':9,'K':10,'A':11,'2':12 };

function buildScenarioHand(rankList) {
  const suits = ['♠', '♥', '♦', '♣'];
  const counts = {};
  return rankList.map((rank) => {
    counts[rank] = (counts[rank] || 0) + 1;
    const suit = suits[(counts[rank] - 1) % suits.length];
    return { id: `${rank}${suit}#${counts[rank]}`, rank, suit, value: RANK_TO_VALUE[rank] };
  });
}

function getScenario(id) {
  const s = SCENARIOS.find((x) => x.id === id) || SCENARIOS[0];
  return {
    ...s,
    handCards: buildScenarioHand(s.hand),
  };
}

function getRandomScenario(excludeId) {
  const pool = SCENARIOS.filter((s) => s.id !== excludeId);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return getScenario(pick.id);
}

/** Vérifie la réponse du joueur (liste de cartes sélectionnées) contre la bonne réponse */
function checkAnswer(scenario, selectedCards) {
  if (!selectedCards.length) return false;
  const rank = selectedCards[0].rank;
  const sameRank = selectedCards.every((c) => c.rank === rank);
  return sameRank && rank === scenario.correct.rank && selectedCards.length === scenario.correct.count;
}

if (typeof window !== 'undefined') {
  window.PresidentScenarios = { SCENARIOS, getScenario, getRandomScenario, checkAnswer };
}
