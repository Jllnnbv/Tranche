import "server-only";
import { randomUUID } from "node:crypto";
import {
  PaiflowError,
  listEvents,
  transactionStatus,
  type Prepared,
  type Submitted,
} from "@/lib/paiflow";
import {
  getGroup,
  getRound,
  memberById,
  memberByKey,
  receiverRound,
  type Group,
} from "@/lib/tranche/registry";
import {
  readStore,
  withStore,
  type Contribution,
  type ContributionStatus,
  type State,
  type StoredEvent,
} from "@/lib/tranche/store";

const now = () => new Date().toISOString();
const settled: ContributionStatus[] = ["FAILED", "REJECTED", "EXPIRED"];

export function conflict(message: string, code = "CONFLICT"): never {
  throw new PaiflowError(409, { code, message }, null, null);
}

/** The open (not failed/expired) contribution of a member in a round, if any. */
export function openContribution(
  state: State,
  round: number,
  memberId: string,
): Contribution | undefined {
  return state.contributions.find(
    (c) => c.round === round && c.memberId === memberId && !settled.includes(c.status),
  );
}

export function recordPrepared(input: {
  round: number;
  memberId: string;
  from: string;
  amountStroops: string;
  prepared: Prepared & { txHash: string };
}) {
  return withStore((state) => {
    if (openContribution(state, input.round, input.memberId))
      conflict("This member already has an open payment for this round.");
    const record: Contribution = {
      id: randomUUID(),
      round: input.round,
      memberId: input.memberId,
      from: input.from,
      amountStroops: input.amountStroops,
      txHash: input.prepared.txHash,
      status: "PREPARED",
      xdr: input.prepared.xdr,
      expiresAt: input.prepared.expiresAt,
      preparationRequestId: input.prepared.preparationRequestId,
      createdAt: now(),
      updatedAt: now(),
    };
    state.contributions.push(record);
    return record;
  });
}

/** Persist the exact signed envelope before submit; refuse envelopes we did not prepare. */
export function recordSigned(round: number, txHash: string, signedXdr: string) {
  return withStore((state) => {
    const record = state.contributions.find(
      (c) => c.round === round && c.txHash === txHash,
    );
    if (!record)
      throw new PaiflowError(
        404,
        { code: "NOT_FOUND", message: "No prepared Ambagan payment has this hash." },
        null,
        null,
      );
    if (!["PREPARED", "PENDING", "UNKNOWN"].includes(record.status))
      conflict(`This payment is already ${record.status}.`);
    record.signedXdr ??= signedXdr;
    record.updatedAt = now();
    return { ...record };
  });
}

export function recordResult(
  txHash: string,
  result: Pick<Submitted, "status" | "ledger" | "error"> | { status: ContributionStatus },
) {
  return withStore((state) => {
    const record = state.contributions.find((c) => c.txHash === txHash);
    if (!record) return undefined;
    // SUCCESS is final; never downgrade it.
    if (record.status !== "SUCCESS") record.status = result.status;
    if ("ledger" in result && result.ledger !== undefined) record.ledger = result.ledger;
    if ("error" in result && result.error) record.error = result.error;
    record.updatedAt = now();
    return { ...record };
  });
}

/** Ask Paiflow for the final status. Only SUCCESS from this call marks a member as paid. */
export async function reconcile(round: number, txHash: string) {
  const state = await readStore();
  const record = state.contributions.find(
    (c) => c.round === round && c.txHash === txHash,
  );
  if (!record)
    throw new PaiflowError(
      404,
      { code: "NOT_FOUND", message: "No Ambagan payment has this hash." },
      null,
      null,
    );
  if (record.status === "SUCCESS") return publicContribution(record);
  try {
    const status = await transactionStatus(txHash, round);
    return publicContribution(
      (await recordResult(txHash, {
        status: status.status,
        ledger: status.ledger,
        error: status.error,
      }))!,
    );
  } catch (error) {
    // Not found is uncertainty, unless the unsigned preparation expired without a signature.
    if (
      error instanceof PaiflowError &&
      error.status === 404 &&
      record.status === "PREPARED" &&
      !record.signedXdr &&
      Date.parse(record.expiresAt) < Date.now()
    )
      return publicContribution((await recordResult(txHash, { status: "EXPIRED" }))!);
    throw error;
  }
}

