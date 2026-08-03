// Touchline — the wager embryo, pure. No clock, no storage, no DOM: the
// caller owns the ledger and the time; this file owns the arithmetic that
// must never print or destroy credits. Tavern lineage: the edge convention,
// the exposure-capped stake, and the discipline that every branch is pinned.
//
// Scope is deliberately small: one market (1X2), a fixed house bank, paper
// credits. The pool-bank with LP shares arrives when this loop has run.

const WAGER_EDGE_BPS = 500;      // 5% off fair — stated on every ticket
const WAGER_MAX_RISK_FRAC = 0.10; // no single ticket may risk >10% of the bank

/** Finite and positive, or zero — the only amounts the book acts on. */
function amount(n) {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Price a 1X2 market from fair probabilities. Payout multipliers include the
 * stake, tavern-style: priced = fair x (1 - edge). Fair odds are returned
 * alongside so the margin is visible, never implied.
 */
function priceMarket(probs, edgeBps = WAGER_EDGE_BPS) {
  const e = Number.isFinite(edgeBps) && edgeBps >= 0 && edgeBps < 10000 ? edgeBps : WAGER_EDGE_BPS;
  const f = 1 - e / 10000;
  const out = {};
  for (const k of ['home', 'draw', 'away']) {
    const p = probs[k];
    if (!(p > 0) || p > 1) return null; // a broken market prices nothing
    out[k] = { fair: 1 / p, priced: (1 / p) * f };
  }
  return { edgeBps: e, odds: out };
}

/**
 * Exposure-capped max stake. Caps the BANK'S loss, not the stake: a ticket's
 * worst case costs the bank stake*(priced-1), so a longshot allows
 * proportionally less. Capping the stake instead would be useless — the
 * tavern's README says why.
 */
function maxStake(bank, pricedOdds, maxRiskFrac = WAGER_MAX_RISK_FRAC) {
  const b = amount(bank);
  const frac = Number.isFinite(maxRiskFrac) && maxRiskFrac > 0 && maxRiskFrac <= 1
    ? maxRiskFrac : WAGER_MAX_RISK_FRAC;
  if (!(pricedOdds > 1)) return 0;
  return (b * frac) / (pricedOdds - 1);
}

/**
 * Place a bet: validates and returns the new balance, new bank and the
 * ticket — or {error}. Pure: the caller passes state in and writes state out.
 * The bank escrows nothing here; it pays on settlement. `now` and `kickoff`
 * are the caller's clocks — a bet after kickoff is refused.
 */
function placeBet({ balance, bank, pick, stake, probs, source, oracle, kickoff, now, edgeBps }) {
  if (!['home', 'draw', 'away'].includes(pick)) return { error: 'bad pick' };
  const s = Math.floor(amount(stake));
  if (s < 1) return { error: 'stake must be at least 1' };
  if (s > amount(balance)) return { error: 'insufficient balance' };
  if (kickoff != null && now != null && now >= Date.parse(kickoff)) {
    return { error: 'kick-off has passed' };
  }
  const market = priceMarket(probs, edgeBps);
  if (!market) return { error: 'market cannot be priced' };
  const odds = market.odds[pick].priced;
  const cap = maxStake(bank, odds);
  if (s > cap) return { error: `stake over the exposure cap (${Math.floor(cap)})` };
  return {
    balance: balance - s,
    bank,
    ticket: {
      market: '1X2',
      pick,
      stake: s,
      odds: Math.round(odds * 100) / 100,
      fair: Math.round(market.odds[pick].fair * 100) / 100,
      edgeBps: market.edgeBps,
      source: source || null,
      oracle: oracle || null,
      status: 'open',
    },
  };
}

/** What a result document says about a 1X2 pick: 'won' | 'lost' | 'void' | null. */
function outcomeFor(pick, doc) {
  if (!doc) return null;
  if (doc.status === 'postponed') return 'void';
  if (doc.status !== 'played') return null;
  if (!Number.isInteger(doc.homeGoals) || !Number.isInteger(doc.awayGoals)) return null;
  const winner = doc.homeGoals > doc.awayGoals ? 'home'
    : doc.homeGoals < doc.awayGoals ? 'away' : 'draw';
  return pick === winner ? 'won' : 'lost';
}

/**
 * Settle one ticket against a result. Returns new balance/bank and the
 * closed ticket, or null when the result decides nothing yet (ticket stays
 * open, nothing moves — no result, no movement).
 *
 * Money flow, and the invariant tests pin: a lost stake moves INTO the bank;
 * a win pays stake*odds out of stake+bank profit; a void refunds. Credits
 * are conserved in every branch.
 */
function settleTicket({ balance, bank, ticket }, resultDoc) {
  if (!ticket || ticket.status !== 'open') return null;
  const out = outcomeFor(ticket.pick, resultDoc);
  if (!out) return null;
  const closed = { ...ticket, status: out };
  if (out === 'void') {
    return { balance: balance + ticket.stake, bank, ticket: closed };
  }
  if (out === 'lost') {
    return { balance, bank: bank + ticket.stake, ticket: closed };
  }
  // won: the payout includes the stake; the bank funds the profit part.
  const payout = ticket.stake * ticket.odds;
  return { balance: balance + payout, bank: bank - (payout - ticket.stake), ticket: closed };
}

export {
  WAGER_EDGE_BPS, WAGER_MAX_RISK_FRAC,
  amount, priceMarket, maxStake, placeBet, outcomeFor, settleTicket,
};
