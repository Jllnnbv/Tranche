import { requireIntegration } from "@/lib/paiflow";
import { handle, InputError } from "@/lib/http";
import { checkRelease, signRelease } from "@/lib/tranche/vault";
import { jsonBody, requireSameOrigin, signedXdr } from "@/lib/tranche/request";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    requireIntegration();
    requireSameOrigin(request);
    const { id } = await params;
    if (!uuid.test(id)) throw new InputError("Invalid release id.");
    const body = await jsonBody(request, ["signedXdr"]);
    return signRelease(id, signedXdr(body.signedXdr));
  });
}
// Resolve a release whose submit outcome was uncertain.
export async function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    const { id } = await params;
    if (!uuid.test(id)) throw new InputError("Invalid release id.");
    return checkRelease(id);
  });
}
