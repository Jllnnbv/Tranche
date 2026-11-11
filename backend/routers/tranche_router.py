import json
from pathlib import Path
from fastapi import APIRouter, Request, Query
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import time
from stellar_sdk import Network, StrKey
from backend.config import TRANCHE_VAULT_ACCOUNT, TRANCHE_FUND_ACCOUNT, BASE_DIR
from backend.services.auth_service import read_session_token, SESSION_COOKIE
from backend.services.paiflow_service import (
    require_integration,
    public_config,
    capabilities,
    prepare_execute,
    submit_execute,
    execute_hash,
)
from backend.services.group_service import (
    get_group,
    get_round,
    member_by_key,
    member_by_id,
)
from backend.services.ledger_service import (
    read_store,
    active_round,
    round_status,
    open_contribution,
    record_prepared,
    record_signed,
    record_result,
    reconcile,
    sync_events,
    public_contribution,
    payouts_for,
    vault_shares,
)
from backend.services.vault_service import (
    vault_overview,
    create_release,
    sign_release,
    cancel_release,
    check_release,
    create_forfeit,
    create_cover,
)
from backend.services.contract_service import (
    get_signatures,
    save_signature,
    reset_signatures,
)
from backend.errors import PaiflowError, InputError

router = APIRouter(prefix="/api/tranche", tags=["tranche"])

class PayRequest(BaseModel):
    round: int
    from_: Optional[str] = Field(None, alias="from")
    signedXdr: Optional[str] = None

class ActionRequest(BaseModel):
    memberId: str
    round: int

class SignRequest(BaseModel):
    signedXdr: str

@router.get("/group")
async def tranche_group():
    group = get_group()
    state = read_store()
    act = active_round(group, state)
    return {
        "data": {
            **group,
            "mode": public_config().get("mode"),
            "vaultAccount": TRANCHE_VAULT_ACCOUNT or None,
            "fundAccount": TRANCHE_FUND_ACCOUNT or None,
            "activeRound": act["index"] if act else None,
            "rounds": [
                {
                    **r,
                    "members": round_status(group, state, r["index"]),
                }
                for r in group["rounds"]
            ],
        }
    }

@router.get("/ledger")
async def tranche_ledger():
    group = get_group()
    live = True
    try:
        require_integration()
    except Exception:
        live = False

    if live:
        before = read_store()
        rounds = {c["round"] for c in before.get("contributions", [])}
        act = active_round(group, before)
        if act:
            rounds.add(act["index"])
        for r_num in rounds:
            try:
                for _ in range(5):
                    has_more = await sync_events(r_num)
                    if not has_more:
                        break
            except Exception:
                pass

    state = read_store()
    by_tx = {}
    for e in state.get("events", []):
        by_tx.setdefault(e.get("txHash", ""), []).append(e)

    contributions_public = [
        {
            **public_contribution(c),
            "member": (member_by_id(group, c["memberId"]) or {}).get("displayName"),
            "payouts": payouts_for(group, by_tx.get(c["txHash"], []), c["txHash"]),
        }
        for c in state.get("contributions", [])
        if c.get("status") not in ("PREPARED", "EXPIRED")
    ]

    return {
        "data": {
            "live": live,
            "contributions": contributions_public,
            "events": state.get("events", []),
            "releases": state.get("releases", []),
            "vaultShares": vault_shares(group, state),
            "roundMembers": {
                r["index"]: round_status(group, state, r["index"])
                for r in group["rounds"]
            },
        }
    }

@router.post("/pay")
async def tranche_pay(request: Request):
    require_integration()
    body = await request.json()
    round_num = body.get("round")
    if not isinstance(round_num, int) or round_num < 1 or round_num > 100:
        raise InputError("Supply a round number.")

    from_addr = body.get("from") or body.get("from_addr")
    signed_xdr = body.get("signedXdr")

    if signed_xdr:
        if from_addr:
            raise InputError("Supply from or signedXdr, not both.")
        return {"data": await _submit_pay(round_num, signed_xdr)}
    
    if not from_addr or not isinstance(from_addr, str):
        raise InputError("Supply a public G-address.")
    try:
        StrKey.decode_ed25519_public_key(from_addr)
    except Exception:
        raise InputError("Supply a public G-address.")

    return {"data": await _prepare_pay(round_num, from_addr)}

async def _prepare_pay(round_num: int, from_addr: str) -> Dict[str, Any]:
    group = get_group()
    get_round(group, round_num)
    member = member_by_key(group, from_addr)
    if not member:
        raise PaiflowError(403, "FORBIDDEN", "This wallet is not a member of the group.")

    state = read_store()
    act = active_round(group, state)
    if not act or act["index"] != round_num:
        raise PaiflowError(409, "ROUND_NOT_ACTIVE", f"Round {round_num} is not the active round.")

    open_c = open_contribution(state, round_num, member["id"])
    if open_c and open_c.get("status") == "PREPARED" and not open_c.get("signedXdr"):
        exp = open_c.get("expiresAt", "")
        try:
            from datetime import datetime
            exp_ts = datetime.fromisoformat(exp.replace("Z", "+00:00")).timestamp()
            if exp_ts > time.time() + 15:
                return {
                    "xdr": open_c["xdr"],
                    "txHash": open_c["txHash"],
                    "expiresAt": open_c["expiresAt"],
                    "network": "testnet",
                    "networkPassphrase": Network.TESTNET_NETWORK_PASSPHRASE,
                    "amountStroops": open_c["amountStroops"],
                }
        except Exception:
            pass

        checked = await reconcile(round_num, open_c["txHash"])
        if checked.get("status") == "EXPIRED":
            open_c = None

    if open_c:
        msg = (
            "This member already paid this round."
            if open_c.get("status") == "SUCCESS"
            else "This member has a payment in progress; check its status first."
        )
        raise PaiflowError(409, "CONFLICT", msg)

    cap = await capabilities(round_num)
    if cap.get("network") != "testnet":
        raise InputError("Only Testnet transactions are allowed.")

    prepared = await prepare_execute(
        {"from": from_addr, "amount": group["contributionStroops"]},
        round_num,
    )
    record_prepared(
        round_num=round_num,
        member_id=member["id"],
        from_addr=from_addr,
        amount_stroops=group["contributionStroops"],
        prepared=prepared,
    )
    return {**prepared, "amountStroops": group["contributionStroops"]}

