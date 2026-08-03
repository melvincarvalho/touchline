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

// Last-N results for a team, most recent first: [{res:'W'|'D'|'L', f}]
function formOf(id, n = 5) {
  return fixtures
    .filter((f) => f.status === 'played' && (f.homeTeam === id || f.awayTeam === id))
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
    .slice(0, n)
    .map((f) => {
      const home = f.homeTeam === id;
      const gf = home ? f.homeGoals : f.awayGoals;
      const ga = home ? f.awayGoals : f.homeGoals;
      return { res: gf > ga ? 'W' : gf < ga ? 'L' : 'D', f };
    });
}

function formStrip(id) {
  const form = formOf(id);
  if (!form.length) return '<span class="hint">no matches yet</span>';
  return form.map(({ res, f }) =>
    `<a class="chip ${res.toLowerCase()}" href="#match/${f['@id']}"
        title="${nameOf(f.homeTeam)} ${f.homeGoals}–${f.awayGoals} ${nameOf(f.awayTeam)}">${res}</a>`).join('');
}

function countdownTo(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'kick-off due';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function renderMatch(id) {
  const f = fixtures.find((x) => x['@id'] === id);
  if (!f) { location.hash = ''; return; }
  show('match');
  const played = f.status === 'played';
  const ko = new Date(f.kickoff);
  $('match-title').textContent = '';
  $('match-meta').textContent =
    `Matchweek ${f.matchweek} · ${dayFmt.format(ko)}, ${timeFmt.format(ko)} · ${f.venue}`;

  const table = leagueTable(fixtures);
  const pos = (tid) => {
    const i = table.findIndex((r) => r.team === tid);
    return i >= 0 ? i + 1 : null;
  };
  const rec = (tid) => table.find((r) => r.team === tid);

  const he = eloOf(f.homeTeam);
  const ae = eloOf(f.awayTeam);
  const pc = probCells(f);

  // --- hero: team / centre / team
  const centre = played
    ? `<div class="score">${f.homeGoals}–${f.awayGoals}</div><div class="hint">full time</div>`
    : `<div class="ko-time">${timeFmt.format(ko)}</div><div class="hint">${countdownTo(f.kickoff)}</div>`;
  const teamCell = (tid) => {
    const r = rec(tid);
    const p = pos(tid);
    return `<a class="hero-team" href="#team/${tid}">${nameOf(tid)}</a>
      <div class="hint">${p ? ordinal(p) + (r ? ` · ${r.points} pts` : '') : (eloOf(tid) != null ? 'Elo ' + eloOf(tid) : '')}</div>
      <div class="form">${formStrip(tid)}</div>`;
  };
  let inner = `<div class="hero">
    <div class="hero-side">${teamCell(f.homeTeam)}</div>
    <div class="hero-centre">${centre}</div>
    <div class="hero-side right">${teamCell(f.awayTeam)}</div>
  </div>`;

  // --- fair 1X2, full width
  if (!played && pc) {
    const { p, o } = pc;
    inner += `<div class="bigbar-wrap" title="fair 1X2 from Elo — no margin">
      <div class="bigbar">
        <span class="h" style="flex:${p.home}"></span><span class="x" style="flex:${p.draw}"></span><span class="a" style="flex:${p.away}"></span>
      </div>
      <div class="bigbar-nums">
        <span><b>${fmtPct(p.home)}</b> home · ${o.home.toFixed(2)}</span>
        <span>draw ${fmtPct(p.draw)} · ${o.draw.toFixed(2)}</span>
        <span><b>${fmtPct(p.away)}</b> away · ${o.away.toFixed(2)}</span>
      </div>
    </div>`;
  } else if (!played) {
    inner += '<p class="hint">Fair odds appear once the Elo sync lands.</p>';
  }

  // --- facts table: Elo, position, season record
  const factRow = (label, hv, av) =>
    `<tr><td class="num">${hv ?? '—'}</td><td class="fact">${label}</td><td class="num">${av ?? '—'}</td></tr>`;
  const rh = rec(f.homeTeam);
  const ra = rec(f.awayTeam);
  inner += `<table class="facts"><tbody>
    ${factRow('Elo', he, ae)}
    ${he != null && ae != null ? factRow('Elo edge (home adv. incl.)',
      he + 65 - ae > 0 ? '+' + (he + 65 - ae) : '', ae - he - 65 > 0 ? '+' + (ae - he - 65) : '') : ''}
    ${rh || ra ? factRow('Record', rh ? `${rh.won}-${rh.drawn}-${rh.lost}` : null, ra ? `${ra.won}-${ra.drawn}-${ra.lost}` : null) : ''}
    ${rh || ra ? factRow('Goals', rh ? `${rh.gf}:${rh.ga}` : null, ra ? `${ra.gf}:${ra.ga}` : null) : ''}
  </tbody></table>`;

  // --- both meetings this season
  const meetings = fixtures.filter((x) =>
    (x.homeTeam === f.homeTeam && x.awayTeam === f.awayTeam)
    || (x.homeTeam === f.awayTeam && x.awayTeam === f.homeTeam));
  inner += '<div class="hint" style="margin-top:.9rem">Meetings this season</div>';
  for (const m of meetings) {
    const here = m['@id'] === f['@id'];
    inner += `<div class="meeting${here ? ' here' : ''}">
      ${here ? '<span>' : `<a href="#match/${m['@id']}">`}
      MW${m.matchweek} · ${m.kickoff.slice(0, 10)} · ${nameOf(m.homeTeam)} v ${nameOf(m.awayTeam)}
      ${m.status === 'played' ? ` — ${m.homeGoals}–${m.awayGoals}` : ''}
      ${here ? '</span>' : '</a>'}</div>`;
  }

  if (!played && pc) {
    inner += '<p class="hint" style="margin-top:.8rem">Fair = no margin · v0 Elo model, uncalibrated — see the <a href="https://github.com/melvincarvalho/touchline#the-model-honestly">README</a>.</p>';
  }
  $('match-body').innerHTML = inner;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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
