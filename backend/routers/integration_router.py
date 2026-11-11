from fastapi import APIRouter, Request, Query
from typing import Optional, Dict, Any
from backend.services.paiflow_service import (
    require_integration,
    capabilities,
    balances,
    funding_discovery,
    schedule_state,
    subscription_state,
    transaction_status,
    allowance_status,
    prepare_funding,
    submit_funding,
    reconcile_funding,
    prepare_schedule,
    submit_schedule,
    reconcile_schedule,
    prepare_subscription,
    submit_subscription,
    reconcile_subscription,
    prepare_allowance,
    submit_allowance,
    public_config,
)
from backend.errors import InputError, PaiflowError

router = APIRouter(prefix="/api/integration", tags=["integration"])

@router.get("")
async def get_integration(
    read: str = Query(...),
    nodeId: Optional[str] = Query(None),
    amount: Optional[str] = Query(None),
    txHash: Optional[str] = Query(None),
    intent: Optional[str] = Query(None),
):
    require_integration()
    if read == "capabilities":
        c = await capabilities()
        return {
            "data": {
                "deploymentId": c.get("deploymentId"),
                "network": c.get("network"),
                "triggerType": c.get("triggerType"),
                "configurationSource": c.get("configurationSource"),
                "inputAsset": c.get("inputAsset"),
                "operations": c.get("operations", {}),
                "applicationAuthorization": {
                    "schedule": {"pause": True, "resume": True, "retrieve": True},
                    "releaseEarly": True,
                },
            }
        }
    elif read == "balances":
        return {"data": await balances()}
    elif read == "funding":
        return {"data": await funding_discovery()}
    elif read == "schedule":
        return {"data": await schedule_state(node_id=nodeId)}
    elif read == "subscription":
        return {"data": await subscription_state()}
    elif read == "transaction":
        if not txHash or len(txHash) != 64:
            raise InputError("Invalid txHash.")
        return {"data": await transaction_status(txHash)}
    elif read == "allowance":
        if not intent:
            raise InputError("Invalid intent.")
        return {"data": await allowance_status(intent)}
    else:
        raise InputError(f"Unsupported read action: {read}")

@router.post("")
async def post_integration(request: Request):
    require_integration()
    body = await request.json()
    action = body.get("action")
    if not action:
        raise InputError("Missing action in body.")

    if action == "funding.prepare":
        return {"data": await prepare_funding(body)}
    elif action == "funding.submit":
        return {"data": await submit_funding(body)}
    elif action == "funding.reconcile":
        return {"data": await reconcile_funding(body)}
    elif action.startswith("schedule."):
        act = action.split(".")[1]
        step = body.get("step", "prepare")
        if step == "submit":
            return {"data": await submit_schedule(act, body)}
        elif step == "reconcile":
            return {"data": await reconcile_schedule(act, body)}
        return {"data": await prepare_schedule(act, body)}
    elif action.startswith("subscription."):
        parts = action.split(".")
        if len(parts) >= 3 and parts[1] == "allowance":
            step = parts[2]
            if step == "submit":
                return {"data": await submit_allowance(body)}
            return {"data": await prepare_allowance(body)}
        act = parts[1]
        step = body.get("step", "prepare")
        if step == "submit":
            return {"data": await submit_subscription(act, body)}
        elif step == "reconcile":
            return {"data": await reconcile_subscription(act, body)}
        return {"data": await prepare_subscription(act, body)}
    else:
        raise InputError(f"Unsupported action: {action}")
