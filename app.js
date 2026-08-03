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
    tr.className = 'clickable';
    tr.innerHTML = `
      <td>${f.kickoff.slice(0, 16).replace('T', ' ')}</td>
      <td class="${played && f.homeGoals > f.awayGoals ? 'won' : ''}">${nameOf(f.homeTeam)}</td>
      <td class="vs">${played ? f.homeGoals + '–' + f.awayGoals : 'v'}</td>
      <td class="${played && f.awayGoals > f.homeGoals ? 'won' : ''}">${nameOf(f.awayTeam)}</td>
      <td class="num">${played ? '' : verdict}</td>`;
    tr.onclick = () => { location.hash = '#match/' + f['@id']; };
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
    tr.className = 'clickable';
    tr.onclick = () => { location.hash = '#team/' + r.team; };
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

// ---------------------------------------------------------------- views
// Hash routing, three routes: '' (home), '#team/<id>', '#match/<@id>'.
// The fixture @id contains slashes, so everything after '#match/' is the id.

function show(view) {
  $('view-home').classList.toggle('hidden', view !== 'home');
  $('view-team').classList.toggle('hidden', view !== 'team');
  $('view-match').classList.toggle('hidden', view !== 'match');
  $('crumbs').classList.toggle('hidden', view === 'home');
}

function fixtureLine(f) {
  const played = f.status === 'played';
  if (played) return `${f.homeGoals}–${f.awayGoals}`;
  const he = eloOf(f.homeTeam);
  const ae = eloOf(f.awayTeam);
  if (he == null || ae == null) return '—';
  const p = fairProbs(he, ae);
  return `${fmtPct(p.home)} / ${fmtPct(p.draw)} / ${fmtPct(p.away)}`;
}

function renderTeam(id) {
  const team = teams[id];
  if (!team) { location.hash = ''; return; }
  show('team');
  $('team-title').textContent = team.name;
  const mine = fixtures.filter((f) => f.homeTeam === id || f.awayTeam === id);
  const played = mine.filter((f) => f.status === 'played');
  const record = leagueTable(played).find((r) => r.team === id);
  $('team-meta').textContent =
    (team.elo != null ? `Elo ${team.elo} (${team.eloDate}) · ` : '')
    + (record
      ? `P${record.played} W${record.won} D${record.drawn} L${record.lost} · ${record.points} pts`
      : 'no matches played yet');
  const tbody = $('team-fixtures').querySelector('tbody');
  tbody.innerHTML = '';
  for (const f of mine) {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.onclick = () => { location.hash = '#match/' + f['@id']; };
    const home = f.homeTeam === id;
    const opp = home ? f.awayTeam : f.homeTeam;
    tr.innerHTML = `
      <td>${f.kickoff.slice(0, 16).replace('T', ' ')}</td>
      <td class="num">${f.matchweek}</td>
      <td>${home ? 'v ' + nameOf(opp) : 'at ' + nameOf(opp)}</td>
      <td class="num">${fixtureLine(f)}</td>`;
    tbody.appendChild(tr);
  }
}

function renderMatch(id) {
  const f = fixtures.find((x) => x['@id'] === id);
  if (!f) { location.hash = ''; return; }
  show('match');
  $('match-title').textContent = `${nameOf(f.homeTeam)} v ${nameOf(f.awayTeam)}`;
  $('match-meta').textContent =
    `Matchweek ${f.matchweek} · ${f.kickoff.slice(0, 16).replace('T', ' ')} UTC · ${f.venue}`;
  const body = $('match-body');
  const he = eloOf(f.homeTeam);
  const ae = eloOf(f.awayTeam);
  let inner = '';
  if (f.status === 'played') {
    inner += `<p class="score">${nameOf(f.homeTeam)} ${f.homeGoals}–${f.awayGoals} ${nameOf(f.awayTeam)}</p>`;
  } else if (he != null && ae != null) {
    const p = fairProbs(he, ae);
    const o = fairOdds(p);
    inner += `<table><thead><tr><th></th><th class="num">${nameOf(f.homeTeam)}</th>
      <th class="num">draw</th><th class="num">${nameOf(f.awayTeam)}</th></tr></thead><tbody>
      <tr><td>fair probability</td><td class="num">${fmtPct(p.home)}</td>
        <td class="num">${fmtPct(p.draw)}</td><td class="num">${fmtPct(p.away)}</td></tr>
      <tr><td>fair decimal</td><td class="num">${o.home.toFixed(2)}</td>
        <td class="num">${o.draw.toFixed(2)}</td><td class="num">${o.away.toFixed(2)}</td></tr>
      <tr><td>Elo</td><td class="num">${he}</td><td class="num"></td><td class="num">${ae}</td></tr>
      </tbody></table>
      <p class="hint">Fair = no margin; v0 Elo model, uncalibrated — see the README.</p>`;
  } else {
    inner += '<p class="hint">Probabilities appear once the Elo sync lands.</p>';
  }
  // The reverse fixture, for the head-to-head
  const rev = fixtures.find((x) => x.homeTeam === f.awayTeam && x.awayTeam === f.homeTeam);
  if (rev) {
    inner += `<p class="hint">Reverse fixture: <a href="#match/${rev['@id']}">MW${rev.matchweek}, ${rev.kickoff.slice(0, 10)}</a>`
      + (rev.status === 'played' ? ` — finished ${rev.homeGoals}–${rev.awayGoals}` : '') + '</p>';
  }
  body.innerHTML = inner;
}

function route() {
  const h = decodeURIComponent(location.hash);
  if (h.startsWith('#team/')) renderTeam(h.slice(6));
  else if (h.startsWith('#match/')) renderMatch(h.slice(7));
  else { show('home'); renderFixtures(); renderTable(); }
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
    $('mw-prev').onclick = () => { if (mw > 1) { mw--; renderFixtures(); } };
    $('mw-next').onclick = () => { if (mw < 38) { mw++; renderFixtures(); } };
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    notice('Data files missing — run scripts/fetch-fixtures.js. (' + err.message + ')');
  }
})();
