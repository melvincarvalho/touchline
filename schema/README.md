# Touchline schema

Data first, and the data is JSON-LD. Every file in `data/` is a JSON-LD
document under [`context.jsonld`](context.jsonld), which maps onto
**schema.org where a term exists** (`SportsTeam`, `SportsEvent`, `startDate`,
`location`) and a small `tl:` vocabulary where it does not (Elo, matchweek,
fair probabilities). A generic JSON consumer reads the files as plain JSON; a
linked-data consumer expands them and gets schema.org.

## Documents

| File | `@type` | What it holds |
|---|---|---|
| `data/teams.json` | `tl:TeamSet` → `SportsTeam` per entry | The 20 clubs: id, name, aliases (each feed spells clubs differently), current Elo + its date and source |
| `data/fixtures.json` | `tl:FixtureSet` → `SportsEvent` per entry | All 380 matches: matchweek, kickoff (UTC), venue, home/away by team id, score + status once played |
| `data/probs.json` | `tl:ProbSet` | Per-fixture fair 1X2 probabilities computed by `touchline.js` from Elo — **derived data, never edited by hand** |

## Identity

A team's `@id` is a slug (`arsenal`, `man-utd`) stable across the season and
across feeds; `aliases` carries every spelling the feeds use. Fixtures get
`@id` `2026-27/mw01/arsenal-coventry` — season, matchweek, pairing — so a
fixture URI survives postponements (the kickoff changes, the id does not).

## Status is a fact, not a guess

`status` is one of `scheduled | played | postponed`. A fixture becomes
`played` only when the results feed carries a final score. Derived files
(`probs.json`) state their `generatedAt` and the Elo date they were computed
from, so a stale computation is detectable rather than silently trusted.

## What is deliberately absent

No odds-with-margin, no stakes, no ledger, no accounts. That is the betting
layer, and it comes last, as its own contract with its own schema — this
layer must stand alone as an information site a person could cite.
