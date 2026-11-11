from fastapi import APIRouter, Request
from backend.services.paiflow_service import (
    require_integration,
    capabilities,
    prepare_execute,
    submit_execute,
)
from backend.errors import InputError

router = APIRouter(prefix="/api/pay", tags=["pay"])

@router.post("")
async def pay_route(request: Request):
    require_integration()
    body = await request.json()
    cap = await capabilities()
    if cap.get("network") != "testnet":
        raise InputError("Only Testnet transactions are allowed.")

    prep_req_id = request.headers.get("x-preparation-request-id")

    if "signedXdr" in body:
        res = await submit_execute(body, wait=True, prep_request_id=prep_req_id)
        return {"data": res}
    else:
        res = await prepare_execute(body)
        return {"data": res}
