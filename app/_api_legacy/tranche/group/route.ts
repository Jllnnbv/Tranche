import { publicConfig } from "@/lib/paiflow";
import { handle } from "@/lib/http";
import { getGroup } from "@/lib/tranche/registry";
import { readStore } from "@/lib/tranche/store";
import { activeRound, roundStatus } from "@/lib/tranche/ledger";

// Works in every mode: it reads only the group rules and the local ledger.
export async function GET() {
  return handle(async () => {
    const group = getGroup();
    const state = await readStore();
    return {
      ...group,
      mode: publicConfig().mode,
      vaultAccount: process.env.TRANCHE_VAULT_ACCOUNT ?? null,
      fundAccount: process.env.TRANCHE_FUND_ACCOUNT ?? null,
      activeRound: activeRound(group, state)?.index ?? null,
      rounds: group.rounds.map((r) => ({
        ...r,
        members: roundStatus(group, state, r.index),
      })),
    };
  });
}
