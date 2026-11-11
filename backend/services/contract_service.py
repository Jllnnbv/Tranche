import json
import os
from typing import Dict, Any, Optional
from datetime import datetime, timezone

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "contract_signatures.json")

def _read_data() -> Dict[str, Any]:
    if not os.path.exists(DATA_FILE):
        return {}
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _write_data(data: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def get_signatures(group_id: str = "tranche-demo") -> Dict[str, Any]:
    all_sigs = _read_data()
    return all_sigs.get(group_id, {})

def save_signature(group_id: str, sig_record: Dict[str, Any]) -> Dict[str, Any]:
    all_sigs = _read_data()
    if group_id not in all_sigs:
        all_sigs[group_id] = {}
    
    key = sig_record.get("signatoryId") or sig_record.get("role") or "unknown"
    now = datetime.now(timezone.utc)
    if not sig_record.get("signedAt"):
        sig_record["signedAt"] = now.isoformat()
    if not sig_record.get("displayDate"):
        sig_record["displayDate"] = now.strftime("%d / %m / %Y")
        
    all_sigs[group_id][key] = sig_record
    _write_data(all_sigs)
    return all_sigs[group_id]

def reset_signatures(group_id: str = "tranche-demo") -> Dict[str, Any]:
    all_sigs = _read_data()
    all_sigs[group_id] = {}
    _write_data(all_sigs)
    return {}
