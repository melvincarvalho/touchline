// Touchline UI — livescore-dense rows over data/*.json, maths from
// touchline.js. No build, no framework. Routes: '' (matches), '#table',
// '#team/<id>', '#match/<@id>'.
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

const eloOf = (id) => teams[id]?.elo ?? null;
const nameOf = (id) => teams[id]?.name ?? id;
const fmtPct = (p) => (p * 100).toFixed(0) + '%';
const hasElo = () => Object.values(teams).some((t) => t.elo != null);

// Kickoffs display in the viewer's local time — the convention every live
// score site follows — with the UTC original in the title attribute.
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

function probCells(f) {
  const he = eloOf(f.homeTeam);
  const ae = eloOf(f.awayTeam);
  if (he == null || ae == null) return null;
  const p = fairProbs(he, ae);
  const o = fairOdds(p);
  return { p, o };
}

// ---------------------------------------------------------------- matches

function renderMatches() {
  $('mw-select').value = mw;
  const rows = fixtures.filter((f) => f.matchweek === mw);
  const list = $('match-list');
  list.innerHTML = '';
  let lastDay = '';
  for (const f of rows) {
    const ko = new Date(f.kickoff);
    const day = dayFmt.format(ko);
    if (day !== lastDay) {
      const h = document.createElement('div');
      h.className = 'day-head';
      h.textContent = day;
      list.appendChild(h);
      lastDay = day;
    }
    const played = f.status === 'played';
    const el = document.createElement('div');
    el.className = 'match';
    el.onclick = () => { location.hash = '#match/' + f['@id']; };

    const homeWon = played && f.homeGoals > f.awayGoals;
    const awayWon = played && f.awayGoals > f.homeGoals;
    let right = '';
    if (!played) {
      const pc = probCells(f);
      if (pc) {
        const { p, o } = pc;
        right = `
          <div class="probbar" title="fair decimal ${o.home.toFixed(2)} / ${o.draw.toFixed(2)} / ${o.away.toFixed(2)}">
            <span class="h" style="flex:${p.home}"></span><span class="x" style="flex:${p.draw}"></span><span class="a" style="flex:${p.away}"></span>
          </div>
          <div class="probnums"><b>${fmtPct(p.home)}</b> · ${fmtPct(p.draw)} · <b>${fmtPct(p.away)}</b></div>`;
      }
    }
    el.innerHTML = `
      <div class="when" title="${f.kickoff} (UTC)">${played ? '<div class="ft">FT</div>' : timeFmt.format(ko)}</div>
      <div class="sides">
        <div class="side ${homeWon ? 'winner' : ''}"><span>${nameOf(f.homeTeam)}</span><span class="goals">${played ? f.homeGoals : ''}</span></div>
        <div class="side ${awayWon ? 'winner' : ''}"><span>${nameOf(f.awayTeam)}</span><span class="goals">${played ? f.awayGoals : ''}</span></div>
      </div>
      <div class="odds">${right}</div>`;
    list.appendChild(el);
  }
}

// ---------------------------------------------------------------- table

