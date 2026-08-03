// Touchline UI — livescore-dense rows over data/*.json, maths from
// touchline.js. No build, no framework. Routes: '' (matches), '#table',
// '#team/<id>', '#match/<@id>'.
import { fairProbs, fairOdds, leagueTable, escapeHtml as esc, validateMatchDoc } from './touchline.js';
import { priceMarket, maxStake, placeBet, settleTicket, WAGER_EDGE_BPS } from './wager.js';

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

// Monogram roundel: kit colours + 3-letter code, deliberately not the
// trademarked crest. Text colour follows the primary's luminance.
function roundelFor(t, cls = '') {
  const [bg, ring] = t.colors || ['#888888', '#ffffff'];
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  };
  const fg = lum(bg) > 0.6 ? (ring !== '#ffffff' && lum(ring) < 0.6 ? ring : '#1b231e') : '#ffffff';
  return `<span class="roundel ${cls}" style="background:${esc(bg)};color:${fg};box-shadow:inset 0 0 0 2px ${esc(ring)}">${esc(t.code || '?')}</span>`;
}
function roundel(id, cls = '') { return roundelFor(teams[id] || {}, cls); }
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

// ---------------------------------------------------------------- ledger
// localStorage owns the paper money; wager.js owns the arithmetic. Seeded
// once per browser; the reset lives on the Bets tab, not in anyone's pocket.

const LEDGER_KEY = 'touchline-ledger-v1';
function loadLedger() {
  try {
    const l = JSON.parse(localStorage.getItem(LEDGER_KEY));
    if (l && Number.isFinite(l.balance) && Number.isFinite(l.bank) && Array.isArray(l.tickets)) return l;
  } catch { /* fresh */ }
  return { balance: 1000, bank: 10000, tickets: [] };
}
let ledger = loadLedger();
function saveLedger() {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  renderBalance();
}
function renderBalance() {
  $('balance-n').textContent = Math.floor(ledger.balance);
  const open = ledger.tickets.filter((t) => t.status === 'open').length;
  const badge = $('bets-badge');
  badge.classList.toggle('hidden', !open);
  badge.textContent = open || '';
}

// Every bet surface calls this: probs + identity of the match + where its
// result will come from. kind: 'fixture' settles from data/fixtures.json;
// 'doc' settles from the ticket's oracle (or source) URL.
function betPanel({ probs, kickoff, kind, ref, oracle, names }) {
  const market = priceMarket(probs);
  if (!market) return '';
  const cap = (pick) => Math.floor(maxStake(ledger.bank, market.odds[pick].priced));
  const btn = (pick, label) => `
    <button class="bet-btn" data-pick="${pick}"
      title="max stake ${cap(pick)} (exposure cap)">
      ${label}<b>${market.odds[pick].priced.toFixed(2)}</b></button>`;
  return `<div class="bet-panel" data-kind="${esc(kind)}" data-ref="${esc(ref)}"
      data-oracle="${esc(oracle || '')}" data-kickoff="${esc(kickoff)}"
      data-probs='${JSON.stringify(probs)}' data-names='${JSON.stringify(names).replace(/'/g, '&#39;')}'>
    <span class="hint">bet (paper)</span>
    <input type="number" class="bet-stake" min="1" value="10" aria-label="stake">
    ${btn('home', esc(names.home))} ${btn('draw', 'draw')} ${btn('away', esc(names.away))}
    <span class="bet-msg hint"></span>
  </div>`;
}

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('.bet-btn');
  if (!b) return;
  ev.stopPropagation();
  const panel = b.closest('.bet-panel');
  const stake = Number(panel.querySelector('.bet-stake').value);
  const probs = JSON.parse(panel.dataset.probs);
  const names = JSON.parse(panel.dataset.names);
  const r = placeBet({
    balance: ledger.balance, bank: ledger.bank,
    pick: b.dataset.pick, stake, probs,
    source: panel.dataset.ref, oracle: panel.dataset.oracle || null,
    kickoff: panel.dataset.kickoff, now: Date.now(),
  });
  const msg = panel.querySelector('.bet-msg');
  if (r.error) { msg.textContent = r.error; return; }
  ledger.balance = r.balance;
  ledger.tickets.push({
    ...r.ticket,
    id: 'tk-' + Date.now().toString(36) + '-' + ledger.tickets.length,
    kind: panel.dataset.kind,
    label: `${names.home} v ${names.away}`,
    pickName: b.dataset.pick === 'draw' ? 'draw' : names[b.dataset.pick],
    placedAt: new Date().toISOString(),
  });
  saveLedger();
  msg.textContent = `ticket in — ${r.ticket.stake} at ${r.ticket.odds}`;
});

// ---------------------------------------------------------------- bets view

