// Touchline — the maths, pure. No clock, no fetch, no DOM, no imports.
// Same discipline as tavern.js and tideholm's game.js: a server or a page can
// lift this file whole, and tests.js pins every formula.
//
// v0 model, stated honestly: Elo win expectancy with a fixed home advantage,
// and a draw share that peaks when the sides are level. It is a placeholder
// with two named constants, not a fitted model — the calibration harness
// (worldcup's calibration.js precedent) replaces the constants with fitted
// ones once the season provides results to fit against. Until then the
// numbers are "fair by construction", not "fair by evidence", and the site
// says so.

// clubelo.com's own convention: home advantage worth ~65 Elo points.
const HOME_ADVANTAGE_ELO = 65;

// EPL long-run draw rate is ~24-26%. DRAW_MAX is the draw probability when
// the sides are exactly level (draws are likeliest then); DRAW_WIDTH sets
// how fast that decays as one side dominates. Both are calibration targets.
const DRAW_MAX = 0.29;
const DRAW_WIDTH = 0.4;

/** Classic Elo expectancy for the home side, home advantage included. */
function eloExpected(homeElo, awayElo, homeAdv = HOME_ADVANTAGE_ELO) {
  if (!Number.isFinite(homeElo) || !Number.isFinite(awayElo)) return NaN;
  return 1 / (1 + Math.pow(10, -((homeElo + homeAdv - awayElo) / 400)));
}

/**
 * Fair 1X2 probabilities from two Elo ratings.
 *
 * The draw is carved out of both sides proportionally:
 *   pDraw = DRAW_MAX * exp(-((E - 0.5) / DRAW_WIDTH)^2)
 *   pHome = E * (1 - pDraw);  pAway = (1 - E) * (1 - pDraw)
 * Proportional carving keeps every probability positive at any Elo gap —
 * subtracting pDraw/2 from each side goes negative once E leaves [pD/2,
 * 1-pD/2], which a 400-point gap reaches.
 *
 * @returns {{home:number, draw:number, away:number}} summing to 1
 */
function fairProbs(homeElo, awayElo, opts = {}) {
  const E = eloExpected(homeElo, awayElo, opts.homeAdv ?? HOME_ADVANTAGE_ELO);
  if (!Number.isFinite(E)) return { home: NaN, draw: NaN, away: NaN };
  const drawMax = clamp(opts.drawMax ?? DRAW_MAX, 0, 0.99);
  const drawWidth = opts.drawWidth ?? DRAW_WIDTH;
  const pDraw = drawMax * Math.exp(-Math.pow((E - 0.5) / drawWidth, 2));
  return { home: E * (1 - pDraw), draw: pDraw, away: (1 - E) * (1 - pDraw) };
}

/** Fair decimal odds: the reciprocal, no margin. The betting layer adds its
 * overround later and OWNS that number; this file only ever reports fair. */
function fairOdds(probs) {
  const o = {};
  for (const k of Object.keys(probs)) {
    o[k] = probs[k] > 0 ? 1 / probs[k] : Infinity;
  }
  return o;
}

/**
 * Elo update after a result, so the site can track its own ratings between
 * clubelo syncs and the two are comparable.
 * K=20 flat (clubelo weights by margin of victory; v0 does not, and says so).
 */
function eloUpdate(homeElo, awayElo, homeGoals, awayGoals, opts = {}) {
  const k = opts.k ?? 20;
  const E = eloExpected(homeElo, awayElo, opts.homeAdv ?? HOME_ADVANTAGE_ELO);
  if (!Number.isFinite(E) || !Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) {
    return { home: homeElo, away: awayElo };
  }
  const score = homeGoals > awayGoals ? 1 : homeGoals < awayGoals ? 0 : 0.5;
  const delta = k * (score - E);
  return { home: homeElo + delta, away: awayElo - delta };
}

/** League table from played fixtures: the classic 3/1/0, goal difference,
 * goals scored. Input rows need {homeTeam, awayTeam, homeGoals, awayGoals,
 * status}; anything not 'played' is ignored. */
function leagueTable(fixtures) {
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) {
      rows.set(id, { team: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 });
    }
    return rows.get(id);
  };
  for (const f of fixtures) {
    if (f.status !== 'played') continue;
    const h = row(f.homeTeam);
    const a = row(f.awayTeam);
    h.played++; a.played++;
    h.gf += f.homeGoals; h.ga += f.awayGoals;
    a.gf += f.awayGoals; a.ga += f.homeGoals;
    if (f.homeGoals > f.awayGoals) { h.won++; a.lost++; h.points += 3; }
    else if (f.homeGoals < f.awayGoals) { a.won++; h.lost++; a.points += 3; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  return [...rows.values()].sort((x, y) =>
    y.points - x.points
    || (y.gf - y.ga) - (x.gf - x.ga)
    || y.gf - x.gf
    || (x.team < y.team ? -1 : 1));
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export {
  HOME_ADVANTAGE_ELO, DRAW_MAX, DRAW_WIDTH,
  eloExpected, fairProbs, fairOdds, eloUpdate, leagueTable,
};