/** Reads one page of Paiflow events for a round and stores new ones, deduplicated by eventId. */
export async function syncEvents(round: number) {
  const { eventCursors } = await readStore();
  const cursor = eventCursors[round];
  const page = await listEvents({ cursor }, round);
  const fresh = await withStore((state) => {
    const seen = new Set(state.events.map((e) => e.eventId));
    const added: StoredEvent[] = [];
    for (const item of page.items)
      if (!seen.has(item.eventId)) {
        seen.add(item.eventId);
        added.push({ ...item, round });
      }
    state.events.push(...added);
    if (page.nextCursor) state.eventCursors[round] = page.nextCursor;
    return added;
  });
  await importHosted(round, fresh);
  return page.hasMore;
}

const isStroops = (v: unknown): v is string => typeof v === "string" && /^\d{1,39}$/.test(v);

/**
 * A member who paid on Paiflow's hosted trigger page has no app record. Events alone are
 * not proof, so each new member RECEIVE is checked with transactionStatus. Only SUCCESS
 * creates a contribution, and only one per member per round.
 */
async function importHosted(round: number, items: StoredEvent[]) {
  const group = getGroup();
  for (const item of items) {
    if (item.kind !== "RECEIVE") continue;
    const data = item.data as { from?: unknown; amount?: unknown } | null;
    const from = typeof data?.from === "string" ? data.from : "";
    const member = memberByKey(group, from);
    if (!member || !isStroops(data?.amount)) continue;
    if (BigInt(data.amount) < BigInt(group.contributionStroops)) continue;
    // An unsigned app preparation was never submitted, so it doesn't block a confirmed
    // hosted payment; it is expired below when the hosted payment is imported.
    const blocking = (s: State) => {
      const open = openContribution(s, round, member.id);
      return open && !(open.status === "PREPARED" && !open.signedXdr) ? open : undefined;
    };
    const duplicate = (s: State) =>
      s.contributions.some((c) => c.txHash === item.txHash) || !!blocking(s);
    if (duplicate(await readStore())) continue;
    let status;
    try {
      status = await transactionStatus(item.txHash, round);
    } catch {
      continue; // Uncertain: try again on the next sync.
    }
    if (status.status !== "SUCCESS") continue;
    await withStore((s) => {
      if (duplicate(s)) return;
      const stale = openContribution(s, round, member.id);
      if (stale) {
        stale.status = "EXPIRED";
        stale.updatedAt = now();
      }
      s.contributions.push({
        id: randomUUID(),
        round,
        memberId: member.id,
        from,
        amountStroops: data.amount as string,
        txHash: item.txHash,
        status: "SUCCESS",
        xdr: "",
        expiresAt: item.occurredAt,
        ledger: status.ledger ?? item.ledger,
        source: "hosted",
        createdAt: item.occurredAt,
        updatedAt: now(),
      });
    });
  }
}

/** Display label for a payout address: Vault, Fund, the receiver's destination label, or a member. */
export function labelFor(group: Group, round: number, address: string) {
  if (address === (process.env.AMBAGAN_VAULT_ACCOUNT ?? process.env.TRANCHE_VAULT_ACCOUNT)) return "Vault";
  if (address === (process.env.AMBAGAN_FUND_ACCOUNT ?? process.env.TRANCHE_FUND_ACCOUNT)) return "Fund";
  const r = group.rounds.find((x) => x.index === round);
  const receiver = r && memberById(group, r.receiverMemberId);
  const destination =
    receiver &&
    group.destinations.find((d) => d.slot === receiver.slot && d.publicKey === address);
  if (destination) return destination.label;
  return memberByKey(group, address)?.displayName ?? "Other";
}

export type Payout = { label: string; address: string; bps: number; amountStroops: string };
/**
 * The split of one payment, from its RECEIVE and PAYOUT events. Paiflow's PAYOUT event
 * reports recipient amounts as "0", so amounts come from bps of the received amount,
 * with the rounding remainder on the last recipient (Paiflow's Split rule).
 */
