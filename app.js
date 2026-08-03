// Touchline UI — reads data/*.json, renders through touchline.js. No build,
// no framework, no state beyond "which matchweek is on screen".
import { fairProbs, fairOdds, leagueTable } from './touchline.js';

const $ = (id) => document.getElementById(id);

async function load(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

let teams = {};
let fixtures = [];
let mw = 1;

function eloOf(id) { return teams[id]?.elo ?? null; }
function nameOf(id) { return teams[id]?.name ?? id; }

function fmtPct(p) { return (p * 100).toFixed(0) + '%'; }

function renderFixtures() {
  $('mw-num').textContent = mw;
  const rows = fixtures.filter((f) => f.matchweek === mw);
  const tbody = $('fixtures-table').querySelector('tbody');
  tbody.innerHTML = '';
  for (const f of rows) {
    const tr = document.createElement('tr');
    const played = f.status === 'played';
    const he = eloOf(f.homeTeam);
    const ae = eloOf(f.awayTeam);
    let verdict = '—';
    if (played) {
      verdict = `${f.homeGoals}–${f.awayGoals}`;
    } else if (he != null && ae != null) {
      const p = fairProbs(he, ae);
      verdict = `${fmtPct(p.home)} / ${fmtPct(p.draw)} / ${fmtPct(p.away)}`;
      tr.title = 'fair decimal: ' + Object.values(fairOdds(p)).map((o) => o.toFixed(2)).join(' / ');
    }
    tr.innerHTML = `
      <td>${f.kickoff.slice(0, 16).replace('T', ' ')}</td>
      <td class="${played && f.homeGoals > f.awayGoals ? 'won' : ''}">${nameOf(f.homeTeam)}</td>
      <td class="vs">${played ? f.homeGoals + '–' + f.awayGoals : 'v'}</td>
      <td class="${played && f.awayGoals > f.homeGoals ? 'won' : ''}">${nameOf(f.awayTeam)}</td>
      <td class="num">${played ? '' : verdict}</td>`;
    tbody.appendChild(tr);
  }
  $('mw-hint').textContent = rows.length
    ? `${rows.filter((f) => f.status === 'played').length}/${rows.length} played`
    : 'no fixtures';
}

function renderTable() {
  const played = fixtures.some((f) => f.status === 'played');
  let rows;
  if (played) {
    rows = leagueTable(fixtures);
  } else {
    // Pre-season: Elo order, zeros everywhere — labelled as such by the hint.
    rows = Object.keys(teams)
      .map((id) => ({ team: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }))
      .sort((a, b) => (eloOf(b.team) ?? 0) - (eloOf(a.team) ?? 0));
    $('table-hint').textContent = fixturesHaveElo()
      ? 'Season not started — ordered by Elo.'
      : 'Season not started — Elo sync pending, alphabetical for now.';
    if (!fixturesHaveElo()) rows.sort((a, b) => nameOf(a.team).localeCompare(nameOf(b.team)));
  }
  const tbody = $('league-table').querySelector('tbody');
  tbody.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td><td>${nameOf(r.team)}</td>
      <td class="num">${r.played}</td><td class="num">${r.won}</td>
      <td class="num">${r.drawn}</td><td class="num">${r.lost}</td>
      <td class="num">${r.gf - r.ga}</td><td class="num"><b>${r.points}</b></td>
      <td class="num">${eloOf(r.team) ?? '—'}</td>`;
    tbody.appendChild(tr);
  });
}

function fixturesHaveElo() {
  return Object.values(teams).some((t) => t.elo != null);
}

function notice(text) {
  const el = $('notice');
  el.textContent = text;
  el.classList.remove('hidden');
}

(async () => {
  try {
    const [teamsDoc, fixturesDoc] = await Promise.all([
      load('data/teams.json'), load('data/fixtures.json'),
    ]);
    teams = teamsDoc.teams;
    fixtures = fixturesDoc.fixtures;
    // Open on the first matchweek with something still to play.
    const next = fixtures.find((f) => f.status !== 'played');
    mw = next ? next.matchweek : 38;
    if (!fixturesHaveElo()) {
      notice('Elo sync pending (clubelo.com unreachable at last fetch) — fixtures and kickoffs are live; probabilities appear once ratings land.');
    }
    renderFixtures();
    renderTable();
    $('mw-prev').onclick = () => { if (mw > 1) { mw--; renderFixtures(); } };
    $('mw-next').onclick = () => { if (mw < 38) { mw++; renderFixtures(); } };
  } catch (err) {
    notice('Data files missing — run scripts/fetch-fixtures.js. (' + err.message + ')');
  }
})();
