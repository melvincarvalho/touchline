#!/usr/bin/env node
// Pull current club Elo from clubelo.com into data/teams.json, then derive
// data/probs.json (fair 1X2 per scheduled fixture) through touchline.js.
//
//   node scripts/fetch-elo.js [--dry]
//
// api.clubelo.com/YYYY-MM-DD returns CSV for every club it rates on that
// date: Rank,Club,Country,Level,Elo,From,To. The API goes down now and then
// (502s observed on day one) — SOURCE-DOWN IS A NORMAL STATE here: on any
// failure the script exits nonzero, touches nothing, and the site keeps
// serving the last good Elo with its eloDate visible. Stale-and-said beats
// fresh-and-fabricated.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fairProbs } from '../touchline.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dry = process.argv.includes('--dry');
const today = new Date().toISOString().slice(0, 10);
const SOURCE = `http://api.clubelo.com/${today}`;

// clubelo spellings -> our slugs, for the clubs where slugging diverges.
const ALIAS = {
  'Man City': 'man-city',
  'Man United': 'man-utd',
  'Sheffield United': 'sheffield-utd',
  'Sheffield Weds': 'sheffield-wed',
  'Nottm Forest': 'nott-m-forest',
  'Forest': 'nott-m-forest',
  'Tottenham': 'spurs',
  'West Ham': 'west-ham',
  'Wolves': 'wolves',
};

const teamsPath = join(ROOT, 'data/teams.json');
const teamsDoc = JSON.parse(readFileSync(teamsPath, 'utf8'));

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const resolve = (club) => {
  if (ALIAS[club]) return ALIAS[club];
  const s = slug(club);
  if (teamsDoc.teams[s]) return s;
  // last resort: match on any alias
  for (const [id, t] of Object.entries(teamsDoc.teams)) {
    if ((t.aliases || []).some((a) => slug(a) === s)) return id;
  }
  return null;
};

let csv;
try {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  csv = await res.text();
} catch (err) {
  console.error(`clubelo unreachable (${err.message}) — keeping last good Elo`);
  process.exit(1);
}

const lines = csv.trim().split('\n');
const header = lines[0].split(',');
const iClub = header.indexOf('Club');
const iElo = header.indexOf('Elo');
const iCountry = header.indexOf('Country');
if (iClub < 0 || iElo < 0) {
  console.error('clubelo CSV shape changed — refusing to parse blind');
  process.exit(1);
}

let matched = 0;
for (const line of lines.slice(1)) {
  const cols = line.split(',');
  if (cols[iCountry] !== 'ENG') continue;
  const id = resolve(cols[iClub]);
  if (!id) continue;
  const elo = Number(cols[iElo]);
  if (!Number.isFinite(elo)) continue;
  teamsDoc.teams[id].elo = elo;
  teamsDoc.teams[id].eloDate = today;
  teamsDoc.teams[id].eloSource = 'http://clubelo.com/';
  matched++;
}

const missing = Object.entries(teamsDoc.teams).filter(([, t]) => t.elo == null).map(([id]) => id);
console.log(`matched ${matched} clubs` + (missing.length ? ` · NO ELO YET: ${missing.join(', ')}` : ''));

// Derive fair probabilities for every scheduled fixture where both Elos exist.
const fixturesDoc = JSON.parse(readFileSync(join(ROOT, 'data/fixtures.json'), 'utf8'));
const probs = [];
for (const f of fixturesDoc.fixtures) {
  if (f.status !== 'scheduled') continue;
  const h = teamsDoc.teams[f.homeTeam];
  const a = teamsDoc.teams[f.awayTeam];
  if (h?.elo == null || a?.elo == null) continue;
  const p = fairProbs(h.elo, a.elo);
  probs.push({
    fixture: f['@id'],
    fairProbs: { home: round4(p.home), draw: round4(p.draw), away: round4(p.away) },
  });
}
function round4(n) { return Math.round(n * 1e4) / 1e4; }

const probsDoc = {
  '@context': '../schema/context.jsonld',
  '@type': 'tl:ProbSet',
  generatedAt: new Date().toISOString(),
  eloDate: today,
  model: 'elo-v0 (HOME_ADVANTAGE_ELO=65, DRAW_MAX=0.29, DRAW_WIDTH=0.4; uncalibrated)',
  probs,
};

if (dry) {
  console.log(`${probs.length} fixtures priced (dry run)`);
  process.exit(0);
}
teamsDoc.generatedAt = new Date().toISOString();
writeFileSync(teamsPath, JSON.stringify(teamsDoc, null, 2) + '\n');
writeFileSync(join(ROOT, 'data/probs.json'), JSON.stringify(probsDoc, null, 2) + '\n');
console.log(`wrote elo for ${matched} clubs, ${probs.length} fixtures priced`);