export function payoutsFor(group: Group, events: StoredEvent[], txHash: string): Payout[] {
  const receive = events.find((e) => e.txHash === txHash && e.kind === "RECEIVE");
  const payout = events.find((e) => e.txHash === txHash && e.kind === "PAYOUT");
  const total = (receive?.data as { amount?: unknown } | null)?.amount;
  const raw = (payout?.data as { recipients?: unknown } | null)?.recipients;
  if (!payout || !Array.isArray(raw)) return [];
  const rows = raw.filter(
    (r): r is { address: string; bps: number; amount?: unknown } =>
      !!r && typeof r.address === "string" && Number.isInteger(r.bps),
  );
  const reported = rows.every((r) => isStroops(r.amount) && r.amount !== "0");
  let remaining = isStroops(total) ? BigInt(total) : 0n;
  return rows.map((r, i) => {
    let amount: bigint;
    if (reported) amount = BigInt(r.amount as string);
    else if (!isStroops(total)) amount = 0n;
    else if (i === rows.length - 1) amount = remaining;
    else amount = (BigInt(total) * BigInt(r.bps)) / 10_000n;
    remaining -= amount;
    return {
      label: labelFor(group, payout.round, r.address),
      address: r.address,
      bps: r.bps,
      amountStroops: amount.toString(),
    };
  });
}

export type MemberRoundStatus = "paid" | "pending" | "due" | "late";
export function roundStatus(group: Group, state: State, index: number) {
  const round = getRound(group, index);
  const late = Date.parse(round.deadline) < Date.now();
  return Object.fromEntries(
    group.members.map((m) => {
      const c = openContribution(state, index, m.id);
      const status: MemberRoundStatus =
        c?.status === "SUCCESS"
          ? "paid"
          : c && c.status !== "PREPARED"
            ? "pending"
            : late
              ? "late"
              : "due";
      return [m.id, status];
    }),
  );
}

/** First round whose deadline has not passed and that not every member has paid. */
export function activeRound(group: Group, state: State) {
  return group.rounds.find(
    (r) =>
      Date.parse(r.deadline) >= Date.now() &&
      Object.values(roundStatus(group, state, r.index)).some((s) => s !== "paid"),
  );
}

const share = (amount: string, bps: number) =>
  (BigInt(amount) * BigInt(bps)) / 10_000n;

/**
 * Held tranche per receiver: everything the round r Split paid to the Vault counts for
 * round r's receiver. It uses PAYOUT events, and falls back to vault bps for a SUCCESS
 * contribution whose event has not arrived yet. Horizon holds the final balance.
 */
export function vaultShares(group: Group, state: State) {
  const vault = process.env.AMBAGAN_VAULT_ACCOUNT ?? process.env.TRANCHE_VAULT_ACCOUNT;
  return group.members.map((m) => {
    const own = receiverRound(group, m.id);
    let held = 0n;
    if (own) {
      const roundEvents = state.events.filter((e) => e.round === own.index);
      const paidOut = new Set<string>();
      for (const e of roundEvents)
        if (e.kind === "PAYOUT" && !paidOut.has(e.txHash)) {
          paidOut.add(e.txHash);
          for (const p of payoutsFor(group, roundEvents, e.txHash))
            if (vault && p.address === vault) held += BigInt(p.amountStroops);
        }
      for (const c of state.contributions)
        if (c.round === own.index && c.status === "SUCCESS" && !paidOut.has(c.txHash))
          held += share(c.amountStroops, own.splitBps.vault);
    }
    let released = 0n;
    for (const r of state.releases)
      if (r.source === "vault" && r.memberId === m.id && r.status === "SUCCESS")
        released += BigInt(r.amountStroops);
    const laterRounds = own
      ? group.rounds.filter((r) => r.index > own.index).map((r) => r.index)
      : [];
    const releasedRounds = new Set(
      state.releases
        .filter((r) => r.source === "vault" && r.memberId === m.id && r.status === "SUCCESS")
        .map((r) => r.round),
    );
    return {
      memberId: m.id,
      receiverRound: own?.index ?? null,
      heldStroops: held.toString(),
      releasedStroops: released.toString(),
      remainingStroops: (held - released).toString(),
      paymentsDue: laterRounds.filter((r) => !releasedRounds.has(r)).length,
    };
  });
}

/** Browser-safe view: never includes the signed envelope. */
export function publicContribution(c: Contribution) {
  const { signedXdr: _signed, xdr: _xdr, ...rest } = c;
  return rest;
}
