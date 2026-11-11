import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
vi.mock("server-only", () => ({}));
import { capabilities } from "@/lib/paiflow";
import { POST as pay } from "@/app/api/tranche/pay/route";
import { GET as group } from "@/app/api/tranche/group/route";
import { POST as release } from "@/app/api/tranche/vault/release/route";
import { POST as cover } from "@/app/api/tranche/fund/cover/route";
import { POST as forfeit } from "@/app/api/tranche/vault/forfeit/route";
import { POST as cancel } from "@/app/api/tranche/vault/release/[id]/cancel/route";
import { payoutsFor, syncEvents, vaultShares } from "@/lib/tranche/ledger";
import { getGroup } from "@/lib/tranche/registry";
import { readStore, withStore } from "@/lib/tranche/store";
import { fixtureAddress, fixturePrepared, fixtureTransaction } from "./transaction-fixture";

const round1 = { id: "11111111-1111-4111-8111-111111111111", token: `pfk_${"a".repeat(64)}` };
const round2 = { id: "22222222-2222-4222-8222-222222222222", token: `pfk_${"b".repeat(64)}` };
const fixtureHash = Buffer.from(fixtureTransaction.hash()).toString("hex");
const members = [fixtureAddress, ...Array.from({ length: 4 }, () => Keypair.random().publicKey())];
const day = 86_400_000;
const groupConfig = {
  id: "g",
  name: "Test group",
  contributionStroops: "10000000",
  members: members.map((publicKey, i) => ({ id: `m${i + 1}`, slot: i + 1, displayName: `M${i + 1}`, publicKey })),
  destinations: [],
  rounds: [7700, 8200, 8700, 9200, 9700].map((now, i) => ({
    index: i + 1,
    receiverMemberId: `m${i + 1}`,
    splitBps: { now, vault: 9700 - now, fund: 300 },
    deadline: new Date(Date.now() + (i + 1) * day).toISOString(),
  })),
};
const json = (data: unknown, status = 200) => Response.json(data, { status });
const post = (url: string, body: unknown, origin = "http://localhost") =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
let mockFetch: ReturnType<typeof vi.fn>;
let groupFile = "";

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), "tranche-"));
  groupFile = path.join(dir, "group.json");
  writeFileSync(groupFile, JSON.stringify(groupConfig));
  vi.stubEnv("TRANCHE_GROUP_FILE", path.join(dir, "group.json"));
  vi.stubEnv("TRANCHE_DATA_FILE", path.join(dir, "ledger.json"));
  vi.stubEnv("PAIFLOW_MODE", "team");
  vi.stubEnv("PAIFLOW_BASE_URL", "http://localhost:3000");
  vi.stubEnv("PAIFLOW_API_TOKEN", round1.token);
  vi.stubEnv("PAIFLOW_DEPLOYMENT_ID", round1.id);
  vi.stubEnv("TRANCHE_ROUNDS_JSON", JSON.stringify([{ round: 2, deploymentId: round2.id, token: round2.token }]));
  mockFetch = vi.fn(async (url: URL) => {
    const p = url.pathname;
    if (p.endsWith("/capabilities")) return json({ data: { network: "testnet" } });
    if (p.endsWith("/execute/submit")) return json({ data: { txHash: fixtureHash, status: "SUCCESS", ledger: 9 } });
    if (p.endsWith("/execute"))
      return json({ data: { ...fixturePrepared, expiresAt: new Date(Date.now() + 180_000).toISOString() } });
    return json({ error: { code: "NOT_FOUND", message: "nope" } }, 404);
  });
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("uses the round's own deployment and token", async () => {
  await capabilities(2);
  const [url, init] = mockFetch.mock.calls[0]!;
  expect(String(url)).toContain(round2.id);
  expect(init.headers.Authorization).toBe(`Bearer ${round2.token}`);
  await capabilities();
  expect(String(mockFetch.mock.calls[1]![0])).toContain(round1.id);
});
it.each(["not json", "{}", JSON.stringify([{ round: 2, deploymentId: "x", token: round2.token }])])(
  "refuses a bad TRANCHE_ROUNDS_JSON %s",
  async (value) => {
    vi.stubEnv("TRANCHE_ROUNDS_JSON", value);
    await expect(capabilities(2)).rejects.toMatchObject({ status: 503 });
  },
);
it("refuses a round with no deployment", async () => {
  await expect(capabilities(3)).rejects.toMatchObject({ status: 503 });
});

