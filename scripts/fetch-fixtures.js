#!/usr/bin/env node
// Pull the 2026-27 EPL fixture list and write data/fixtures.json (JSON-LD)
// and data/teams.json (slugs + aliases, Elo left for fetch-elo.js to fill).
//
//   node scripts/fetch-fixtures.js [--dry]
//
// Source: fixturedownload.com — no key, whole season in one call, scores
// filled in as the season plays. Re-running is idempotent and SAFE mid-season:
// fixture identity is (matchweek, pairing), so postponements update kickoff
// on the same @id, and any Elo already in teams.json is preserved.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEED = 'https://fixturedownload.com/feed/json/epl-2026';
const dry = process.argv.includes('--dry');

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const res = await fetch(FEED);
if (!res.ok) {
  console.error(`fixture feed ${res.status} — keeping existing data untouched`);
  process.exit(1);
}
const rows = await res.json();
if (!Array.isArray(rows) || rows.length < 300) {
  console.error(`feed returned ${Array.isArray(rows) ? rows.length : typeof rows} rows — refusing to overwrite a full season with a partial one`);
  process.exit(1);
}

// Existing teams file survives the refetch: Elo lives there.
let existing = {};
try {
  const t = JSON.parse(readFileSync(join(ROOT, 'data/teams.json'), 'utf8'));
  for (const [id, team] of Object.entries(t.teams || {})) existing[id] = team;
} catch { /* first run */ }

const teams = {};
const fixtures = rows.map((r) => {
  const home = slug(r.HomeTeam);
  const away = slug(r.AwayTeam);
  for (const [id, name] of [[home, r.HomeTeam], [away, r.AwayTeam]]) {
    teams[id] = {
      '@type': 'SportsTeam',
      name,
      aliases: [...new Set([...(existing[id]?.aliases || []), name])],
      ...(existing[id]?.elo != null
        ? { elo: existing[id].elo, eloDate: existing[id].eloDate, eloSource: existing[id].eloSource }
        : {}),
    };
  }
  const played = r.HomeTeamScore != null && r.AwayTeamScore != null;
  return {
    '@id': `2026-27/mw${String(r.RoundNumber).padStart(2, '0')}/${home}-${away}`,
    '@type': 'SportsEvent',
    matchNumber: r.MatchNumber,
    matchweek: r.RoundNumber,
    kickoff: r.DateUtc.replace(' ', 'T'),
    venue: r.Location,
    homeTeam: home,
    awayTeam: away,
    status: played ? 'played' : 'scheduled',
    ...(played ? { homeGoals: r.HomeTeamScore, awayGoals: r.AwayTeamScore } : {}),
  };
});

const stamp = new Date().toISOString();
const fixturesDoc = {
  '@context': '../schema/context.jsonld',
  '@type': 'tl:FixtureSet',
  name: 'Premier League 2026-27',
  sourceFeed: FEED,
  generatedAt: stamp,
  fixtures,
};
const teamsDoc = {
  '@context': '../schema/context.jsonld',
  '@type': 'tl:TeamSet',
  generatedAt: stamp,
  teams,
};

if (dry) {
  console.log(`${fixtures.length} fixtures, ${Object.keys(teams).length} teams (dry run)`);
  process.exit(0);
}
mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data/fixtures.json'), JSON.stringify(fixturesDoc, null, 2) + '\n');
writeFileSync(join(ROOT, 'data/teams.json'), JSON.stringify(teamsDoc, null, 2) + '\n');
console.log(`wrote ${fixtures.length} fixtures, ${Object.keys(teams).length} teams`);
