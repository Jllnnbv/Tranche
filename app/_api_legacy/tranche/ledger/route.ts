import { PaiflowError, requireIntegration } from "@/lib/paiflow";
import { handle } from "@/lib/http";
import { getGroup, stellarExpertTx } from "@/lib/tranche/registry";
import { readStore } from "@/lib/tranche/store";
import { activeRound, payoutsFor, publicContribution, syncEvents } from "@/lib/tranche/ledger";

const MAX_PAGES = 5;

export async function GET() {
  return handle(async () => {
    const group = getGroup();
    let live = true;
    try {
      requireIntegration();
    } catch (error) {
      if (!(error instanceof PaiflowError)) throw error;
      live = false;
    }
    if (live) {
      const before = await readStore();
      const rounds = new Set(before.contributions.map((c) => c.round));
      // Also read the active round, so payments made on the hosted trigger page appear.
      const active = activeRound(group, before);
      if (active) rounds.add(active.index);
      for (const round of rounds)
        try {
          for (let page = 0; page < MAX_PAGES && (await syncEvents(round)); page++);
        } catch (error) {
          // A round without a deployment yet has no events; keep showing the others.
          if (!(error instanceof PaiflowError && error.api.code === "CONFIGURATION")) throw error;
        }
    }
    const state = await readStore();
    const byTx = new Map<string, typeof state.events>();
    for (const e of state.events) byTx.set(e.txHash, [...(byTx.get(e.txHash) ?? []), e]);
    return {
      live,
      contributions: state.contributions
        .filter((c) => c.status !== "PREPARED" && c.status !== "EXPIRED")
        .map((c) => ({
          ...publicContribution(c),
          member: group.members.find((m) => m.id === c.memberId)?.displayName,
          explorerUrl: stellarExpertTx(c.txHash),
          payouts: payoutsFor(group, state.events, c.txHash),
          events: byTx.get(c.txHash) ?? [],
        })),
      events: state.events.map((e) => ({ ...e, explorerUrl: stellarExpertTx(e.txHash) })),
      releases: state.releases.map(({ xdr: _xdr, ...r }) => ({
        ...r,
        kind: r.kind ?? "release",
        explorerUrl: r.status === "SUCCESS" ? stellarExpertTx(r.txHash) : null,
      })),
    };
  });
}
