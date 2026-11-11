from fastapi import APIRouter, Request
from backend.services.paiflow_service import (
    require_integration,
    prepare_payout,
    submit_payout,
)
from backend.errors import InputError

router = APIRouter(prefix="/api/payout", tags=["payout"])

@router.post("")
async def payout_route(request: Request):
    if require_integration() == "demo":
        raise InputError("Payouts require your team's deployment/token.")

    body = await request.json()
    if "signedXdr" in body:
        res = await submit_payout(body)
    else:
        res = await prepare_payout(body)
    return {"data": res}
