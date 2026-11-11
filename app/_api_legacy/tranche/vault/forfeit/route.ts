import { requireIntegration } from "@/lib/paiflow";
import { handle, InputError } from "@/lib/http";
import { createForfeit } from "@/lib/tranche/vault";
import { jsonBody, requireSameOrigin, roundNumber } from "@/lib/tranche/request";

// A late member's held tranche goes to the round receiver. The Vault multisig is the vote.
export async function POST(request: Request) {
  return handle(async () => {
    requireIntegration();
    requireSameOrigin(request);
    const body = await jsonBody(request, ["memberId", "round"]);
    if (typeof body.memberId !== "string" || !body.memberId || body.memberId.length > 64)
      throw new InputError("Supply the memberId of the late member.");
    return createForfeit(roundNumber(body.round), body.memberId);
  });
}