it("prepares, submits and records one contribution per member per round", async () => {
  const prepared = await (await pay(post("/api/tranche/pay", { round: 1, from: fixtureAddress }))).json();
  expect(prepared.data.txHash).toBe(fixtureHash);
  // Re-opening Pay returns the same preparation, not a second payment.
  const again = await (await pay(post("/api/tranche/pay", { round: 1, from: fixtureAddress }))).json();
  expect(again.data.txHash).toBe(fixtureHash);
  expect(mockFetch.mock.calls.filter(([u]) => String(u).endsWith("/execute"))).toHaveLength(1);

  const submitted = await (await pay(post("/api/tranche/pay", { round: 1, signedXdr: fixturePrepared.xdr }))).json();
  expect(submitted.data).toMatchObject({ status: "SUCCESS", memberId: "m1" });
  expect(submitted.data.signedXdr).toBeUndefined();

  const paidAgain = await pay(post("/api/tranche/pay", { round: 1, from: fixtureAddress }));
  expect(paidAgain.status).toBe(409);
  const g = await (await group()).json();
  expect(g.data.rounds[0].members.m1).toBe("paid");
  expect(g.data.activeRound).toBe(1);
});
it("refuses non-members, inactive rounds, other origins and unknown envelopes", async () => {
  expect((await pay(post("/api/tranche/pay", { round: 1, from: Keypair.random().publicKey() }))).status).toBe(403);
  expect((await pay(post("/api/tranche/pay", { round: 2, from: fixtureAddress }))).status).toBe(409);
  expect((await pay(post("/api/tranche/pay", { round: 1, from: fixtureAddress }, "http://evil"))).status).toBe(403);
  expect((await pay(post("/api/tranche/pay", { round: 1, signedXdr: fixturePrepared.xdr }))).status).toBe(404);
  expect((await pay(post("/api/tranche/pay", { round: 1, from: fixtureAddress, amount: "1" }))).status).toBe(422);
});
it("refuses payments in prepare mode", async () => {
  vi.stubEnv("PAIFLOW_MODE", "prepare");
  expect((await pay(post("/api/tranche/pay", { round: 1, from: fixtureAddress }))).status).toBe(403);
});

it("deduplicates events by eventId and keeps the cursor", async () => {
  const item = { id: "1", eventId: "e1", kind: "RECEIVE", topic: null, ledger: 1, txHash: fixtureHash, occurredAt: "2026-10-14T00:00:00Z", data: null };
  mockFetch.mockImplementation(async () => json({ data: { items: [item, item], nextCursor: "c1", hasMore: false } }));
  await syncEvents(1);
  await syncEvents(1);
  const state = await readStore();
  expect(state.events).toHaveLength(1);
  expect(state.eventCursors["1"]).toBe("c1");
  expect(String(mockFetch.mock.calls[1]![0])).toContain("cursor=c1");
});

it("computes held ambagan with bigint stroops", async () => {
  await withStore((s) => {
    for (const memberId of ["m1", "m2", "m3", "m4", "m5"])
      s.contributions.push({
        id: memberId, round: 1, memberId, from: fixtureAddress, amountStroops: "10000000",
        txHash: memberId, status: "SUCCESS", xdr: "", expiresAt: "", createdAt: "", updatedAt: "",
      });
  });
  const shares = vaultShares(getGroup(), await readStore());
  // Five 1 XLM contributions, 20% held for the round 1 receiver.
  expect(shares[0]).toMatchObject({ heldStroops: "10000000", remainingStroops: "10000000", paymentsDue: 4 });
  expect(shares[4]).toMatchObject({ heldStroops: "0", paymentsDue: 0 });
});
it("refuses a vault release without a confirmed payment", async () => {
  expect((await release(post("/api/tranche/vault/release", { memberId: "m1", round: 2 }))).status).toBe(409);
  expect((await release(post("/api/tranche/vault/release", { memberId: "m1", round: 1 }))).status).toBe(409);
});

const vault = Keypair.random().publicKey();
const fund = Keypair.random().publicKey();
const landlord = Keypair.random().publicKey();
const receive = (tx: string, from: string, amount = "10000000") => ({
  id: `r-${tx}`, eventId: `r-${tx}`, kind: "RECEIVE", topic: null, ledger: 7, txHash: tx,
  occurredAt: "2026-10-14T04:20:00Z", data: { from, asset: "XLM", amount },
});
const payout = (tx: string) => ({
  id: `p-${tx}`, eventId: `p-${tx}`, kind: "PAYOUT", topic: null, ledger: 7, txHash: tx,
  occurredAt: "2026-10-14T04:20:00Z",
  data: { recipients: [
    { bps: 4500, amount: "0", address: landlord },
    { bps: 3200, amount: "0", address: fixtureAddress },
    { bps: 2000, amount: "0", address: vault },
    { bps: 300, amount: "0", address: fund },
  ] },
});

it("labels payouts and derives amounts from bps when Paiflow reports 0", () => {
  vi.stubEnv("TRANCHE_VAULT_ACCOUNT", vault);
  vi.stubEnv("TRANCHE_FUND_ACCOUNT", fund);
  const g = { ...getGroup(), destinations: [
    { slot: 1, label: "Rent", publicKey: landlord, percentBps: 4500 },
    { slot: 1, label: "Wallet", publicKey: fixtureAddress, percentBps: 3200 },
  ] };
  const events = [receive("t1", fixtureAddress, "10000001"), payout("t1")].map((e) => ({ ...e, round: 1 }));
  const rows = payoutsFor(g, events, "t1");
  expect(rows.map((r) => [r.label, r.amountStroops])).toEqual([
    ["Rent", "4500000"], ["Wallet", "3200000"], ["Vault", "2000000"], ["Fund", "300001"],
  ]);
});

