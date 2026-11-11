import "server-only";
import { randomUUID } from "node:crypto";
import {
  Asset,
  BASE_FEE,
  FeeBumpTransaction,
  Horizon,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  type Transaction,
} from "@stellar/stellar-sdk";
import { fromStroops, toStroops } from "@/lib/amount";
import { PaiflowError } from "@/lib/paiflow";
import {
  getGroup,
  getRound,
  memberById,
  receiverRound,
  type Group,
} from "@/lib/tranche/registry";
import { readStore, withStore, type Release, type State } from "@/lib/tranche/store";
import { conflict, roundStatus, vaultShares } from "@/lib/tranche/ledger";

const RELEASE_WINDOW_SECONDS = 3600;
type Source = Release["source"];
type Kind = NonNullable<Release["kind"]>;

function configError(message: string): never {
  throw new PaiflowError(503, { code: "CONFIGURATION", message }, null, null);
}
function notFound(): never {
  throw new PaiflowError(404, { code: "NOT_FOUND", message: "No such release." }, null, null);
}
function horizon() {
  const url = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";
  if (!/^https:\/\/[^/]*testnet[^/]*\/?$/.test(url))
    configError("Set HORIZON_URL to a Stellar testnet Horizon origin.");
  return new Horizon.Server(url);
}
function sourceAccount(source: Source) {
  const key =
    source === "vault"
      ? (process.env.AMBAGAN_VAULT_ACCOUNT ?? process.env.TRANCHE_VAULT_ACCOUNT)
      : (process.env.AMBAGAN_FUND_ACCOUNT ?? process.env.TRANCHE_FUND_ACCOUNT);
  if (!key || !StrKey.isValidEd25519PublicKey(key))
    configError(`Set AMBAGAN_${source.toUpperCase()}_ACCOUNT to a G-address.`);
  return key;
}
function parse(xdr: string): Transaction {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  if (tx instanceof FeeBumpTransaction)
    throw new PaiflowError(422, { code: "VALIDATION", message: "Unsupported envelope." }, null, null);
  return tx;
}
const open = (r: Release) => r.status === "COLLECTING" || r.status === "PENDING";
const active = (r: Release) => r.status !== "FAILED" && r.status !== "EXPIRED";
const kindOf = (r: Release): Kind => r.kind ?? "release";

/** Unsigned releases past their time bound can never be submitted; mark them EXPIRED. */
function expireStale(state: State) {
  for (const r of state.releases)
    if (r.status === "COLLECTING" && Date.parse(r.expiresAt) <= Date.now()) {
      r.status = "EXPIRED";
      r.updatedAt = new Date().toISOString();
    }
}

/** Live multisig rules: signer weights and the medium threshold that a payment needs. */
export async function multisig(source: Source = "vault") {
  const account = await horizon().loadAccount(sourceAccount(source));
  return {
    account: account.accountId(),
    threshold: Math.max(account.thresholds.med_threshold, 1),
    masterWeight: account.signers.find((s) => s.key === account.accountId())?.weight ?? 0,
    signers: account.signers
      .filter((s) => s.type === "ed25519_public_key" && s.weight > 0)
      .map((s) => ({ key: s.key, weight: s.weight })),
    balances: account.balances,
    subentries: account.subentry_count,
  };
}

/** Build and store one unsigned multisig payment. One open payment per source account. */
async function createPayment(input: {
  source: Source;
  kind: Kind;
  memberId: string;
  round: number;
  destination: string;
  amount: bigint;
}) {
  if (input.amount <= 0n) conflict("The payment amount rounds to zero.");
  const account = await horizon().loadAccount(sourceAccount(input.source));
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: input.destination,
        asset: Asset.native(),
        amount: fromStroops(input.amount.toString()),
      }),
    )
    .setTimeout(RELEASE_WINDOW_SECONDS)
    .build();
  const release: Release = {
    id: randomUUID(),
    source: input.source,
    kind: input.kind,
    memberId: input.memberId,
    round: input.round,
    destination: input.destination,
    amountStroops: input.amount.toString(),
    txHash: Buffer.from(tx.hash()).toString("hex"),
    xdr: tx.toXDR(),
    signers: [],
    expiresAt: new Date(Number(tx.timeBounds!.maxTime) * 1000).toISOString(),
    status: "COLLECTING",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return withStore((s) => {
    expireStale(s);
    // Two envelopes on the same sequence number cannot both succeed.
    if (s.releases.some((r) => r.source === input.source && open(r)))
      conflict(`Finish, cancel or let the open ${input.source} payment expire first.`);
    s.releases.push(release);
    return release;
  });
}