async function resultDocFor(ticket) {
  if (ticket.kind === 'fixture') {
    const f = fixtures.find((x) => x['@id'] === ticket.source);
    return f || null; // fixture objects already carry status/goals
  }
  const url = ticket.oracle || ticket.source;
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const doc = await res.json();
    return validateMatchDoc(doc).ok ? doc : null;
  } catch { return null; }
}

async function settleAll() {
  let moved = 0;
  for (const ticket of ledger.tickets) {
    if (ticket.status !== 'open') continue;
    const doc = await resultDocFor(ticket);
    const r = settleTicket({ balance: ledger.balance, bank: ledger.bank, ticket }, doc);
    if (!r) continue;
    ledger.balance = r.balance;
    ledger.bank = r.bank;
    Object.assign(ticket, r.ticket);
    moved++;
  }
  saveLedger();
  renderBets();
  $('bets-summary').textContent = moved ? `settled ${moved} ticket${moved > 1 ? 's' : ''}` : 'nothing to settle yet — the oracles are quiet';
}

function renderBets() {
  renderBalance();
  const list = $('bets-list');
  list.innerHTML = '';
  if (!ledger.tickets.length) {
    list.innerHTML = '<p class="hint">No bets yet. Any priced match has a bet panel under its odds.</p>'
      + '<p class="hint">Try the <a href="?src=examples/friendly-scheduled.json">minted example match</a> — its oracle already knows the result, so you can bet and settle inside a minute.</p>';
    return;
  }
  for (const ticket of [...ledger.tickets].reverse()) {
    const el = document.createElement('div');
    el.className = 'ticket ' + ticket.status;
    const ret = ticket.status === 'won' ? '+' + Math.floor(ticket.stake * ticket.odds - ticket.stake)
      : ticket.status === 'lost' ? '-' + ticket.stake
      : ticket.status === 'void' ? '±0' : '';
    el.innerHTML = `
      <span class="t-status">${esc(ticket.status)}</span>
      <span class="t-label">${esc(ticket.label)} — <b>${esc(ticket.pickName)}</b></span>
      <span class="t-terms">${ticket.stake} @ ${ticket.odds} <span class="hint">(fair ${ticket.fair})</span></span>
      <span class="t-ret">${ret}</span>`;
    list.appendChild(el);
  }
  const open = ledger.tickets.filter((t) => t.status === 'open');
  const risked = open.reduce((n, t) => n + t.stake, 0);
  $('bets-summary').textContent =
    `${open.length} open · ${risked} staked · bank ${Math.floor(ledger.bank)}`;
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
        <div class="side ${homeWon ? 'winner' : ''}"><span>${roundel(f.homeTeam)}${nameOf(f.homeTeam)}</span><span class="goals">${played ? f.homeGoals : ''}</span></div>
        <div class="side ${awayWon ? 'winner' : ''}"><span>${roundel(f.awayTeam)}${nameOf(f.awayTeam)}</span><span class="goals">${played ? f.awayGoals : ''}</span></div>
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
      <td>${i + 1}</td><td>${roundel(r.team)}${nameOf(r.team)}</td>
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
  $('team-title').innerHTML = roundel(id, 'big') + ' ' + team.name;
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
    return `${roundel(tid, 'big')}<a class="hero-team" href="#team/${tid}">${nameOf(tid)}</a>
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

  if (!played && pc && f.status === 'scheduled') {
    inner += betPanel({
      probs: { home: round4p(pc.p.home), draw: round4p(pc.p.draw), away: round4p(pc.p.away) },
      kickoff: f.kickoff, kind: 'fixture', ref: f['@id'], oracle: null,
      names: { home: nameOf(f.homeTeam), away: nameOf(f.awayTeam) },
    });
  }
  if (!played && pc) {
    inner += '<p class="hint" style="margin-top:.8rem">Fair = no margin · v0 Elo model, uncalibrated — see the <a href="https://github.com/melvincarvalho/touchline#the-model-honestly">README</a>.</p>';
  }
  $('match-body').innerHTML = inner;
}
function round4p(n) { return Math.round(n * 1e4) / 1e4; }

// ---------------------------------------------------------------- external match documents
// ?src=<url> renders a standalone match document (schema/match-doc.md).
// UNTRUSTED input: validated before render, every string escaped, source and
// oracle bannered so the reader knows whose word a result is.

async function renderDoc(srcUrl) {
  show('match');
  $('match-title').textContent = '';
  $('match-meta').textContent = 'loading document…';
  $('match-body').innerHTML = '';
  let doc;
  try {
    const res = await fetch(srcUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    doc = await res.json();
  } catch (err) {
    $('match-meta').textContent = '';
    $('match-body').innerHTML = `<p class="hint">Could not load the document (${esc(err.message)}).</p>`;
    return;
  }
  const v = validateMatchDoc(doc);
  if (!v.ok) {
    $('match-meta').textContent = 'invalid match document';
    $('match-body').innerHTML = '<ul class="hint">'
      + v.errors.map((e) => `<li>${esc(e)}</li>`).join('') + '</ul>';
    return;
  }

  const played = doc.status === 'played';
  const ko = new Date(doc.kickoff);
  $('match-meta').textContent =
    `${dayFmt.format(ko)}, ${timeFmt.format(ko)}${doc.venue ? ' · ' + doc.venue : ''}`
    + (doc.status === 'postponed' ? ' · POSTPONED' : '');

  const cell = (t, right) => `${roundelFor(t, 'big')}
    <span class="hero-team">${esc(t.name)}</span>
    <div class="hint">${t.elo != null ? 'Elo ' + esc(t.elo) : ''}</div>`;
  const centre = played
    ? `<div class="score">${doc.homeGoals}–${doc.awayGoals}</div><div class="hint">full time</div>`
    : doc.status === 'postponed'
      ? '<div class="ko-time">—</div><div class="hint">postponed</div>'
      : `<div class="ko-time">${timeFmt.format(ko)}</div><div class="hint">${countdownTo(doc.kickoff)}</div>`;
  let inner = `<div class="hero">
    <div class="hero-side">${cell(doc.homeTeam)}</div>
    <div class="hero-centre">${centre}</div>
    <div class="hero-side right">${cell(doc.awayTeam)}</div>
  </div>`;

  if (!played && doc.status === 'scheduled'
      && doc.homeTeam.elo != null && doc.awayTeam.elo != null) {
    const p = fairProbs(doc.homeTeam.elo, doc.awayTeam.elo);
    const o = fairOdds(p);
    inner += `<div class="bigbar-wrap" title="fair 1X2 from the document's Elo — no margin">
      <div class="bigbar">
        <span class="h" style="flex:${p.home}"></span><span class="x" style="flex:${p.draw}"></span><span class="a" style="flex:${p.away}"></span>
      </div>
      <div class="bigbar-nums">
        <span><b>${fmtPct(p.home)}</b> home · ${o.home.toFixed(2)}</span>
        <span>draw ${fmtPct(p.draw)} · ${o.draw.toFixed(2)}</span>
        <span><b>${fmtPct(p.away)}</b> away · ${o.away.toFixed(2)}</span>
      </div>
    </div>`;
  }

  if (doc.status === 'scheduled' && doc.homeTeam.elo != null && doc.awayTeam.elo != null) {
    const p = fairProbs(doc.homeTeam.elo, doc.awayTeam.elo);
    inner += betPanel({
      probs: { home: round4p(p.home), draw: round4p(p.draw), away: round4p(p.away) },
      kickoff: doc.kickoff, kind: 'doc', ref: srcUrl, oracle: doc.oracle || srcUrl,
      names: { home: doc.homeTeam.name, away: doc.awayTeam.name },
    });
  }

  let srcHost = srcUrl;
  try { srcHost = new URL(srcUrl, location.href).host || 'this site'; } catch { /* keep raw */ }
  inner += `<div class="doc-provenance">
    <b>External match document</b> — anyone can mint one; rendering proves only
    that a well-formed file exists at the source.
    <div>source: <code>${esc(srcHost)}</code></div>
    <div>oracle: ${doc.oracle
      ? `<a href="${esc(doc.oracle)}" rel="nofollow noopener">${esc(doc.oracle)}</a>`
      : '<i>none declared — nothing can settle this match</i>'}</div>
  </div>`;
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
  $('view-bets').classList.toggle('hidden', view !== 'bets');
  $('view-team').classList.toggle('hidden', view !== 'team');
  $('view-match').classList.toggle('hidden', view !== 'match');
  $('crumbs').classList.toggle('hidden', view === 'home' || view === 'table');
  $('tab-matches').classList.toggle('active', view === 'home');
  $('tab-table').classList.toggle('active', view === 'table');
  $('tab-bets').classList.toggle('active', view === 'bets');
}

function route() {
  const h = decodeURIComponent(location.hash);
  if (h.startsWith('#team/')) renderTeam(h.slice(6));
  else if (h.startsWith('#match/')) renderMatch(h.slice(7));
  else if (h === '#table') { show('table'); renderTable(); }
  else if (h === '#bets') { show('bets'); renderBets(); }
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
    renderBalance();
    $('settle-all').onclick = settleAll;
    window.addEventListener('hashchange', route);
    const src = new URLSearchParams(location.search).get('src');
    if (src && !location.hash) renderDoc(src);
    else route();
  } catch (err) {
    notice('Data files missing — run scripts/fetch-fixtures.js. (' + err.message + ')');
  }
})();
