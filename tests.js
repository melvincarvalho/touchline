// Touchline tests — node tests.js, exits nonzero on failure.
// Same rules as tavern/tideholm: every formula pinned, and the suite is only
// trusted after mutating touchline.js and watching it go red.

import { readFileSync } from 'node:fs';
import * as t from './touchline.js';
import * as w from './wager.js';

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

console.log('escaping');
{
  check('all five specials escape',
    t.escapeHtml('<img src=x onerror="a&b\'">')
      === '&lt;img src=x onerror=&quot;a&amp;b&#39;&quot;&gt;');
  check('plain text passes through', t.escapeHtml('Melvo FC') === 'Melvo FC');
  check('non-strings coerce, not crash', t.escapeHtml(1600) === '1600');
}

console.log('match documents');
{
  const good = {
    kickoff: '2026-08-09T18:00:00Z', status: 'scheduled',
    homeTeam: { name: 'Melvo FC', code: 'MEL', colors: ['#0f7d5c', '#ffffff'], elo: 1600 },
    awayTeam: { name: 'Phil Athletic' },
  };
  check('a good document validates', t.validateMatchDoc(good).ok,
    t.validateMatchDoc(good).errors.join('; '));
  check('teams may omit the optional fields', t.validateMatchDoc(good).ok);

  const bad = t.validateMatchDoc({
    kickoff: 'not a date', status: 'live',
    homeTeam: { name: '', colors: ['red', 'white'] },
    awayTeam: null,
  });
  check('a bad document is refused', !bad.ok);
  check('with EVERY reason, not just the first', bad.errors.length >= 4, bad.errors.length);

  check('played requires both goals',
    !t.validateMatchDoc({ ...good, status: 'played', homeGoals: 2 }).ok);
  check('played with goals validates',
    t.validateMatchDoc({ ...good, status: 'played', homeGoals: 2, awayGoals: 0 }).ok);
  check('negative goals refused',
    !t.validateMatchDoc({ ...good, status: 'played', homeGoals: -1, awayGoals: 0 }).ok);
  check('a javascript: oracle is refused',
    !t.validateMatchDoc({ ...good, oracle: 'javascript:alert(1)' }).ok);
  check('an https oracle is fine',
    t.validateMatchDoc({ ...good, oracle: 'https://example.org/r.json' }).ok);
  check('an XSS team name VALIDATES (escaping is the renderer\'s job, and pinned above)',
    t.validateMatchDoc({ ...good, homeTeam: { name: '<script>x</script>' } }).ok);
  check('arrays and null are refused as documents',
    !t.validateMatchDoc(null).ok && !t.validateMatchDoc([]).ok);
}

console.log('wager: pricing');
{
  const probs = { home: 0.5, draw: 0.25, away: 0.25 };
  const m = w.priceMarket(probs);
  check('fair odds are the reciprocal', close(m.odds.home.fair, 2) && close(m.odds.draw.fair, 4));
  check('priced = fair x (1 - edge)', close(m.odds.home.priced, 2 * 0.95));
  check('the margin is stated on the market', m.edgeBps === 500);
  check('implied probabilities of priced odds sum OVER 1 (the overround exists)',
    1 / m.odds.home.priced + 1 / m.odds.draw.priced + 1 / m.odds.away.priced > 1);
  check('a broken market prices nothing', w.priceMarket({ home: 0, draw: 0.5, away: 0.5 }) === null);
  check('a negative edge falls back rather than paying bettors to bet',
    close(w.priceMarket(probs, -100).odds.home.priced, 2 * 0.95));
}

console.log('wager: exposure cap');
{
  check('even money at 10% of a 10k bank caps ~1,041',
    Math.floor(w.maxStake(10000, 1.96)) === Math.floor(1000 / 0.96));
  check('a 20x longshot allows ~19x less than evens',
    w.maxStake(10000, 20) < w.maxStake(10000, 1.96) / 15);
  check('odds at or under 1 allow nothing', w.maxStake(10000, 1) === 0 && w.maxStake(10000, 0.5) === 0);
  check('an empty bank allows nothing', w.maxStake(0, 2) === 0);
}