async function prepareState() {
  return withStore((s) => {
    expireStale(s);
    return structuredClone(s);
  });
}
function receiverOf(group: Group, round: number) {
  const r = getRound(group, round);
  const receiver = memberById(group, r.receiverMemberId);
  if (!receiver?.publicKey) conflict("The round receiver has no wallet configured.");
  return { round: r, receiver: { ...receiver, publicKey: receiver.publicKey } };
}

/** Vault → receiver: one equal part of the held tranche after an on-time later payment. */
export async function createRelease(memberId: string, round: number) {
  const group = getGroup();
  const member = memberById(group, memberId);
  if (!member?.publicKey) conflict("This member has no wallet configured.");
  const own = receiverRound(group, memberId);
  if (!own || round <= own.index)
    conflict("Releases start in the rounds after the member received the pot.");
  const state = await prepareState();
  const paid = state.contributions.some(
    (c) => c.round === round && c.memberId === memberId && c.status === "SUCCESS",
  );
  if (!paid) conflict("The ledger has no confirmed payment from this member in this round.");
  if (state.releases.some((r) => r.source === "vault" && r.memberId === memberId && r.round === round && active(r)))
    conflict("A vault payment for this member and round already exists.");
  const share = vaultShares(group, state).find((s) => s.memberId === memberId)!;
  if (share.paymentsDue < 1 || BigInt(share.remainingStroops) <= 0n)
    conflict("This member has no held ambagan left.");
  return createPayment({
    source: "vault",
    kind: "release",
    memberId,
    round,
    destination: member.publicKey,
    amount: BigInt(share.remainingStroops) / BigInt(share.paymentsDue),
  });
}

/** Missed payment checks shared by cover and forfeit. */
function requireLate(group: Group, state: State, round: number, memberId: string) {
  if (!memberById(group, memberId)) conflict("No such member.");
  const { round: r, receiver } = receiverOf(group, round);
  if (Date.parse(r.deadline) > Date.now()) conflict("The round deadline has not passed yet.");
  if (roundStatus(group, state, round)[memberId] !== "late")
    conflict("This member is not late in this round.");
  if (receiver.id === memberId) conflict("The receiver cannot be paid for their own missed payment.");
  return receiver;
}

/** Safety Fund → round receiver, for one missed contribution. Needs the group's multisig vote. */
export async function createCover(round: number, missedMemberId: string) {
  const group = getGroup();
  const state = await prepareState();
  const receiver = requireLate(group, state, round, missedMemberId);
  if (state.releases.some((r) => r.source === "fund" && kindOf(r) === "cover" && r.round === round && r.memberId === missedMemberId && active(r)))
    conflict("The Safety Fund already covers this missed payment.");
  const rules = await multisig("fund");
  const native = rules.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
  // Keep the account reserve (0.5 XLM per base entry and subentry) plus fee margin.
  const reserve = BigInt(2 + rules.subentries) * 5_000_000n + 1_000_000n;
  const available = BigInt(toStroops(native)) - reserve;
  const due = BigInt(group.contributionStroops);
  return createPayment({
    source: "fund",
    kind: "cover",
    memberId: missedMemberId,
    round,
    destination: receiver.publicKey,
    amount: available < due ? available : due,
  });
}

/** Vault → round receiver: a late member loses their remaining held tranche, up to one contribution. */
export async function createForfeit(round: number, lateMemberId: string) {
  const group = getGroup();
  const state = await prepareState();
  const receiver = requireLate(group, state, round, lateMemberId);
  if (state.releases.some((r) => r.source === "vault" && kindOf(r) === "forfeit" && r.round === round && r.memberId === lateMemberId && active(r)))
    conflict("This held ambagan is already forfeited for this round.");
  const share = vaultShares(group, state).find((s) => s.memberId === lateMemberId)!;
  const remaining = BigInt(share.remainingStroops);
  if (remaining <= 0n) conflict("This member has no held ambagan left.");
  const due = BigInt(group.contributionStroops);
  return createPayment({
    source: "vault",
    kind: "forfeit",
    memberId: lateMemberId,
    round,
    destination: receiver.publicKey,
    amount: remaining < due ? remaining : due,
  });
}

/** Drop an open payment before anyone signs, so the account is free for another one. */
export function cancelRelease(id: string) {
  return withStore((state) => {
    const release = state.releases.find((r) => r.id === id);
    if (!release) notFound();
    if (release.status !== "COLLECTING") conflict(`This payment is ${release.status}.`);
    if (release.signers.length) conflict("A member already signed; let it expire instead.");
    release.status = "EXPIRED";
    release.error = "Cancelled before signing.";
    release.updatedAt = new Date().toISOString();
    return { ...release };
  });
}