function renderTable() {
  const anyPlayed = fixtures.some((f) => f.status === 'played');
  let rows;
  if (anyPlayed) {
    rows = leagueTable(fixtures);
    $('table-hint').textContent = 'Live from played fixtures · green = CL places, red = relegation';
  } else {
    rows = Object.keys(teams)
      .map((id) => ({ team: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }));
    if (hasElo()) {
      rows.sort((a, b) => (eloOf(b.team) ?? 0) - (eloOf(a.team) ?? 0));
      $('table-hint').textContent = 'Season not started — ordered by Elo.';
    } else {
      rows.sort((a, b) => nameOf(a.team).localeCompare(nameOf(b.team)));
      $('table-hint').textContent = 'Season not started — Elo sync pending, alphabetical for now.';
    }
  }
  const tbody = $('league-table').querySelector('tbody');
  tbody.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.className = 'clickable'
      + (anyPlayed && i < 4 ? ' zone-cl' : '')
      + (anyPlayed && i >= rows.length - 3 ? ' zone-rel' : '');
    tr.onclick = () => { location.hash = '#team/' + r.team; };
    tr.innerHTML = `
      <td>${i + 1}</td><td>${nameOf(r.team)}</td>
      <td class="num">${r.played}</td><td class="num">${r.won}</td>
      <td class="num">${r.drawn}</td><td class="num">${r.lost}</td>
      <td class="num">${r.gf - r.ga}</td><td class="num pts">${r.points}</td>
      <td class="num">${eloOf(r.team) ?? '—'}</td>`;
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------- team / match

function fixtureLine(f) {
  if (f.status === 'played') return `${f.homeGoals}–${f.awayGoals}`;
  const pc = probCells(f);
  return pc ? `${fmtPct(pc.p.home)} / ${fmtPct(pc.p.draw)} / ${fmtPct(pc.p.away)}` : '—';
}

function renderTeam(id) {
  const team = teams[id];
  if (!team) { location.hash = ''; return; }
  show('team');
  $('team-title').textContent = team.name;
  const mine = fixtures.filter((f) => f.homeTeam === id || f.awayTeam === id);
  const record = leagueTable(mine.filter((f) => f.status === 'played')).find((r) => r.team === id);
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
      <td>${f.kickoff.slice(0, 10)}</td>
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
  const ko = new Date(f.kickoff);
  $('match-meta').textContent =
    `Matchweek ${f.matchweek} · ${dayFmt.format(ko)}, ${timeFmt.format(ko)} · ${f.venue}`;
  const body = $('match-body');
  let inner = '';
  if (f.status === 'played') {
    inner += `<p class="score">${f.homeGoals}–${f.awayGoals}</p>`;
  } else {
    const pc = probCells(f);
    if (pc) {
      const { p, o } = pc;
      inner += `<table><thead><tr><th></th><th class="num">${nameOf(f.homeTeam)}</th>
        <th class="num">draw</th><th class="num">${nameOf(f.awayTeam)}</th></tr></thead><tbody>
        <tr><td>fair probability</td><td class="num">${fmtPct(p.home)}</td>
          <td class="num">${fmtPct(p.draw)}</td><td class="num">${fmtPct(p.away)}</td></tr>
        <tr><td>fair decimal</td><td class="num">${o.home.toFixed(2)}</td>
          <td class="num">${o.draw.toFixed(2)}</td><td class="num">${o.away.toFixed(2)}</td></tr>
        <tr><td>Elo</td><td class="num">${eloOf(f.homeTeam)}</td><td class="num"></td>
          <td class="num">${eloOf(f.awayTeam)}</td></tr>
        </tbody></table>
        <p class="hint">Fair = no margin · v0 Elo model, uncalibrated — see the README.</p>`;
    } else {
      inner += '<p class="hint">Probabilities appear once the Elo sync lands.</p>';
    }
  }
  const rev = fixtures.find((x) => x.homeTeam === f.awayTeam && x.awayTeam === f.homeTeam);
  if (rev) {
    inner += `<p class="hint">Reverse fixture: <a href="#match/${rev['@id']}">MW${rev.matchweek}, ${rev.kickoff.slice(0, 10)}</a>`
      + (rev.status === 'played' ? ` — finished ${rev.homeGoals}–${rev.awayGoals}` : '') + '</p>';
  }
  body.innerHTML = inner;
}

// ---------------------------------------------------------------- routing

function show(view) {
  $('view-home').classList.toggle('hidden', view !== 'home');
  $('view-table').classList.toggle('hidden', view !== 'table');
  $('view-team').classList.toggle('hidden', view !== 'team');
  $('view-match').classList.toggle('hidden', view !== 'match');
  $('crumbs').classList.toggle('hidden', view === 'home' || view === 'table');
  $('tab-matches').classList.toggle('active', view === 'home');
  $('tab-table').classList.toggle('active', view === 'table');
}

function route() {
  const h = decodeURIComponent(location.hash);
  if (h.startsWith('#team/')) renderTeam(h.slice(6));
  else if (h.startsWith('#match/')) renderMatch(h.slice(7));
  else if (h === '#table') { show('table'); renderTable(); }
  else { show('home'); renderMatches(); }
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
    const next = fixtures.find((f) => f.status !== 'played');
    mw = next ? next.matchweek : 38;

    const sel = $('mw-select');
    for (let i = 1; i <= 38; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = 'Matchweek ' + i;
      sel.appendChild(opt);
    }
    sel.onchange = () => { mw = Number(sel.value); renderMatches(); };
    $('mw-prev').onclick = () => { if (mw > 1) { mw--; renderMatches(); } };
    $('mw-next').onclick = () => { if (mw < 38) { mw++; renderMatches(); } };

    if (!hasElo()) {
      notice('Elo sync pending — fixtures and kickoffs are live; fair odds appear once ratings land.');
    }
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    notice('Data files missing — run scripts/fetch-fixtures.js. (' + err.message + ')');
  }
})();
