# touchline

Premier League 2026-27, by the numbers. Fixtures, table, club Elo, and fair
1X2 probabilities — as **data first** (JSON-LD under a published
[schema](schema/)), with an information site on top, and nothing else yet.

Sibling of [tavern](https://github.com/melvincarvalho/tavern) and the
World Cup predictor: same discipline — a pure core (`touchline.js`, no
imports, no clock, no network), data files anyone can fetch and verify, and a
static page that renders them.

## The layers, in build order

1. **Schema** — [`schema/context.jsonld`](schema/context.jsonld): JSON-LD
   mapping onto schema.org (`SportsTeam`, `SportsEvent`) plus a small `tl:`
   vocabulary for Elo and probabilities. See [`schema/README.md`](schema/README.md).
2. **Data** — `data/teams.json`, `data/fixtures.json` (380 matches, fetched),
   `data/probs.json` (derived). Sources are named in the files themselves;
   scripts refuse to overwrite good data with partial or failed fetches.
3. **Information site** — `index.html` + `app.js`: matchweek fixtures with
   fair probabilities, the league table (Elo-ordered until the season
   starts). Read-only, no accounts, no margin.
4. **Betting** — the **embryo** is in: paper credits in localStorage, 1X2
   priced at fair × 0.95 with the margin stated on the ticket, the tavern's
   exposure-capped stakes, and settlement that is exactly the named oracle's
   word (`wager.js`, pure, pinned, mutation-checked). The real contract —
   pod ledger, anchored history, pool-bank shares — is still to come; this
   is the loop it will grow inside. Previously: *not here yet, deliberately.* When it comes it is a separate
   contract in the worldcup web-contract style: public rules, anchored
   history, a pool-bank with the tavern's share accounting, and named oracle
   feeds. The information layer must stand alone first.

## External match documents

Any match-shaped JSON renders via the query string —
`?src=<url-of-document>` — teams inline with their own colours and codes,
priced from their Elo when present. The document is untrusted input:
validated (loudly) and escaped before render, with the source host and the
declared `oracle` bannered. Spec: [`schema/match-doc.md`](schema/match-doc.md);
live examples:
[scheduled](https://melvincarvalho.github.io/touchline/?src=examples/friendly-scheduled.json) ·
[played](https://melvincarvalho.github.io/touchline/?src=examples/friendly-played.json).
Minted matches are the compressed-time test rig the wager layer will be
built against.

## The model, honestly

v0 prices from Elo alone: clubelo's ~65-point home advantage, and a draw
share that peaks at 29% when the sides are level and decays with dominance.
The constants are stated, uncalibrated, and flagged in every `probs.json` —
"fair by construction", not yet "fair by evidence". A calibration harness
against the season's actual results replaces them when there are results to
fit.

## Running it

```sh
node scripts/fetch-fixtures.js   # season fixture list (fixturedownload.com)
node scripts/fetch-elo.js        # club Elo (clubelo.com) + derived probs
node tests.js                    # the suite; red means stop
```

Serve the directory statically and open `index.html`. A cron running the two
fetch scripts keeps it current; both treat a down source as a normal state —
they exit nonzero and touch nothing, and the site keeps serving the last good
data with its date visible.

## Licence

AGPL-3.0-or-later.
