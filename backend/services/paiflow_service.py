import time
import httpx
from typing import Optional, Dict, Any, List, Union
from stellar_sdk import TransactionEnvelope, Network
from backend.config import (
    PAIFLOW_MODE,
    PAIFLOW_BASE_URL,
    PAIFLOW_API_TOKEN,
    PAIFLOW_DEPLOYMENT_ID,
    get_rounds_config,
)
from backend.errors import PaiflowError

demo_cache = {}

def mode() -> str:
    m = PAIFLOW_MODE.lower()
    if m not in ("prepare", "demo", "team"):
        return "prepare"
    return m

def require_integration() -> str:
    m = mode()
    if m == "prepare":
        raise PaiflowError(
            503,
            "CONFIGURATION",
            "Set PAIFLOW_MODE in .env.local to team or demo before making live requests.",
        )
    return m

def public_config() -> Dict[str, Any]:
    try:
        m = mode()
        if m == "prepare":
            return {"mode": m, "deploymentUrl": None}
        elif m == "demo":
            return {"mode": m, "deploymentUrl": None}
        elif m == "team":
            return {
                "mode": m,
                "deploymentUrl": f"{PAIFLOW_BASE_URL}/deployments/{PAIFLOW_DEPLOYMENT_ID}",
            }
        return {"mode": "disabled", "deploymentUrl": None}
    except PaiflowError as e:
        return {"mode": "disabled", "deploymentUrl": None, "message": e.message}

def team_config(round_num: Optional[int] = None) -> Dict[str, str]:
    token = PAIFLOW_API_TOKEN
    dep_id = PAIFLOW_DEPLOYMENT_ID
    if round_num is not None:
        rounds = get_rounds_config()
        r_conf = next((r for r in rounds if r.get("round") == round_num), None)
        if r_conf:
            token = r_conf.get("token", token)
            dep_id = r_conf.get("deploymentId", dep_id)

    if not dep_id or not token:
        raise PaiflowError(
            503,
            "CONFIGURATION",
            "Set PAIFLOW_DEPLOYMENT_ID and PAIFLOW_API_TOKEN in .env.local.",
        )
    return {"origin": PAIFLOW_BASE_URL, "deploymentId": dep_id, "token": token}

async def get_demo_token(origin: str) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{origin}/api/v1/demo-token",
            headers={"Content-Type": "application/json"},
            json={},
        )
        if not resp.is_success:
            raise PaiflowError(
                resp.status_code,
                "UPSTREAM_RPC",
                f"Failed to obtain demo token: HTTP {resp.status_code}",
            )
        data = resp.json()
        return data.get("data", data)

async def get_config(round_num: Optional[int] = None) -> Dict[str, str]:
    if require_integration() == "team":
        return team_config(round_num)
    
    origin = PAIFLOW_BASE_URL
    cache = demo_cache.get(origin, {})
    now = time.time() * 1000
    if cache.get("demo") and now < cache["demo"]["expires"] - 120000:
        return cache["demo"]

    val = await get_demo_token(origin)
    expires = time.time() * 1000 + 3600 * 1000
    conf = {
        "origin": origin,
        "token": val["token"],
        "deploymentId": val["deploymentId"],
        "expires": expires,
    }
    demo_cache[origin] = {"demo": conf}
    return conf

async def call(
    endpoint: str,
    method: str = "GET",
    body: Optional[Any] = None,
    params: Optional[Dict[str, Any]] = None,
    public_path: Optional[str] = None,
    extra_headers: Optional[Dict[str, str]] = None,
    round_num: Optional[int] = None,
) -> Any:
    conf = await get_config(round_num)
    origin = conf["origin"]
    deployment_id = conf["deploymentId"]
    token = conf["token"]

    if public_path:
        url = f"{origin}/api/deployments/{deployment_id}/{public_path}"
    else:
        url = f"{origin}/api/v1/deployments/{deployment_id}/{endpoint}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method=method,
            url=url,
            params=params,
            json=body if body is not None else None,
            headers=headers,
        )

    req_id = response.headers.get("x-request-id")
    retry_after = response.headers.get("retry-after")

    try:
        val = response.json()
    except Exception:
        raise PaiflowError(
            502 if response.is_success else response.status_code,
            "UPSTREAM_RPC",
            f"Unexpected Paiflow response HTTP {response.status_code}",
            request_id=req_id,
            retry_after=retry_after,
        )

    if not response.is_success or "error" in val:
        err = val.get("error", {})
        raise PaiflowError(
            status_code=response.status_code,
            code=err.get("code", f"HTTP_{response.status_code}"),
            message=err.get("message", "Paiflow request failed"),
            retry_after=retry_after,
            request_id=req_id,
            fields=err.get("fields"),
            details=err.get("details"),
        )

    return val.get("data", val)

