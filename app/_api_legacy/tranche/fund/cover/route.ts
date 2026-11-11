import { requireIntegration } from "@/lib/paiflow";
import { handle, InputError } from "@/lib/http";
import { createCover } from "@/lib/tranche/vault";
import { jsonBody, requireSameOrigin, roundNumber } from "@/lib/tranche/request";

// Safety Fund pays the round receiver for a member who missed the deadline. The Fund multisig is the vote.
export async function POST(request: Request) {
  return handle(async () => {
    requireIntegration();
    requireSameOrigin(request);
    const body = await jsonBody(request, ["memberId", "round"]);
    if (typeof body.memberId !== "string" || !body.memberId || body.memberId.length > 64)
      throw new InputError("Supply the memberId of the member who missed the payment.");
    return createCover(roundNumber(body.round), body.memberId);
  });
}