/** Add the verified member signatures from signedXdr; submit once the weight reaches the threshold. */
export async function signRelease(id: string, signedXdr: string) {
  const existing = (await readStore()).releases.find((r) => r.id === id);
  if (!existing) notFound();
  const rules = await multisig(existing.source);
  const update = await withStore((state) => {
    const release = state.releases.find((r) => r.id === id)!;
    if (release.status !== "COLLECTING") conflict(`This payment is ${release.status}.`);
    if (Date.parse(release.expiresAt) <= Date.now()) {
      release.status = "EXPIRED";
      return { ...release };
    }
    const stored = parse(release.xdr);
    const incoming = parse(signedXdr);
    if (Buffer.from(incoming.hash()).toString("hex") !== release.txHash)
      throw new PaiflowError(422, { code: "VALIDATION", message: "This is not the payment transaction." }, null, null);
    const hash = stored.hash();
    for (const sig of incoming.signatures) {
      const signer = rules.signers.find((s) => {
        const kp = Keypair.fromPublicKey(s.key);
        return (
          Buffer.from(kp.signatureHint()).equals(Buffer.from(sig.hint.toXdrObject())) &&
          kp.verify(hash, sig.signature)
        );
      });
      // Only current signers of the source account count, and each signer only once.
      if (signer && !release.signers.includes(signer.key)) {
        stored.addDecoratedSignature(sig);
        release.signers.push(signer.key);
      }
    }
    release.xdr = stored.toXDR();
    release.updatedAt = new Date().toISOString();
    return { ...release };
  });
  const weight = rules.signers
    .filter((s) => update.signers.includes(s.key))
    .reduce((sum, s) => sum + s.weight, 0);
  if (update.status !== "COLLECTING" || weight < rules.threshold)
    return { ...update, weight, threshold: rules.threshold };
  return { ...(await submitRelease(update.id)), weight, threshold: rules.threshold };
}

async function setStatus(id: string, status: Release["status"], error?: string) {
  return withStore((state) => {
    const release = state.releases.find((r) => r.id === id)!;
    release.status = status;
    release.error = error;
    release.updatedAt = new Date().toISOString();
    return { ...release };
  });
}

async function submitRelease(id: string) {
  const release = await setStatus(id, "PENDING");
  try {
    await horizon().submitTransaction(parse(release.xdr));
    return setStatus(id, "SUCCESS");
  } catch (error) {
    const response = (error as { response?: { status?: number; data?: { extras?: { result_codes?: unknown } } } }).response;
    if (response?.status === 400)
      return setStatus(id, "FAILED", JSON.stringify(response.data?.extras?.result_codes ?? "rejected"));
    // Timeout or 5xx: outcome unknown. Stay PENDING and look the hash up; never rebuild.
    return release;
  }
}

/** Resolve a PENDING payment by its hash on Horizon. */
export async function checkRelease(id: string) {
  const { releases } = await readStore();
  const release = releases.find((r) => r.id === id);
  if (!release) notFound();
  if (release.status !== "PENDING") return release;
  try {
    const tx = await horizon().transactions().transaction(release.txHash).call();
    return setStatus(id, tx.successful ? "SUCCESS" : "FAILED");
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 404 && Date.parse(release.expiresAt) < Date.now())
      return setStatus(id, "EXPIRED");
    return release;
  }
}

async function accountView(group: Group, source: Source) {
  try {
    const rules = await multisig(source);
    return {
      account: rules.account,
      threshold: rules.threshold,
      // A safe multisig has 5 member signers and master weight 0.
      masterWeight: rules.masterWeight,
      signers: rules.signers.map((s) => ({
        ...s,
        member: group.members.find((m) => m.publicKey === s.key)?.displayName ?? null,
      })),
      nativeBalance: rules.balances.find((b) => b.asset_type === "native")?.balance ?? null,
      weights: rules.signers,
    };
  } catch {
    return null;
  }
}

export async function vaultOverview() {
  const group = getGroup();
  const state = await prepareState();
  const [vault, fund] = await Promise.all([accountView(group, "vault"), accountView(group, "fund")]);
  return {
    shares: vaultShares(group, state),
    vault: vault && { ...vault, weights: undefined },
    fund: fund && { ...fund, weights: undefined },
    releases: state.releases.map((r) => {
      const rules = r.source === "vault" ? vault : fund;
      return {
        ...r,
        kind: kindOf(r),
        // The browser needs the envelope only while members are still signing.
        xdr: r.status === "COLLECTING" ? r.xdr : undefined,
        member: memberById(group, r.memberId)?.displayName,
        weight: rules?.weights.filter((s) => r.signers.includes(s.key)).reduce((n, s) => n + s.weight, 0) ?? null,
        threshold: rules?.threshold ?? null,
      };
    }),
  };
}
