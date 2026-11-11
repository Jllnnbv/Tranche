import { requireIntegration } from "@/lib/paiflow";
import { handle, InputError } from "@/lib/http";
import { reconcile } from "@/lib/tranche/ledger";
import { roundNumber } from "@/lib/tranche/request";

export async function GET(request: Request) {
  return handle(async () => {
    requireIntegration();
    const q = new URL(request.url).searchParams;
    const txHash = q.get("txHash") ?? "";
    if ([...q.keys()].some((k) => k !== "round" && k !== "txHash") || !/^[a-f0-9]{64}$/.test(txHash))
      throw new InputError("Supply round and a 64-hex txHash.");
    return reconcile(roundNumber(q.get("round")), txHash);
  });
}