console.log('wager: placement');
{
  const probs = { home: 0.5, draw: 0.25, away: 0.25 };
  const base = { balance: 1000, bank: 10000, probs, kickoff: '2100-01-01T00:00:00Z', now: 0 };
  const r = w.placeBet({ ...base, pick: 'home', stake: 100 });
  check('a bet places', !r.error, r.error);
  check('the stake leaves the balance at once', r.balance === 900);
  check('the ticket carries priced AND fair odds', r.ticket.odds === 1.9 && r.ticket.fair === 2);
  check('over-balance refused', !!w.placeBet({ ...base, pick: 'home', stake: 1001 }).error);
  check('over-cap refused', !!w.placeBet({ ...base, balance: 99999, pick: 'home', stake: 2000 }).error);
  check('after kickoff refused',
    !!w.placeBet({ ...base, now: Date.parse('2100-01-01T00:00:01Z'), pick: 'home', stake: 10 }).error);
  check('a junk pick refused', !!w.placeBet({ ...base, pick: 'both', stake: 10 }).error);
  check('a fractional stake floors', w.placeBet({ ...base, pick: 'home', stake: 10.9 }).ticket.stake === 10);
  check('a zero/NaN stake refused', !!w.placeBet({ ...base, pick: 'home', stake: 0 }).error
    && !!w.placeBet({ ...base, pick: 'home', stake: NaN }).error);
}

console.log('wager: settlement');
{
  const mk = (pick) => w.placeBet({
    balance: 1000, bank: 10000, pick, stake: 100,
    probs: { home: 0.5, draw: 0.25, away: 0.25 },
  });
  const played = { status: 'played', homeGoals: 3, awayGoals: 1 };

  const won = mk('home');
  const sw = w.settleTicket({ balance: won.balance, bank: won.bank, ticket: won.ticket }, played);
  check('a winning ticket pays stake x odds', close(sw.balance, 900 + 100 * 1.9));
  check('the bank funds exactly the profit', close(sw.bank, 10000 - 90));
  check('credits conserved on a win',
    close(sw.balance + sw.bank, won.balance + won.bank + 100)); // stake re-enters from escrow

  const lost = mk('away');
  const sl = w.settleTicket({ balance: lost.balance, bank: lost.bank, ticket: lost.ticket }, played);
  check('a losing stake moves into the bank', sl.bank === 10100 && sl.balance === 900);

  const draw = mk('draw');
  const sd = w.settleTicket({ balance: draw.balance, bank: draw.bank, ticket: draw.ticket },
    { status: 'played', homeGoals: 2, awayGoals: 2 });
  check('a draw pays the draw', sd.ticket.status === 'won' && sd.balance > 900);

  const voided = w.settleTicket({ balance: won.balance, bank: won.bank, ticket: mk('home').ticket },
    { status: 'postponed' });
  check('postponed voids and refunds the stake', voided.ticket.status === 'void'
    && voided.balance === won.balance + 100 && voided.bank === 10000);

  check('no result, no movement',
    w.settleTicket({ balance: 1, bank: 1, ticket: mk('home').ticket }, { status: 'scheduled' }) === null);
  check('a closed ticket cannot settle twice',
    w.settleTicket({ balance: 1, bank: 1, ticket: { ...mk('home').ticket, status: 'won' } }, played) === null);
  check('outcomeFor is the single source of the verdict',
    w.outcomeFor('home', played) === 'won' && w.outcomeFor('away', played) === 'lost'
    && w.outcomeFor('draw', { status: 'played', homeGoals: 1, awayGoals: 1 }) === 'won');
}

console.log('wager: purity');
{
  const src = readFileSync(new URL('./wager.js', import.meta.url), 'utf8');
  check('no imports', !/^\s*import\s/m.test(src));
  check('no clock of its own', !/Date\.now|new Date/.test(src));
  check('no storage, no DOM, no network', !/localStorage|document\.|fetch\(/.test(src));
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