async def _submit_pay(round_num: int, signed: str) -> Dict[str, Any]:
    tx_hash = execute_hash(signed)
    record = record_signed(round_num, tx_hash, signed)
    try:
        result = await submit_execute(
            {"signedXdr": record["signedXdr"]},
            wait=True,
            prep_request_id=record.get("preparationRequestId"),
            round_num=round_num,
        )
        updated = record_result(record["txHash"], result) or record
        return public_contribution(updated)
    except Exception as e:
        if isinstance(e, PaiflowError) and e.status_code in (400, 401, 403, 422, 429):
            raise e
        record_result(record["txHash"], {"status": "UNKNOWN"})
        raise e

@router.get("/pay/status")
async def tranche_pay_status(round: int = Query(...), txHash: str = Query(...)):
    require_integration()
    if not txHash or len(txHash) != 64:
        raise InputError("Supply round and a 64-hex txHash.")
    res = await reconcile(round, txHash)
    return {"data": res}

@router.get("/vault")
async def tranche_vault():
    return {"data": vault_overview()}

@router.post("/vault/release")
async def tranche_vault_release(req: ActionRequest):
    require_integration()
    res = create_release(req.memberId, req.round)
    return {"data": res}

@router.post("/vault/release/{id}/sign")
async def tranche_vault_sign(id: str, req: SignRequest):
    require_integration()
    res = sign_release(id, req.signedXdr)
    return {"data": res}

@router.get("/vault/release/{id}/sign")
async def tranche_vault_check(id: str):
    res = check_release(id)
    return {"data": res}

@router.post("/vault/release/{id}/cancel")
async def tranche_vault_cancel(id: str):
    require_integration()
    res = cancel_release(id)
    return {"data": res}

@router.post("/vault/forfeit")
async def tranche_vault_forfeit(req: ActionRequest):
    require_integration()
    res = create_forfeit(req.round, req.memberId)
    return {"data": res}

@router.post("/fund/cover")
async def tranche_fund_cover(req: ActionRequest):
    require_integration()
    res = create_cover(req.round, req.memberId)
    return {"data": res}

class ContractSignatureRequest(BaseModel):
    groupId: Optional[str] = "tranche-demo"
    signatoryId: str
    name: str
    email: Optional[str] = ""
    role: Optional[str] = ""
    type: str  # "drawn" or "typed"
    signatureData: str
    font: Optional[str] = None
    displayDate: Optional[str] = None
    termsAccepted: Optional[bool] = True

@router.get("/contract/signatures")
async def get_contract_signatures(groupId: str = Query("tranche-demo")):
    sigs = get_signatures(groupId)
    return {"data": sigs}

@router.post("/contract/signatures")
async def post_contract_signature(req: ContractSignatureRequest):
    data = req.model_dump()
    group_id = data.pop("groupId", "tranche-demo") or "tranche-demo"
    sigs = save_signature(group_id, data)
    return {"data": sigs}

@router.delete("/contract/signatures")
async def delete_contract_signatures(groupId: str = Query("tranche-demo")):
    res = reset_signatures(groupId)
    return {"data": res}

# --- User-scoped Ambagans Persistence ---
USER_AMBAGANS_FILE = BASE_DIR / "data" / "user_ambagans.json"

def _load_user_ambagans() -> Dict[str, List[Dict[str, Any]]]:
    if not USER_AMBAGANS_FILE.exists():
        return {}
    try:
        return json.loads(USER_AMBAGANS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}

def _save_user_ambagans(data: Dict[str, List[Dict[str, Any]]]) -> None:
    USER_AMBAGANS_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = USER_AMBAGANS_FILE.with_suffix(f".{time.time()}.tmp")
    tmp_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp_path.replace(USER_AMBAGANS_FILE)

@router.get("/user/ambagans")
async def get_user_ambagans(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    user_id = read_session_token(token)
    if not user_id:
        return {"data": []}
    all_data = _load_user_ambagans()
    return {"data": all_data.get(user_id, [])}

@router.post("/user/ambagans")
async def save_user_ambagan(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    user_id = read_session_token(token)
    if not user_id:
        raise PaiflowError(401, "UNAUTHORIZED", "Sign in required to save an ambagan.")
    payload = await request.json()
    all_data = _load_user_ambagans()
    user_list = all_data.get(user_id, [])
    item_id = payload.get("id")
    user_list = [item for item in user_list if item.get("id") != item_id]
    user_list.insert(0, payload)
    all_data[user_id] = user_list
    _save_user_ambagans(all_data)
    return {"data": payload}

@router.delete("/user/ambagans/{id}")
async def delete_user_ambagan(id: str, request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    user_id = read_session_token(token)
    if not user_id:
        raise PaiflowError(401, "UNAUTHORIZED", "Sign in required.")
    all_data = _load_user_ambagans()
    user_list = all_data.get(user_id, [])
    all_data[user_id] = [item for item in user_list if item.get("id") != id]
    _save_user_ambagans(all_data)
    return {"data": {"deleted": True}}