it("imports a hosted-page payment only after a SUCCESS status check", async () => {
  vi.stubEnv("TRANCHE_VAULT_ACCOUNT", vault);
  let status = "PENDING";
  mockFetch.mockImplementation(async (url: URL) => {
    if (url.pathname.endsWith("/events"))
      return json({ data: { items: [receive("h1", fixtureAddress), payout("h1"), receive("h2", fixtureAddress)], nextCursor: "c", hasMore: false } });
    if (url.pathname.includes("/transactions/"))
      return json({ data: { txHash: "h1", network: "testnet", status, ledger: 7 } });
    return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
  });
  await syncEvents(1);
  expect((await readStore()).contributions).toHaveLength(0);
  // A later sync sees no new events, so reset the cursor state to re-read them with SUCCESS.
  status = "SUCCESS";
  await withStore((s) => { s.events = []; s.eventCursors = {}; });
  await syncEvents(1);
  const state = await readStore();
  expect(state.contributions).toHaveLength(1);
  expect(state.contributions[0]).toMatchObject({ memberId: "m1", source: "hosted", status: "SUCCESS", txHash: "h1" });
  // Vault share comes from the PAYOUT event: 20% of 1 XLM.
  expect(vaultShares(getGroup(), state)[0]!.heldStroops).toBe("2000000");
});

it("refuses Safety Fund cover and forfeit unless the member is late", async () => {
  // Before the deadline: refused.
  expect((await cover(post("/api/tranche/fund/cover", { round: 1, memberId: "m2" }))).status).toBe(409);
  // Past the deadline: the receiver cannot be covered, a paid member is not late.
  const late = { ...groupConfig, rounds: groupConfig.rounds.map((r, i) => i === 0 ? { ...r, deadline: "2026-01-01T00:00:00Z" } : r) };
  writeFileSync(groupFile, JSON.stringify(late));
  await withStore((s) => {
    s.contributions.push({ id: "c2", round: 1, memberId: "m2", from: members[1]!, amountStroops: "10000000",
      txHash: "x2", status: "SUCCESS", xdr: "", expiresAt: "", createdAt: "", updatedAt: "" });
  });
  expect((await cover(post("/api/tranche/fund/cover", { round: 1, memberId: "m1" }))).status).toBe(409);
  expect((await cover(post("/api/tranche/fund/cover", { round: 1, memberId: "m2" }))).status).toBe(409);
  expect((await forfeit(post("/api/tranche/vault/forfeit", { round: 1, memberId: "m2" }))).status).toBe(409);
  // m3 is late but holds no ambagan, so there is nothing to forfeit.
  expect((await forfeit(post("/api/tranche/vault/forfeit", { round: 1, memberId: "m3" }))).status).toBe(409);
  expect((await cover(post("/api/tranche/fund/cover", { round: 1, memberId: "nobody" }))).status).toBe(409);
});

it("cancels an unsigned release only", async () => {
  const base = { source: "vault" as const, kind: "release" as const, memberId: "m1", round: 2, destination: fixtureAddress,
    amountStroops: "1", txHash: "t", xdr: "", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: "", updatedAt: "" };
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await withStore((s) => {
    s.releases.push({ ...base, id: a, signers: [], status: "COLLECTING" });
    s.releases.push({ ...base, id: b, signers: [fixtureAddress], status: "COLLECTING" });
  });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const ok = await cancel(post(`/api/tranche/vault/release/${a}/cancel`, {}), ctx(a));
  expect((await ok.json()).data.status).toBe("EXPIRED");
  expect((await cancel(post(`/api/tranche/vault/release/${b}/cancel`, {}), ctx(b))).status).toBe(409);
});

it("a confirmed hosted payment replaces an unsigned app preparation", async () => {
  await withStore((s) => {
    s.contributions.push({ id: "p1", round: 1, memberId: "m1", from: fixtureAddress, amountStroops: "10000000",
      txHash: "prep", status: "PREPARED", xdr: "x", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: "", updatedAt: "" });
  });
  mockFetch.mockImplementation(async (url: URL) => {
    if (url.pathname.endsWith("/events"))
      return json({ data: { items: [receive("h9", fixtureAddress)], nextCursor: "c", hasMore: false } });
    return json({ data: { txHash: "h9", network: "testnet", status: "SUCCESS", ledger: 7 } });
  });
  await syncEvents(1);
  const state = await readStore();
  expect(state.contributions.find((c) => c.id === "p1")!.status).toBe("EXPIRED");
  expect(state.contributions.find((c) => c.txHash === "h9")).toMatchObject({ status: "SUCCESS", source: "hosted" });
});
