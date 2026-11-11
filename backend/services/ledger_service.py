import os
import json
import time
import uuid
from pathlib import Path
from typing import Dict, Any, List, Optional, Set
from backend.config import DATA_FILE, TRANCHE_VAULT_ACCOUNT, TRANCHE_FUND_ACCOUNT
from backend.errors import PaiflowError
from backend.services.group_service import (
    get_group,
    get_round,
    member_by_id,
    member_by_key,
    receiver_round,
)
from backend.services.paiflow_service import list_events, transaction_status

SETTLED = {"FAILED", "REJECTED", "EXPIRED"}

def empty_state() -> Dict[str, Any]:
    return {
        "contributions": [],
        "events": [],
        "eventCursors": {},
        "releases": [],
    }

def read_store() -> Dict[str, Any]:
    path = Path(DATA_FILE)
    if not path.exists():
        return empty_state()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        res = empty_state()
        res.update(data)
        return res
    except Exception:
        raise PaiflowError(500, "STORE_UNREADABLE", "Ambagan ledger file is unreadable.")

def save_store(state: Dict[str, Any]) -> None:
    path = Path(DATA_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f".{os.getpid()}.tmp")
    tmp_path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    tmp_path.replace(path)

def open_contribution(state: Dict[str, Any], round_num: int, member_id: str) -> Optional[Dict[str, Any]]:
    for c in state.get("contributions", []):
        if c.get("round") == round_num and c.get("memberId") == member_id and c.get("status") not in SETTLED:
            return c
    return None

def record_prepared(round_num: int, member_id: str, from_addr: str, amount_stroops: str, prepared: Dict[str, Any]) -> Dict[str, Any]:
    state = read_store()
    if open_contribution(state, round_num, member_id):
        raise PaiflowError(409, "CONFLICT", "This member already has an open payment for this round.")
    
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    record = {
        "id": str(uuid.uuid4()),
        "round": round_num,
        "memberId": member_id,
        "from": from_addr,
        "amountStroops": amount_stroops,
        "txHash": prepared["txHash"],
        "status": "PREPARED",
        "xdr": prepared.get("xdr", ""),
        "expiresAt": prepared.get("expiresAt", now_iso),
        "preparationRequestId": prepared.get("preparationRequestId"),
        "createdAt": now_iso,
        "updatedAt": now_iso,
    }
    state["contributions"].append(record)
    save_store(state)
    return record

