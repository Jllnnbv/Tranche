import { requireIntegration } from "@/lib/paiflow";
import { handle, InputError } from "@/lib/http";
import { createRelease } from "@/lib/tranche/vault";
import { jsonBody, requireSameOrigin, roundNumber } from "@/lib/tranche/request";

// The multisig is the authorization: this only builds an unsigned envelope for a ledger-confirmed payer.
export async function POST(request: Request) {
  return handle(async () => {
    requireIntegration();
    requireSameOrigin(request);
    const body = await jsonBody(request, ["memberId", "round"]);
    if (typeof body.memberId !== "string" || !body.memberId || body.memberId.length > 64)
      throw new InputError("Supply a memberId.");
    return createRelease(body.memberId, roundNumber(body.round));
  });
}
