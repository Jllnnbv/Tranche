from fastapi import APIRouter, Query
from typing import Optional
from backend.services.paiflow_service import (
    require_integration,
    list_events,
    public_config,
)
from backend.errors import InputError

router = APIRouter(prefix="/api/events", tags=["events"])

@router.get("")
async def get_events(cursor: Optional[str] = Query(None)):
    require_integration()
    if cursor is not None and (not cursor or len(cursor) > 512):
        raise InputError("Invalid cursor query.")
        
    events = await list_events(cursor=cursor)
    cfg = public_config()
    return {"data": {**events, **cfg}}
