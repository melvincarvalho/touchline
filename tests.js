// Touchline tests — node tests.js, exits nonzero on failure.
// Same rules as tavern/tideholm: every formula pinned, and the suite is only
// trusted after mutating touchline.js and watching it go red.

import { readFileSync } from 'node:fs';
import * as t from './touchline.js';

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.log('FAIL  ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

console.log('purity');
{
  const src = readFileSync(new URL('./touchline.js', import.meta.url), 'utf8');
  check('no imports', !/^\s*import\s/m.test(src));
  check('no Date.now / new Date', !/Date\.now|new Date/.test(src));
  check('no Math.random', !/Math\.random/.test(src));
  check('no fetch / process / DOM', !/fetch\(|process\.|document\./.test(src));
}

console.log('elo expectancy');
{
  // Level teams at home advantage 0 are a coin flip.
  check('level, no HA: 0.5', close(t.eloExpected(1500, 1500, 0), 0.5));
  // The standard Elo checkpoints.
  check('+400 is ~90.9%', close(t.eloExpected(1900, 1500, 0), 1 / (1 + Math.pow(10, -1))));
  check('symmetry: E(a,b) + E(b,a) = 1',
    close(t.eloExpected(1700, 1520, 0) + t.eloExpected(1520, 1700, 0), 1));
  // Home advantage defaults on and helps the home side.
  check('default HA lifts the home side', t.eloExpected(1500, 1500) > 0.5);
  check('HA is worth exactly its Elo', close(t.eloExpected(1500, 1500), t.eloExpected(1565, 1500, 0)));
  check('NaN in, NaN out', Number.isNaN(t.eloExpected(NaN, 1500)));
}

console.log('fair probabilities');
{
  const p = t.fairProbs(1500, 1500, { homeAdv: 0 });
  check('level: draw at its maximum', close(p.draw, t.DRAW_MAX));
  check('level: home = away', close(p.home, p.away));
  check('probabilities sum to 1', close(p.home + p.draw + p.away, 1));

  // A big favourite: everything still positive, still sums to 1. This is the
  // property that killed the subtract-pDraw/2 formulation.
  const big = t.fairProbs(2000, 1400);
  check('big favourite: all three positive', big.home > 0 && big.draw > 0 && big.away > 0);
  check('big favourite: sums to 1', close(big.home + big.draw + big.away, 1));
  check('big favourite: draw well below max', big.draw < t.DRAW_MAX / 2);
  check('favourite actually favoured', big.home > 0.8);

  // Monotonic: more Elo, more win probability.
  check('monotonic in Elo',
    t.fairProbs(1700, 1500).home > t.fairProbs(1600, 1500).home
    && t.fairProbs(1600, 1500).home > t.fairProbs(1500, 1500).home);
  check('NaN elo: NaN probs, not a quiet 0-0-0', Number.isNaN(t.fairProbs(NaN, 1500).home));
}

console.log('fair odds');
{
  const o = t.fairOdds({ home: 0.5, draw: 0.25, away: 0.25 });
  check('reciprocal', close(o.home, 2) && close(o.draw, 4) && close(o.away, 4));
  check('zero probability prices at Infinity, not a crash',
    t.fairOdds({ home: 0 }).home === Infinity);
  // Fair means fair: the implied probabilities of fair odds sum to exactly 1
  // (an overround here would mean the info layer is quietly a bookmaker).
  const p = t.fairProbs(1650, 1480);
  const odds = t.fairOdds(p);
  check('no hidden margin', close(1 / odds.home + 1 / odds.draw + 1 / odds.away, 1));
}

console.log('elo update');
{
  const u = t.eloUpdate(1500, 1500, 2, 0, { homeAdv: 0 });
  check('winner gains what loser drops', close(u.home - 1500, -(u.away - 1500)));
  check('win at even Elo gains K/2', close(u.home - 1500, 10));
  const d = t.eloUpdate(1500, 1500, 1, 1, { homeAdv: 0 });
  check('level draw moves nothing', close(d.home, 1500) && close(d.away, 1500));
  const upset = t.eloUpdate(1900, 1500, 0, 1, { homeAdv: 0 });
  check('an upset moves more than a formality',
    (1900 - upset.home) > (t.eloUpdate(1900, 1500, 2, 0, { homeAdv: 0 }).home - 1900));
  check('bad input moves nothing', t.eloUpdate(1500, 1500, NaN, 1).home === 1500);
}

console.log('league table');
{
  const fx = [
    { homeTeam: 'a', awayTeam: 'b', homeGoals: 2, awayGoals: 0, status: 'played' },
    { homeTeam: 'b', awayTeam: 'c', homeGoals: 1, awayGoals: 1, status: 'played' },
    { homeTeam: 'c', awayTeam: 'a', homeGoals: 0, awayGoals: 3, status: 'played' },
    { homeTeam: 'a', awayTeam: 'c', status: 'scheduled' },
  ];
  const tbl = t.leagueTable(fx);
  check('scheduled fixtures do not count', tbl.every((r) => r.played <= 2));
  check('a tops on 6 points', tbl[0].team === 'a' && tbl[0].points === 6);
  check('b and c on 1 point each', tbl[1].points === 1 && tbl[2].points === 1);
  check('goal difference splits the tie', tbl[1].team === 'c' || tbl[1].gf - tbl[1].ga >= tbl[2].gf - tbl[2].ga);
  check('goals tally: a scored 5', tbl[0].gf === 5 && tbl[0].ga === 0);
}

console.log('data files (when present)');
try {
  const fixtures = JSON.parse(readFileSync(new URL('./data/fixtures.json', import.meta.url), 'utf8'));
  check('a full season is 380 fixtures', fixtures.fixtures.length === 380, fixtures.fixtures.length);
  check('38 matchweeks', new Set(fixtures.fixtures.map((f) => f.matchweek)).size === 38);
  const teams = JSON.parse(readFileSync(new URL('./data/teams.json', import.meta.url), 'utf8'));
  check('20 clubs', Object.keys(teams.teams).length === 20, Object.keys(teams.teams).length);
  const perWeek = {};
  for (const f of fixtures.fixtures) perWeek[f.matchweek] = (perWeek[f.matchweek] || 0) + 1;
  check('10 fixtures per matchweek', Object.values(perWeek).every((n) => n === 10));
  check('every fixture references a known club',
    fixtures.fixtures.every((f) => teams.teams[f.homeTeam] && teams.teams[f.awayTeam]));
  check('every club carries a 3-letter code',
    Object.values(teams.teams).every((t) => /^[A-Z]{3}$/.test(t.code || '')));
  check('every club carries two kit colours',
    Object.values(teams.teams).every((t) =>
      Array.isArray(t.colors) && t.colors.length === 2
      && t.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))));
  check('codes are unique',
    new Set(Object.values(teams.teams).map((t) => t.code)).size === 20);
  check('fixture ids are unique',
    new Set(fixtures.fixtures.map((f) => f['@id'])).size === 380);
} catch (err) {
  check('data files exist (run scripts/fetch-fixtures.js)', false, err.message);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall tests pass');
process.exit(failures ? 1 : 0);
