import time
import uuid
from typing import Dict, Any, List, Optional
from stellar_sdk import (
    Server,
    TransactionEnvelope,
    TransactionBuilder,
    Network,
    Keypair,
    Payment,
    Asset,
    StrKey,
)
from stellar_sdk.time_bounds import TimeBounds
from backend.config import (
    HORIZON_URL,
    TRANCHE_VAULT_ACCOUNT,
    TRANCHE_FUND_ACCOUNT,
)
from backend.errors import PaiflowError
from backend.services.group_service import (
    get_group,
    get_round,
    member_by_id,
    receiver_round,
)
from backend.services.ledger_service import (
    read_store,
    save_store,
    vault_shares,
    round_status,
)

BASE_FEE = 100
RELEASE_WINDOW_SECONDS = 3600

def horizon() -> Server:
    return Server(HORIZON_URL)

def source_account(source: str) -> str:
    key = TRANCHE_VAULT_ACCOUNT if source == "vault" else TRANCHE_FUND_ACCOUNT
    if not key:
        raise PaiflowError(503, "CONFIGURATION", f"Set AMBAGAN_{source.upper()}_ACCOUNT to a G-address.")
    try:
        StrKey.decode_ed25519_public_key(key)
    except Exception:
        raise PaiflowError(503, "CONFIGURATION", f"Set AMBAGAN_{source.upper()}_ACCOUNT to a valid G-address.")
    return key

def parse_tx(xdr: str) -> TransactionEnvelope:
    try:
        return TransactionEnvelope.from_xdr(xdr, network_passphrase=Network.TESTNET_NETWORK_PASSPHRASE)
    except Exception as e:
        raise PaiflowError(422, "VALIDATION", f"Invalid envelope: {str(e)}")

