# Handoff: Ambagan backend, remaining work

You are continuing the backend of **Ambagan**, an ambagan (rotating savings) app built on the Paiflow hackathon starter (Next.js 15, Stellar **testnet only**). Work on branch `tranche-backend` in `paiflow-hackathon-starter/`.

## Read first
1. `AGENTS.md`: the starter rules plus the "Tranche backend" and "Tranche status and open work" sections.
2. `llms.md`: the Paiflow API guide (execute, events, transactions, rate limits).
3. `lib/tranche/*.ts` and `app/api/tranche/**/route.ts`: the existing backend.
4. `tests/tranche.test.ts`: the test pattern (temp group/ledger files through `TRANCHE_GROUP_FILE`/`TRANCHE_DATA_FILE`, stubbed `fetch`, `vi.mock("server-only")`).

Setup: `npx -y pnpm@10.4.1 install --frozen-lockfile`. Check with `npx pnpm@10.4.1 typecheck && npx pnpm@10.4.1 test && npx pnpm@10.4.1 build`, then `grep -r pfk_ .next/static`, which must return nothing. Node 26 shows an engines warning; you can ignore it.

## Keep the user informed
The user is working on a hackathon deadline and must understand what is happening without reading code. They may also need to explain it in the pitch.
- **Before each task:** say in 1–2 plain sentences what you are about to do and why it matters for the demo or for qualifying. Example: "Next I add the Safety Fund payment, so you can show the judges what happens when someone misses a payment."
- **After each task:** say what changed, how you checked it (tests or a live call), and what it means for them. Name the files, and give the commands for anything they can try.
- **When you need something from them:** stop and ask clearly. Say exactly what you need (for example "the 5 member public G-addresses"), why you need it, and where it goes. Remind them never to paste S-secret keys or API tokens into chat, and say where those go instead (`.env.local`, typed by them).
- **When something fails or differs from the docs:** say so directly, with the error. Say what you think the cause is and what you will try next. Never hide a failing test, a skipped step, or an untested live path.
- **Keep the time in view.** Deadlines are 12:30 PM PHT (qualification checkpoint) and 3:30 PM PHT (submission). If a task risks the qualification path, say so and suggest the fallback the PRD gives (for example, a release through Stellar Laboratory).
- Use plain language. Explain terms like XDR, multisig or threshold the first time you use them. Keep updates short; use a table or list when you report several items.
- Keep the AGENTS.md "Tranche status and open work" section current, so the user (and the next agent) can see at a glance what is done, what is waiting on them, and what is left.

## Rules (do not break)
- API tokens stay in server env only. Never use `NEXT_PUBLIC_`, never return a token, never log one. Never ask for or accept S-secret keys or tokens in chat.
- Members sign only in Freighter. The server never holds secret keys.
- Money is bigint stroops strings (1 XLM = 10,000,000) through `lib/amount.ts`. Percentages are basis points. No floats.
- An HTTP 200 is not proof of payment. Only Paiflow `SUCCESS` (`transactionStatus`) or Horizon `successful` marks something paid.
- For PENDING, timeout or 5xx, retry the **same** stored signed envelope or look the hash up. Never prepare or build a replacement until failure or expiry is confirmed.
- Keep the mode guards in `lib/paiflow.ts` (`requireIntegration`). Mutating routes call `requireSameOrigin`.
- Respect 429 and `Retry-After`. Don't poll fast. Read events only when a request asks for them.

## What exists
| Module | Exports |
|---|---|
| `lib/paiflow.ts` | Every Tranche wrapper takes an optional `round`: `capabilities`, `prepareExecute`, `submitExecute`, `reconcileExecute`, `transactionStatus`, `listEvents`. Round 1 uses `PAIFLOW_DEPLOYMENT_ID`/`PAIFLOW_API_TOKEN`; rounds 2+ use `TRANCHE_ROUNDS_JSON`. |
| `lib/tranche/registry.ts` | `getGroup`, `validateGroup`, `getRound`, `memberById`, `memberByKey`, `receiverRound`, `stellarExpertTx`. Reads `config/group.json`. |
| `lib/tranche/store.ts` | `withStore` (serialised read-modify-write, atomic save), `readStore`. Types: `Contribution`, `StoredEvent`, `Release` (has `source: "vault" \| "fund"`). File: `data/ledger.json`, gitignored. |
| `lib/tranche/ledger.ts` | `recordPrepared`, `recordSigned`, `recordResult`, `reconcile`, `syncEvents`, `roundStatus` (paid/pending/due/late), `activeRound`, `vaultShares`, `openContribution`, `publicContribution`, `conflict`. |
| `lib/tranche/vault.ts` | `multisig(source)`, `createRelease(memberId, round)` (vault only), `signRelease(id, signedXdr)` (signer list hard-coded to the **vault**), `checkRelease(id)`, `vaultOverview()`. |
| Routes | `GET group`, `POST pay`, `GET pay/status`, `GET ledger`, `GET vault`, `POST vault/release`, `POST`/`GET vault/release/[id]/sign`. All under `/api/tranche/`. |

