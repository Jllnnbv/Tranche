import { requireIntegration } from "@/lib/paiflow";
import { handle, InputError } from "@/lib/http";
import { cancelRelease } from "@/lib/tranche/vault";
import { requireSameOrigin } from "@/lib/tranche/request";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireIntegration();
    requireSameOrigin(request);
    const { id } = await params;
    if (!uuid.test(id)) throw new InputError("Invalid release id.");
    return cancelRelease(id);
  });
}