def record_signed(round_num: int, tx_hash: str, signed_xdr: str) -> Dict[str, Any]:
    state = read_store()
    record = next(
        (c for c in state["contributions"] if c.get("round") == round_num and c.get("txHash") == tx_hash),
        None,
    )
    if not record:
        raise PaiflowError(404, "NOT_FOUND", "No prepared Ambagan payment has this hash.")
    if record.get("status") not in ("PREPARED", "PENDING", "UNKNOWN"):
        raise PaiflowError(409, "CONFLICT", f"This payment is already {record.get('status')}.")
    
    if "signedXdr" not in record or not record["signedXdr"]:
        record["signedXdr"] = signed_xdr
    record["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    save_store(state)
    return dict(record)

def record_result(tx_hash: str, result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    state = read_store()
    record = next((c for c in state["contributions"] if c.get("txHash") == tx_hash), None)
    if not record:
        return None
    if record.get("status") != "SUCCESS":
        record["status"] = result.get("status")
    if "ledger" in result and result["ledger"] is not None:
        record["ledger"] = result["ledger"]
    if "error" in result and result["error"]:
        record["error"] = result["error"]
    record["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    save_store(state)
    return dict(record)

def public_contribution(c: Dict[str, Any]) -> Dict[str, Any]:
    res = dict(c)
    res.pop("signedXdr", None)
    res.pop("xdr", None)
    return res

async def reconcile(round_num: int, tx_hash: str) -> Dict[str, Any]:
    state = read_store()
    record = next(
        (c for c in state["contributions"] if c.get("round") == round_num and c.get("txHash") == tx_hash),
        None,
    )
    if not record:
        raise PaiflowError(404, "NOT_FOUND", "No Ambagan payment has this hash.")
    if record.get("status") == "SUCCESS":
        return public_contribution(record)
    
    try:
        status = await transaction_status(tx_hash, round_num)
        updated = record_result(
            tx_hash,
            {
                "status": status.get("status"),
                "ledger": status.get("ledger"),
                "error": status.get("error"),
            },
        )
        return public_contribution(updated or record)
    except PaiflowError as e:
        if e.status_code == 404 and record.get("status") == "PREPARED" and not record.get("signedXdr"):
            exp = record.get("expiresAt")
            if exp:
                try:
                    exp_time = time.mktime(time.strptime(exp[:19], "%Y-%m-%dT%H:%M:%S"))
                    if exp_time < time.time():
                        updated = record_result(tx_hash, {"status": "EXPIRED"})
                        return public_contribution(updated or record)
                except Exception:
                    pass
        raise e

async def sync_events(round_num: int) -> bool:
    state = read_store()
    cursor = state.get("eventCursors", {}).get(str(round_num))
    page = await list_events(cursor=cursor, round_num=round_num)
    
    seen = {e["eventId"] for e in state.get("events", [])}
    fresh = []
    for item in page.get("items", []):
        if item["eventId"] not in seen:
            seen.add(item["eventId"])
            ev = dict(item)
            ev["round"] = round_num
            fresh.append(ev)
            
    state.setdefault("events", []).extend(fresh)
    if page.get("nextCursor"):
        state.setdefault("eventCursors", {})[str(round_num)] = page["nextCursor"]
    save_store(state)
    
    await import_hosted(round_num, fresh)
    return bool(page.get("hasMore", False))

async def import_hosted(round_num: int, items: List[Dict[str, Any]]):
    group = get_group()
    for item in items:
        if item.get("kind") != "RECEIVE":
            continue
        data = item.get("data") or {}
        from_addr = data.get("from")
        amount = data.get("amount")
        if not isinstance(from_addr, str) or not isinstance(amount, str) or not amount.isdigit():
            continue
        member = member_by_key(group, from_addr)
        if not member or int(amount) < int(group["contributionStroops"]):
            continue
            
        state = read_store()
        open_c = open_contribution(state, round_num, member["id"])
        if open_c and not (open_c.get("status") == "PREPARED" and not open_c.get("signedXdr")):
            continue
        if any(c.get("txHash") == item.get("txHash") for c in state["contributions"]):
            continue
            
        try:
            status = await transaction_status(item["txHash"], round_num)
        except Exception:
            continue
            
        if status.get("status") != "SUCCESS":
            continue
            
        state = read_store()
        stale = open_contribution(state, round_num, member["id"])
        if stale:
            stale["status"] = "EXPIRED"
            stale["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        state["contributions"].append({
            "id": str(uuid.uuid4()),
            "round": round_num,
            "memberId": member["id"],
            "from": from_addr,
            "amountStroops": str(amount),
            "txHash": item["txHash"],
            "status": "SUCCESS",
            "xdr": "",
            "expiresAt": item.get("occurredAt", now_iso),
            "ledger": status.get("ledger") or item.get("ledger"),
            "source": "hosted",
            "createdAt": item.get("occurredAt", now_iso),
            "updatedAt": now_iso,
        })
        save_store(state)

def label_for(group: Dict[str, Any], round_num: int, address: str) -> str:
    if address == TRANCHE_VAULT_ACCOUNT:
        return "Vault"
    if address == TRANCHE_FUND_ACCOUNT:
        return "Fund"
    r = next((x for x in group["rounds"] if x["index"] == round_num), None)
    receiver = member_by_id(group, r["receiverMemberId"]) if r else None
    if receiver:
        dest = next(
            (d for d in group.get("destinations", []) if d.get("slot") == receiver["slot"] and d.get("publicKey") == address),
            None,
        )
        if dest:
            return dest["label"]
    m = member_by_key(group, address)
    return m["displayName"] if m else "Other"

def payouts_for(group: Dict[str, Any], events: List[Dict[str, Any]], tx_hash: str) -> List[Dict[str, Any]]:
    receive = next((e for e in events if e.get("txHash") == tx_hash and e.get("kind") == "RECEIVE"), None)
    payout = next((e for e in events if e.get("txHash") == tx_hash and e.get("kind") == "PAYOUT"), None)
    if not payout:
        return []
    
    total = (receive.get("data") or {}).get("amount") if receive else None
    recipients = (payout.get("data") or {}).get("recipients") or []
    if not isinstance(recipients, list):
        return []
        
    rows = [r for r in recipients if isinstance(r, dict) and isinstance(r.get("address"), str) and isinstance(r.get("bps"), int)]
    reported = all(isinstance(r.get("amount"), str) and r["amount"] != "0" and r["amount"].isdigit() for r in rows)
    
    remaining = int(total) if isinstance(total, str) and total.isdigit() else 0
    res = []
    for i, r in enumerate(rows):
        if reported:
            amt = int(r["amount"])
        elif not (isinstance(total, str) and total.isdigit()):
            amt = 0
        elif i == len(rows) - 1:
            amt = remaining
        else:
            amt = (int(total) * r["bps"]) // 10000
        remaining -= amt
        res.append({
            "label": label_for(group, payout.get("round", 1), r["address"]),
            "address": r["address"],
            "bps": r["bps"],
            "amountStroops": str(amt),
        })
    return res

def round_status(group: Dict[str, Any], state: Dict[str, Any], index: int) -> Dict[str, str]:
    round_obj = get_round(group, index)
    try:
        dl_str = round_obj.get("deadline", "")
        # Remove trailing Z for strptime if needed
        dl_str_clean = dl_str.replace("Z", "+00:00")
        from datetime import datetime
        late = datetime.fromisoformat(dl_str_clean).timestamp() < time.time()
    except Exception:
        late = False
        
    res = {}
    for m in group["members"]:
        c = open_contribution(state, index, m["id"])
        if c and c.get("status") == "SUCCESS":
            st = "paid"
        elif c and c.get("status") != "PREPARED":
            st = "pending"
        elif late:
            st = "late"
        else:
            st = "due"
        res[m["id"]] = st
    return res

def active_round(group: Dict[str, Any], state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    from datetime import datetime
    now_ts = time.time()
    for r in group["rounds"]:
        try:
            dl_str = r.get("deadline", "").replace("Z", "+00:00")
            not_expired = datetime.fromisoformat(dl_str).timestamp() >= now_ts
        except Exception:
            not_expired = True
            
        if not_expired:
            statuses = round_status(group, state, r["index"])
            if any(s != "paid" for s in statuses.values()):
                return r
    return None

def vault_shares(group: Dict[str, Any], state: Dict[str, Any]) -> List[Dict[str, Any]]:
    vault_acc = TRANCHE_VAULT_ACCOUNT
    shares = []
    for m in group["members"]:
        own = receiver_round(group, m["id"])
        held = 0
        if own:
            round_events = [e for e in state.get("events", []) if e.get("round") == own["index"]]
            paid_out = set()
            for e in round_events:
                if e.get("kind") == "PAYOUT" and e.get("txHash") not in paid_out:
                    paid_out.add(e.get("txHash"))
                    for p in payouts_for(group, round_events, e["txHash"]):
                        if vault_acc and p["address"] == vault_acc:
                            held += int(p["amountStroops"])
            for c in state.get("contributions", []):
                if c.get("round") == own["index"] and c.get("status") == "SUCCESS" and c.get("txHash") not in paid_out:
                    v_bps = own.get("splitBps", {}).get("vault", 0)
                    held += (int(c["amountStroops"]) * v_bps) // 10000
                    
        released = 0
        for r in state.get("releases", []):
            if r.get("source") == "vault" and r.get("memberId") == m["id"] and r.get("status") == "SUCCESS":
                released += int(r.get("amountStroops", "0"))
                
        later_rounds = [r["index"] for r in group["rounds"] if r["index"] > own["index"]] if own else []
        released_rounds = {
            r.get("round") for r in state.get("releases", [])
            if r.get("source") == "vault" and r.get("memberId") == m["id"] and r.get("status") == "SUCCESS"
        }
        payments_due = len([rnd for rnd in later_rounds if rnd not in released_rounds])
        
        shares.append({
            "memberId": m["id"],
            "receiverRound": own["index"] if own else None,
            "heldStroops": str(held),
            "releasedStroops": str(released),
            "remainingStroops": str(held - released),
            "paymentsDue": payments_due,
        })
    return shares
