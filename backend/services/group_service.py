import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from stellar_sdk import StrKey
from backend.config import GROUP_FILE
from backend.errors import PaiflowError

def is_bps(v: Any) -> bool:
    return isinstance(v, int) and 0 <= v <= 10000

def is_key(v: Any) -> bool:
    if v is None:
        return True
    if not isinstance(v, str):
        return False
    try:
        StrKey.decode_ed25519_public_key(v)
        return True
    except Exception:
        return False

def validate_group(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raise PaiflowError(503, "CONFIGURATION", "Group config: expected an object.")
    
    g = raw
    if not isinstance(g.get("id"), str) or not isinstance(g.get("name"), str):
        raise PaiflowError(503, "CONFIGURATION", "Group config: id and name are required.")
    
    cs = g.get("contributionStroops")
    if not isinstance(cs, str) or not cs.isdigit() or int(cs) <= 0:
        raise PaiflowError(503, "CONFIGURATION", "Group config: contributionStroops must be positive integer stroops.")
    
    members = g.get("members")
    if not isinstance(members, list) or len(members) < 4 or len(members) > 10:
        raise PaiflowError(503, "CONFIGURATION", "Group config: a group has 4 to 10 members.")
    
    ids = set()
    slots = set()
    keys = []
    for m in members:
        mid = m.get("id")
        slot = m.get("slot")
        pk = m.get("publicKey")
        if not isinstance(mid, str) or mid in ids:
            raise PaiflowError(503, "CONFIGURATION", "Group config: duplicate member id.")
        if not isinstance(slot, int) or slot in slots:
            raise PaiflowError(503, "CONFIGURATION", "Group config: each member needs a unique slot.")
        if not is_key(pk):
            raise PaiflowError(503, "CONFIGURATION", f"Group config: member {mid} has an invalid public key.")
        ids.add(mid)
        slots.add(slot)
        if pk:
            keys.append(pk)
            
    if len(set(keys)) != len(keys):
        raise PaiflowError(503, "CONFIGURATION", "Group config: duplicate member public key.")
    
    rounds = g.get("rounds")
    if not isinstance(rounds, list) or not rounds:
        raise PaiflowError(503, "CONFIGURATION", "Group config: rounds are required.")
    
    indexes = set()
    for r in rounds:
        idx = r.get("index")
        if not isinstance(idx, int) or idx < 1 or idx in indexes:
            raise PaiflowError(503, "CONFIGURATION", "Group config: each round needs a unique positive index.")
        indexes.add(idx)
        
        rcv = r.get("receiverMemberId")
        if rcv not in ids:
            raise PaiflowError(503, "CONFIGURATION", f"Group config: round {idx} receiver is not a member.")
        
        split = r.get("splitBps", {})
        now_b = split.get("now")
        vault_b = split.get("vault")
        fund_b = split.get("fund")
        if not (is_bps(now_b) and is_bps(vault_b) and is_bps(fund_b)) or (now_b + vault_b + fund_b != 10000):
            raise PaiflowError(503, "CONFIGURATION", f"Group config: round {idx} splitBps must sum to 10000.")
            
    destinations = g.get("destinations", [])
    if not isinstance(destinations, list):
        raise PaiflowError(503, "CONFIGURATION", "Group config: destinations must be an array.")
    for d in destinations:
        if d.get("slot") not in slots or not isinstance(d.get("label"), str) or not is_bps(d.get("percentBps")):
            raise PaiflowError(503, "CONFIGURATION", "Group config: each destination needs a member slot, label and percentBps.")
        if not is_key(d.get("publicKey")):
            raise PaiflowError(503, "CONFIGURATION", f"Group config: destination {d.get('label')} has an invalid key.")
            
    rounds.sort(key=lambda x: x["index"])
    return g

def get_group() -> Dict[str, Any]:
    path = Path(GROUP_FILE)
    if not path.exists():
        raise PaiflowError(503, "CONFIGURATION", f"Group config file {GROUP_FILE} is missing.")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return validate_group(raw)
    except Exception as e:
        if isinstance(e, PaiflowError):
            raise e
        raise PaiflowError(503, "CONFIGURATION", "config/group.json is missing or is not JSON.")

def get_round(group: Dict[str, Any], index: int) -> Dict[str, Any]:
    r = next((rnd for rnd in group["rounds"] if rnd["index"] == index), None)
    if not r:
        raise PaiflowError(404, "NOT_FOUND", f"Round {index} does not exist.")
    return r

def member_by_id(group: Dict[str, Any], member_id: str) -> Optional[Dict[str, Any]]:
    return next((m for m in group["members"] if m["id"] == member_id), None)

def member_by_key(group: Dict[str, Any], key: str) -> Optional[Dict[str, Any]]:
    return next((m for m in group["members"] if m.get("publicKey") == key), None)

def receiver_round(group: Dict[str, Any], member_id: str) -> Optional[Dict[str, Any]]:
    return next((r for r in group["rounds"] if r.get("receiverMemberId") == member_id), None)
