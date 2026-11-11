import { handle } from "@/lib/http";
import { vaultOverview } from "@/lib/tranche/vault";

export async function GET() {
  return handle(vaultOverview);
}