def execute_hash(xdr: str) -> str:
    try:
        te = TransactionEnvelope.from_xdr(xdr, network_passphrase=Network.TESTNET_NETWORK_PASSPHRASE)
        return te.hash().hex()
    except Exception as e:
        raise PaiflowError(422, "VALIDATION", f"Invalid XDR envelope: {str(e)}")

async def capabilities(round_num: Optional[int] = None) -> Dict[str, Any]:
    return await call("capabilities", "GET", round_num=round_num)

async def prepare_execute(body: Dict[str, Any], round_num: Optional[int] = None) -> Dict[str, Any]:
    res = await call("execute", "POST", body=body, public_path="execute/prepare", round_num=round_num)
    res["txHash"] = execute_hash(res["xdr"])
    return res

async def submit_execute(
    body: Dict[str, Any],
    wait: bool = True,
    prep_request_id: Optional[str] = None,
    round_num: Optional[int] = None,
) -> Dict[str, Any]:
    headers = {}
    if prep_request_id:
        headers["x-preparation-request-id"] = prep_request_id
    params = {"wait": "true" if wait else "false"}
    return await call(
        "execute",
        "POST",
        body=body,
        params=params,
        public_path="execute/submit",
        extra_headers=headers,
        round_num=round_num,
    )

async def list_events(cursor: Optional[str] = None, round_num: Optional[int] = None) -> Dict[str, Any]:
    params = {}
    if cursor:
        params["cursor"] = cursor
    return await call("events", "GET", params=params, round_num=round_num)

async def transaction_status(tx_hash: str, round_num: Optional[int] = None) -> Dict[str, Any]:
    return await call("transactions", "GET", params={"txHash": tx_hash}, round_num=round_num)

async def prepare_payout(body: Dict[str, Any]) -> Dict[str, Any]:
    return await call("payouts", "POST", body=body, public_path="payouts/prepare")

async def submit_payout(body: Dict[str, Any], wait: bool = True) -> Dict[str, Any]:
    params = {"wait": "true" if wait else "false"}
    return await call("payouts", "POST", body=body, params=params, public_path="payouts/submit")

async def balances() -> Dict[str, Any]:
    return await call("balances", "GET")

async def funding_discovery() -> Dict[str, Any]:
    return await call("funding", "GET")

async def prepare_funding(body: Dict[str, Any]) -> Dict[str, Any]:
    return await call("funding", "POST", body=body, public_path="funding/prepare")

async def submit_funding(body: Dict[str, Any]) -> Dict[str, Any]:
    return await call("funding", "POST", body=body, public_path="funding/submit")

async def reconcile_funding(body: Dict[str, Any]) -> Dict[str, Any]:
    return await call("funding", "POST", body=body, public_path="funding/reconcile")

async def schedule_state(node_id: Optional[str] = None) -> Dict[str, Any]:
    params = {"nodeId": node_id} if node_id else {}
    return await call("scheduleState", "GET", params=params)

async def prepare_schedule(action: str, body: Dict[str, Any]) -> Dict[str, Any]:
    return await call("scheduleControls", "POST", body=body, public_path=f"schedule/{action}/prepare")

async def submit_schedule(action: str, body: Dict[str, Any]) -> Dict[str, Any]:
    return await call("scheduleControls", "POST", body=body, public_path=f"schedule/{action}/submit")

async def reconcile_schedule(action: str, body: Dict[str, Any]) -> Dict[str, Any]:
    return await call("scheduleControls", "POST", body=body, public_path=f"schedule/{action}/reconcile")

async def subscription_state() -> Dict[str, Any]:
    return await call("subscriptionState", "GET")

async def prepare_subscription(action: str, body: Dict[str, Any]) -> Dict[str, Any]:
    return await call(
        "subscriptionCancel" if action == "cancel" else "subscriptionReactivate",
        "POST",
        body=body,
        public_path=f"subscription/{action}/prepare",
    )

async def submit_subscription(action: str, body: Dict[str, Any]) -> Dict[str, Any]:
    return await call(
        "subscriptionCancel" if action == "cancel" else "subscriptionReactivate",
        "POST",
        body=body,
        public_path=f"subscription/{action}/submit",
    )

async def reconcile_subscription(action: str, body: Dict[str, Any]) -> Dict[str, Any]:
    return await call(
        "subscriptionCancel" if action == "cancel" else "subscriptionReactivate",
        "POST",
        body=body,
        public_path=f"subscription/{action}/reconcile",
    )

async def prepare_allowance(body: Dict[str, Any]) -> Dict[str, Any]:
    return await call("subscriptionAllowance", "POST", body=body, public_path="subscription/allowance/prepare")

async def submit_allowance(body: Dict[str, Any]) -> Dict[str, Any]:
    return await call("subscriptionAllowance", "POST", body=body, public_path="subscription/allowance/submit")

async def allowance_status(intent: str) -> Dict[str, Any]:
    return await call("subscriptionAllowance", "GET", params={"intent": intent})
