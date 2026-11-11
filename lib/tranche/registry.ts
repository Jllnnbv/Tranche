import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { StrKey } from "@stellar/stellar-sdk";
import { PaiflowError } from "@/lib/paiflow";

// Public group rules agreed at setup. Public keys and basis points only; no secrets.
// publicKey null marks an account that has not been created yet.
export type Member = {
  id: string;
  slot: number;
  displayName: string;
  publicKey: string | null;
};
export type PayoutDestination = {
  slot: number;
  label: string;
  publicKey: string | null;
  percentBps: number;
};
export type Round = {
  index: number;
  receiverMemberId: string;
  splitBps: { now: number; vault: number; fund: number };
  deadline: string;
};
export type Group = {
  id: string;
  name: string;
  contributionStroops: string;
  members: Member[];
  destinations: PayoutDestination[];
  rounds: Round[];
};

function invalid(message: string): never {
  throw new PaiflowError(
    503,
    { code: "CONFIGURATION", message: `Group config: ${message}` },
    null,
    null,
  );
}
const isBps = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10_000;
const isKey = (v: unknown) =>
  v === null || (typeof v === "string" && StrKey.isValidEd25519PublicKey(v));

export function validateGroup(raw: unknown): Group {
  if (!raw || typeof raw !== "object") invalid("expected an object.");
  const g = raw as Group;
  if (typeof g.id !== "string" || typeof g.name !== "string")
    invalid("id and name are required.");
  if (
    typeof g.contributionStroops !== "string" ||
    !/^[1-9]\d{0,38}$/.test(g.contributionStroops)
  )
    invalid("contributionStroops must be positive integer stroops.");
  if (!Array.isArray(g.members) || g.members.length < 4 || g.members.length > 10)
    invalid("a group has 4 to 10 members.");
  const ids = new Set<string>();
  const slots = new Set<number>();
  for (const m of g.members) {
    if (typeof m.id !== "string" || ids.has(m.id)) invalid("duplicate member id.");
    if (!Number.isInteger(m.slot) || slots.has(m.slot))
      invalid("each member needs a unique slot.");
    if (!isKey(m.publicKey)) invalid(`member ${m.id} has an invalid public key.`);
    ids.add(m.id);
    slots.add(m.slot);
  }
  const keys = g.members.map((m) => m.publicKey).filter(Boolean);
  if (new Set(keys).size !== keys.length) invalid("duplicate member public key.");
  if (!Array.isArray(g.rounds) || !g.rounds.length) invalid("rounds are required.");
  const indexes = new Set<number>();
  for (const r of g.rounds) {
    if (!Number.isInteger(r.index) || r.index < 1 || indexes.has(r.index))
      invalid("each round needs a unique positive index.");
    indexes.add(r.index);
    if (!ids.has(r.receiverMemberId))
      invalid(`round ${r.index} receiver is not a member.`);
    const { now, vault, fund } = r.splitBps ?? {};
    if (![now, vault, fund].every(isBps) || now + vault + fund !== 10_000)
      invalid(`round ${r.index} splitBps must sum to 10000.`);
    if (!Number.isFinite(Date.parse(r.deadline)))
      invalid(`round ${r.index} deadline must be an ISO date.`);
  }
  if (!Array.isArray(g.destinations)) invalid("destinations must be an array.");
  for (const d of g.destinations) {
    if (!slots.has(d.slot) || typeof d.label !== "string" || !isBps(d.percentBps))
      invalid("each destination needs a member slot, label and percentBps.");
    if (!isKey(d.publicKey)) invalid(`destination ${d.label} has an invalid key.`);
  }
  g.rounds.sort((a, b) => a.index - b.index);
  return g;
}

export function getGroup(): Group {
  const file =
    process.env.AMBAGAN_GROUP_FILE ??
    process.env.TRANCHE_GROUP_FILE ??
    path.join(process.cwd(), "config", "group.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return invalid("config/group.json is missing or is not JSON.");
  }
  return validateGroup(raw);
}
export function getRound(group: Group, index: number): Round {
  const round = group.rounds.find((r) => r.index === index);
  if (!round)
    throw new PaiflowError(
      404,
      { code: "NOT_FOUND", message: `Round ${index} does not exist.` },
      null,
      null,
    );
  return round;
}
export const memberById = (group: Group, id: string) =>
  group.members.find((m) => m.id === id);
export const memberByKey = (group: Group, key: string) =>
  group.members.find((m) => m.publicKey === key);
export const receiverRound = (group: Group, memberId: string) =>
  group.rounds.find((r) => r.receiverMemberId === memberId);
export const stellarExpertTx = (txHash: string) =>
  `https://stellar.expert/explorer/testnet/tx/${txHash}`;
