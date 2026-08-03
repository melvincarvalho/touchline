# External match documents

A match doesn't have to come from the fixtures feed. The site renders any
**match document** — a standalone JSON(-LD) file, hosted anywhere CORS
allows — via the query string:

    https://melvincarvalho.github.io/touchline/?src=<url-of-document>

Two live examples: [scheduled](../?src=examples/friendly-scheduled.json) ·
[played](../?src=examples/friendly-played.json).

This is the web-contract shape: the document is the state, the schema is
public, and the `oracle` field names who settles it. Minted matches are the
test rig for the wager layer — a match that kicks off in five minutes and
settles in ten exercises the whole loop without waiting for a matchweek.

## Shape

```json
{
  "@context": "https://melvincarvalho.github.io/touchline/schema/context.jsonld",
  "@type": "SportsEvent",
  "name": "Melvo FC v Phil Athletic",
  "kickoff": "2026-08-09T18:00:00Z",
  "venue": "The Tidepool Arena",
  "status": "scheduled",
  "homeTeam": { "name": "Melvo FC",      "code": "MEL", "colors": ["#0f7d5c", "#ffffff"], "elo": 1600 },
  "awayTeam": { "name": "Phil Athletic", "code": "PHI", "colors": ["#b45309", "#ffffff"], "elo": 1540 },
  "oracle": "https://example.org/results/melvo-phil.json"
}
```

Teams are **inline objects**, not ids — the document is self-contained.
`elo` on both sides is optional; when present the site prices fair 1X2 from
it. `status: "played"` adds `homeGoals` / `awayGoals`. `oracle` is a URL that
will carry (or carries) the authoritative result — for a minted test match,
that is typically the document itself, updated by its author.

## Trust, stated plainly

Anyone can mint a document, so the site treats them as **untrusted input**:
validated against the shape above before anything renders (garbage is
refused with the reasons listed), every string HTML-escaped, and the page
banners the source host and the declared oracle. A rendered document proves
only that someone published a well-formed file at that URL — never that the
match is real, or that the oracle is honest. Wagering against one is
wagering on the oracle's word; the banner exists so you know whose word.

## Validation rules

`validateMatchDoc` in `touchline.js` (pure, pinned by tests): team names are
non-empty strings ≤ 48 chars; codes match `[A-Z0-9]{2,4}`; colors are 2 hex
values; elo, goals finite where present; `status` is
`scheduled | played | postponed`; `kickoff` parses as a date; `played`
requires both goals; `oracle`, when present, is http(s).