## Tasks, in priority order

### 1. Fill in the group config (blocks everything)
The team will give you **public** G-addresses. Put them in `config/group.json`: `members[].publicKey` (5) and `destinations` for slot 1 (Rent = landlord, Wallet = member 1). Keep the existing split bps unless the team changes them. `validateGroup` checks the keys and that the bps sum to 10000. Round 1's deadline is `2026-10-14T07:30:00Z` (3:30 PM PHT). Move it later if the demo runs past that, or Pay will refuse with `ROUND_NOT_ACTIVE`.

### 2. Live check of the contribution flow (needed to qualify)
With `.env.local` in team mode (the team creates this file; you never see the token), run `pnpm dev` and use the Pay UI or the browser console:
- `POST /api/tranche/pay {round:1, from}` should return XDR. After a Freighter signature, `POST {round:1, signedXdr}` should return SUCCESS.
- `GET /api/tranche/ledger` should show 1 RECEIVE and 4 PAYOUT events for the hash.
- **Check the real event `data` shape** (it is typed `unknown`). Then add a payout breakdown to the ledger response: for each contribution, list each PAYOUT recipient and amount, labelled from `config/group.json` (Rent, Wallet) and the env (Vault, Fund). Put the parsing in `ledger.ts` with a unit test that uses the real shape you saw.
- If anything differs from the docs (status values, `expiresAt`, the `x-history-request-id` header), fix it and record it in AGENTS.md.

### 3. Check vault shares against on-chain data
`vaultShares` currently calculates held amounts from contribution amount × vault bps. When PAYOUT events are parsed (task 2), calculate the held amount from the actual PAYOUT amounts to `TRANCHE_VAULT_ACCOUNT` per round, and fall back to the bps calculation when there are no events. Contract rounding can differ by a stroop. Add a test.

### 4. Safety Fund payment for a missed contribution (new)
PRD flow: the round deadline passes, a member has no SUCCESS, and the group votes (multisig) to pay the round's receiver from the Fund.
- Generalise `vault.ts` so `signRelease`/`checkRelease`/`submitRelease` use `multisig(release.source)` and `sourceAccount(release.source)` instead of the hard-coded vault.
- Add `createFundPayout(round, missedMemberId)`. Refuse unless: the round deadline has passed, `roundStatus` for that member is `late`, and no active fund release exists for (round, missedMemberId). Amount = `contributionStroops`, capped at the Fund's native balance minus about 2 XLM for reserves (from Horizon `balances`). Destination = the round receiver's `publicKey`. Store it as a `Release` with `source: "fund"`. Keep the "one open release per source" rule, because of sequence numbers.
- Route: `POST /api/tranche/fund/payout {round, memberId}`, with the same guards as `vault/release`. Show fund releases in `vaultOverview`, or in a new `GET /api/tranche/fund`.
- Tests: refuse before the deadline, refuse when the member paid, refuse a duplicate.

### 5. Forfeit the held tranche of a member who stops paying (new)
PRD: if a held receiver misses a later round, releases for them stop (this already happens, because `createRelease` needs a SUCCESS in that round), and the group can vote to use their remaining held amount for missed contributions. Add `createForfeit(round, memberId)`: a `source: "vault"` release whose destination is the round's **receiver**, not the late member, for `min(remaining held, contributionStroops)`. Refuse unless the member is `late` in that round. Count forfeited amounts as no longer held in `vaultShares` (a new `kind: "release" | "forfeit"` field on `Release`). Add tests.

### 6. Tighten release creation
Today any same-origin caller can create a release, which locks the single open release slot for an hour. Add a cancel route `POST /api/tranche/vault/release/[id]/cancel` allowed while `status === "COLLECTING"` and no signatures are collected; mark it `EXPIRED`. Also expire `COLLECTING` releases automatically when they are read after `expiresAt`, for example in `vaultOverview` and `createRelease`.

### 7. Live test of a vault release (after the team sets up multisig)
The vault needs 5 member signers with weight 1, med/high threshold 3, and master key weight 0. Create a release for a tiny amount, sign with 3 members in Freighter, and confirm Horizon accepts it and Stellar Expert shows it. Check that `Horizon.submitTransaction` errors in SDK v17 put result codes at `error.response.data.extras.result_codes`, and adjust `submitRelease` if not.

### 8. Optional / pitch only
- Safety Fund refund at the end of the cycle: an equal split of the Fund balance to members with no `late` status in any round, one multisig payment with several operations.
- Round 2: the team adds it to `TRANCHE_ROUNDS_JSON`. No code is needed. Round 2 becomes active when round 1 is fully paid or past its deadline.

## Done when
- Typecheck, tests and build pass, and there are no `pfk_` strings in `.next/static`.
- One live round 1 payment shows SUCCESS and 4 labelled payouts in `/api/tranche/ledger`.
- Tasks 4–6 have tests for their refusal cases.
- AGENTS.md "Tranche status and open work" is updated: move finished items to Done and note any API differences you found.
- Commit to `tranche-backend` with a clear message. Don't push unless the user asks.