def expire_stale(state: Dict[str, Any]):
    now_ts = time.time()
    for r in state.get("releases", []):
        if r.get("status") == "COLLECTING":
            exp_str = r.get("expiresAt", "")
            try:
                from datetime import datetime
                exp_ts = datetime.fromisoformat(exp_str.replace("Z", "+00:00")).timestamp()
                if exp_ts <= now_ts:
                    r["status"] = "EXPIRED"
                    r["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            except Exception:
                pass

async def prepare_state() -> Dict[str, Any]:
    state = read_store()
    expire_stale(state)
    save_store(state)
    return state

def multisig(source: str = "vault") -> Dict[str, Any]:
    acc_id = source_account(source)
    try:
        account = horizon().load_account(acc_id)
    except Exception as e:
        raise PaiflowError(503, "HORIZON_UNREACHABLE", f"Cannot load multisig account: {str(e)}")

    thresholds = account.thresholds
    med_threshold = max(thresholds.med_threshold, 1)

    master_weight = 0
    signers = []
    for s in account.signers:
        if s.key == account.account_id:
            master_weight = s.weight
        if s.type == "ed25519_public_key" and s.weight > 0:
            signers.append({"key": s.key, "weight": s.weight})

    return {
        "account": account.account_id,
        "threshold": med_threshold,
        "masterWeight": master_weight,
        "signers": signers,
        "balances": account.balances,
        "subentries": account.subentry_count,
    }

def create_payment(
    source: str,
    kind: str,
    member_id: str,
    round_num: int,
    destination: str,
    amount_stroops: int,
) -> Dict[str, Any]:
    if amount_stroops <= 0:
        raise PaiflowError(409, "CONFLICT", "The payment amount rounds to zero.")

    state = read_store()
    acc_id = source_account(source)
    account = horizon().load_account(acc_id)

    now = int(time.time())
    time_bounds = TimeBounds(min_time=now - 10, max_time=now + RELEASE_WINDOW_SECONDS)

    amount_xlm = f"{amount_stroops / 10_000_000:.7f}".rstrip("0").rstrip(".")
    if "." not in amount_xlm:
        amount_xlm += ".0"

    tx = (
        TransactionBuilder(
            source_account=account,
            network_passphrase=Network.TESTNET_NETWORK_PASSPHRASE,
            base_fee=BASE_FEE,
        )
        .add_time_bounds(time_bounds)
        .append_payment_op(
            destination=destination,
            asset=Asset.native(),
            amount=amount_xlm,
        )
        .build()
    )

    tx_hash = tx.hash().hex()
    expires_at = time.strftime(
        "%Y-%m-%dT%H:%M:%S.000Z",
        time.gmtime(now + RELEASE_WINDOW_SECONDS),
    )
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

    release = {
        "id": str(uuid.uuid4()),
        "source": source,
        "kind": kind,
        "memberId": member_id,
        "round": round_num,
        "destination": destination,
        "amountStroops": str(amount_stroops),
        "txHash": tx_hash,
        "xdr": tx.to_xdr(),
        "signers": [],
        "expiresAt": expires_at,
        "status": "COLLECTING",
        "createdAt": now_iso,
        "updatedAt": now_iso,
    }

    state.setdefault("releases", []).append(release)
    save_store(state)
    return release

def create_release(member_id: str, round_num: int) -> Dict[str, Any]:
    group = get_group()
    state = read_store()
    expire_stale(state)

    m = member_by_id(group, member_id)
    if not m or not m.get("publicKey"):
        raise PaiflowError(404, "NOT_FOUND", "Unknown member or member has no wallet.")

    own = receiver_round(group, member_id)
    if not own:
        raise PaiflowError(422, "VALIDATION", "This member is not the receiver in any round.")
    if round_num <= own["index"]:
        raise PaiflowError(422, "VALIDATION", "Tranches are released only after this member's receiver round.")

    round_obj = get_round(group, round_num)
    r_stat = round_status(group, state, round_num)
    if r_stat.get(member_id) != "paid":
        raise PaiflowError(409, "CONFLICT", f"Member {m['displayName']} has not paid round {round_num}.")

    existing = [
        r for r in state.get("releases", [])
        if r.get("source") == "vault" and r.get("memberId") == member_id and r.get("round") == round_num and r.get("status") not in ("FAILED", "EXPIRED")
    ]
    if existing:
        raise PaiflowError(409, "CONFLICT", f"Round {round_num} held ambagan is already released.")

    # Calculate release amount per round
    shares = vault_shares(group, state)
    m_share = next((s for s in shares if s["memberId"] == member_id), None)
    if not m_share or int(m_share.get("remainingStroops", "0")) <= 0:
        raise PaiflowError(409, "CONFLICT", "This member has no held ambagan left.")

    later_rounds = [r["index"] for r in group["rounds"] if r["index"] > own["index"]]
    portion = int(m_share["remainingStroops"]) // max(len(later_rounds), 1)

    return create_payment(
        source="vault",
        kind="release",
        member_id=member_id,
        round_num=round_num,
        destination=m["publicKey"],
        amount_stroops=max(portion, 1),
    )

def create_forfeit(round_num: int, late_member_id: str) -> Dict[str, Any]:
    group = get_group()
    state = read_store()
    expire_stale(state)

    r = get_round(group, round_num)
    receiver = member_by_id(group, r["receiverMemberId"])
    if not receiver or not receiver.get("publicKey"):
        raise PaiflowError(422, "VALIDATION", "Receiver has no wallet.")

    r_stat = round_status(group, state, round_num)
    if r_stat.get(late_member_id) != "late":
        raise PaiflowError(409, "CONFLICT", "This member is not late for this round.")

    existing = [
        rel for rel in state.get("releases", [])
        if rel.get("source") == "vault" and rel.get("kind") == "forfeit" and rel.get("round") == round_num and rel.get("memberId") == late_member_id and rel.get("status") not in ("FAILED", "EXPIRED")
    ]
    if existing:
        raise PaiflowError(409, "CONFLICT", "This held ambagan is already forfeited for this round.")

    shares = vault_shares(group, state)
    share = next((s for s in shares if s["memberId"] == late_member_id), None)
    remaining = int(share["remainingStroops"]) if share else 0
    if remaining <= 0:
        raise PaiflowError(409, "CONFLICT", "This member has no held ambagan left.")

    due = int(group["contributionStroops"])
    amount = min(remaining, due)

    return create_payment(
        source="vault",
        kind="forfeit",
        member_id=late_member_id,
        round_num=round_num,
        destination=receiver["publicKey"],
        amount_stroops=amount,
    )

def create_cover(round_num: int, missed_member_id: str) -> Dict[str, Any]:
    group = get_group()
    state = read_store()
    expire_stale(state)

    r = get_round(group, round_num)
    receiver = member_by_id(group, r["receiverMemberId"])
    if not receiver or not receiver.get("publicKey"):
        raise PaiflowError(422, "VALIDATION", "Receiver has no wallet.")

    r_stat = round_status(group, state, round_num)
    if r_stat.get(missed_member_id) != "late":
        raise PaiflowError(409, "CONFLICT", "This member is not late for this round.")

    existing = [
        rel for rel in state.get("releases", [])
        if rel.get("source") == "fund" and rel.get("kind") == "cover" and rel.get("round") == round_num and rel.get("memberId") == missed_member_id and rel.get("status") not in ("FAILED", "EXPIRED")
    ]
    if existing:
        raise PaiflowError(409, "CONFLICT", "Safety Fund cover is already requested for this member.")

    due = int(group["contributionStroops"])
    return create_payment(
        source="fund",
        kind="cover",
        member_id=missed_member_id,
        round_num=round_num,
        destination=receiver["publicKey"],
        amount_stroops=due,
    )

def cancel_release(release_id: str) -> Dict[str, Any]:
    state = read_store()
    rel = next((r for r in state.get("releases", []) if r["id"] == release_id), None)
    if not rel:
        raise PaiflowError(404, "NOT_FOUND", "No such release.")
    if rel.get("status") != "COLLECTING":
        raise PaiflowError(409, "CONFLICT", f"This payment is {rel.get('status')}.")
    if rel.get("signers"):
        raise PaiflowError(409, "CONFLICT", "A member already signed; let it expire instead.")

    rel["status"] = "EXPIRED"
    rel["error"] = "Cancelled before signing."
    rel["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    save_store(state)
    return rel

def sign_release(release_id: str, signed_xdr: str) -> Dict[str, Any]:
    state = read_store()
    rel = next((r for r in state.get("releases", []) if r["id"] == release_id), None)
    if not rel:
        raise PaiflowError(404, "NOT_FOUND", "No such release.")
    if rel.get("status") != "COLLECTING":
        raise PaiflowError(409, "CONFLICT", f"This payment is {rel.get('status')}.")

    rules = multisig(rel["source"])
    stored_te = parse_tx(rel["xdr"])
    incoming_te = parse_tx(signed_xdr)

    if incoming_te.hash().hex() != rel["txHash"]:
        raise PaiflowError(422, "VALIDATION", "This is not the payment transaction.")

    tx_hash_bytes = stored_te.hash()
    for sig in incoming_te.signatures:
        for s in rules["signers"]:
            kp = Keypair.from_public_key(s["key"])
            if kp.signature_hint() == sig.hint:
                try:
                    kp.verify(tx_hash_bytes, sig.signature)
                    if s["key"] not in rel["signers"]:
                        stored_te.signatures.append(sig)
                        rel["signers"].append(s["key"])
                except Exception:
                    pass

    rel["xdr"] = stored_te.to_xdr()
    rel["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    save_store(state)

    total_weight = sum(s["weight"] for s in rules["signers"] if s["key"] in rel["signers"])
    res = dict(rel)
    res["weight"] = total_weight
    res["threshold"] = rules["threshold"]

    if total_weight >= rules["threshold"]:
        submitted = submit_release(release_id)
        submitted["weight"] = total_weight
        submitted["threshold"] = rules["threshold"]
        return submitted

    return res

def submit_release(release_id: str) -> Dict[str, Any]:
    state = read_store()
    rel = next((r for r in state.get("releases", []) if r["id"] == release_id), None)
    if not rel:
        raise PaiflowError(404, "NOT_FOUND", "No such release.")

    rel["status"] = "PENDING"
    save_store(state)

    try:
        te = parse_tx(rel["xdr"])
        resp = horizon().submit_transaction(te)
        state = read_store()
        r_up = next((r for r in state.get("releases", []) if r["id"] == release_id), rel)
        r_up["status"] = "SUCCESS"
        save_store(state)
        return r_up
    except Exception as e:
        state = read_store()
        r_up = next((r for r in state.get("releases", []) if r["id"] == release_id), rel)
        err_msg = str(e)
        if "400" in err_msg:
            r_up["status"] = "FAILED"
            r_up["error"] = err_msg
        save_store(state)
        return r_up

def check_release(release_id: str) -> Dict[str, Any]:
    state = read_store()
    rel = next((r for r in state.get("releases", []) if r["id"] == release_id), None)
    if not rel:
        raise PaiflowError(404, "NOT_FOUND", "No such release.")
    if rel.get("status") != "PENDING":
        return rel

    try:
        tx = horizon().transactions().transaction(rel["txHash"]).call()
        rel["status"] = "SUCCESS" if tx.get("successful") else "FAILED"
    except Exception:
        pass
    save_store(state)
    return rel

def vault_overview() -> Dict[str, Any]:
    group = get_group()
    state = read_store()
    expire_stale(state)
    save_store(state)

    vault_view = None
    fund_view = None
    try:
        v_rules = multisig("vault")
        vault_view = {
            "account": v_rules["account"],
            "threshold": v_rules["threshold"],
            "masterWeight": v_rules["masterWeight"],
            "signers": [
                {
                    **s,
                    "member": next((m["displayName"] for m in group["members"] if m.get("publicKey") == s["key"]), None),
                }
                for s in v_rules["signers"]
            ],
            "nativeBalance": next((b["balance"] for b in v_rules.get("balances", []) if b.get("asset_type") == "native"), None),
        }
    except Exception:
        pass

    try:
        f_rules = multisig("fund")
        fund_view = {
            "account": f_rules["account"],
            "threshold": f_rules["threshold"],
            "masterWeight": f_rules["masterWeight"],
            "signers": [
                {
                    **s,
                    "member": next((m["displayName"] for m in group["members"] if m.get("publicKey") == s["key"]), None),
                }
                for s in f_rules["signers"]
            ],
            "nativeBalance": next((b["balance"] for b in f_rules.get("balances", []) if b.get("asset_type") == "native"), None),
        }
    except Exception:
        pass

    releases_list = []
    for r in state.get("releases", []):
        rules = v_rules if r.get("source") == "vault" else f_rules if fund_view else None
        weight = sum(s["weight"] for s in (rules.get("signers", []) if rules else []) if s["key"] in r.get("signers", [])) if rules else None
        threshold = rules.get("threshold") if rules else None

        item = {
            **r,
            "kind": r.get("kind", "release"),
            "xdr": r["xdr"] if r.get("status") == "COLLECTING" else None,
            "member": (member_by_id(group, r["memberId"]) or {}).get("displayName"),
            "weight": weight,
            "threshold": threshold,
        }
        releases_list.append(item)

    return {
        "shares": vault_shares(group, state),
        "vault": vault_view,
        "fund": fund_view,
        "releases": releases_list,
    }
