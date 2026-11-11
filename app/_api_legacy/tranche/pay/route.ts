import { Networks } from "@stellar/stellar-sdk";
import {
  PaiflowError,
  capabilities,
  executeHash,
  prepareExecute,
  requireIntegration,
  submitExecute,
} from "@/lib/paiflow";
import { handle, InputError } from "@/lib/http";
import { getGroup, getRound, memberByKey } from "@/lib/tranche/registry";
import { readStore } from "@/lib/tranche/store";
import {
  activeRound,
  conflict,
  openContribution,
  publicContribution,
  reconcile,
  recordPrepared,
  recordResult,
  recordSigned,
} from "@/lib/tranche/ledger";
import {
  jsonBody,
  publicKey,
  requireSameOrigin,
  roundNumber,
  signedXdr,
} from "@/lib/tranche/request";

// {round, from} prepares this member's contribution; {round, signedXdr} submits it.
export async function POST(request: Request) {
  return handle(async () => {
    requireIntegration();
    requireSameOrigin(request);
    const body = await jsonBody(request, ["round", "from", "signedXdr"]);
    const round = roundNumber(body.round);
    if ("signedXdr" in body) {
      if ("from" in body) throw new InputError("Supply from or signedXdr, not both.");
      return submit(round, signedXdr(body.signedXdr));
    }
    return prepare(round, publicKey(body.from));
  });
}

async function prepare(round: number, from: string) {
  const group = getGroup();
  getRound(group, round);
  const member = memberByKey(group, from);
  if (!member)
    throw new PaiflowError(
      403,
      { code: "FORBIDDEN", message: "This wallet is not a member of the group." },
      null,
      null,
    );
  const state = await readStore();
  if (activeRound(group, state)?.index !== round)
    conflict(`Round ${round} is not the active round.`, "ROUND_NOT_ACTIVE");
  let open = openContribution(state, round, member.id);
  if (open?.status === "PREPARED" && !open.signedXdr) {
    if (Date.parse(open.expiresAt) > Date.now() + 15_000)
      // Same unsigned preparation again; never prepare a second payment while one is open.
      return {
        xdr: open.xdr,
        txHash: open.txHash,
        expiresAt: open.expiresAt,
        network: "testnet",
        networkPassphrase: Networks.TESTNET,
        amountStroops: open.amountStroops,
      };
    const checked = await reconcile(round, open.txHash);
    open = checked.status === "EXPIRED" ? undefined : open;
  }
  if (open)
    conflict(
      open.status === "SUCCESS"
        ? "This member already paid this round."
        : "This member has a payment in progress; check its status first.",
    );
  if ((await capabilities(round)).network !== "testnet")
    throw new InputError("Only Testnet transactions are allowed.");
  const prepared = await prepareExecute(
    { from, amount: group.contributionStroops },
    round,
  );
  await recordPrepared({
    round,
    memberId: member.id,
    from,
    amountStroops: group.contributionStroops,
    prepared,
  });
  return { ...prepared, amountStroops: group.contributionStroops };
}

async function submit(round: number, signed: string) {
  const record = await recordSigned(round, executeHash(signed), signed);
  try {
    const result = await submitExecute(
      // Always the first persisted envelope, so a retry never becomes a second payment.
      { signedXdr: record.signedXdr! },
      true,
      record.preparationRequestId,
      round,
    );
    return publicContribution(
      (await recordResult(record.txHash, result)) ?? record,
    );
  } catch (error) {
    const definite =
      error instanceof PaiflowError && [400, 401, 403, 422, 429].includes(error.status);
    if (!definite) await recordResult(record.txHash, { status: "UNKNOWN" });
    throw error;
  }
}
