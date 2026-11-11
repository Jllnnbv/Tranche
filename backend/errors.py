from typing import Optional, Dict, Any
from fastapi import Request
from fastapi.responses import JSONResponse

class PaiflowError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        retry_after: Optional[str] = None,
        request_id: Optional[str] = None,
        fields: Optional[Dict[str, Any]] = None,
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retry_after = retry_after
        self.request_id = request_id
        self.fields = fields
        self.details = details

class InputError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

async def paiflow_error_handler(request: Request, exc: PaiflowError):
    headers = {}
    if exc.retry_after:
        headers["Retry-After"] = str(exc.retry_after)
    if exc.request_id:
        headers["x-request-id"] = str(exc.request_id)

    error_payload = {
        "code": exc.code,
        "message": exc.message,
    }
    if exc.fields:
        error_payload["fields"] = exc.fields
    if exc.details is not None:
        error_payload["details"] = exc.details

    return JSONResponse(
        status_code=exc.status_code,
        content={"error": error_payload},
        headers=headers,
    )

async def input_error_handler(request: Request, exc: InputError):
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION", "message": exc.message}},
    )

async def generic_error_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": str(exc),
            }
        },
    )
