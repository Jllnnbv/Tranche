from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.errors import (
    PaiflowError,
    InputError,
    paiflow_error_handler,
    input_error_handler,
    generic_error_handler,
)
from backend.routers.auth_router import router as auth_router
from backend.routers.tranche_router import router as tranche_router
from backend.routers.pay_router import router as pay_router
from backend.routers.payout_router import router as payout_router
from backend.routers.events_router import router as events_router
from backend.routers.integration_router import router as integration_router

app = FastAPI(
    title="Tranche / Ambagan API",
    description="FastAPI backend for non-custodial testnet savings powered by Paiflow",
    version="1.0.0",
)

# CORS configuration to allow frontend access with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(PaiflowError, paiflow_error_handler)
app.add_exception_handler(InputError, input_error_handler)

# Routers
app.include_router(auth_router)
app.include_router(tranche_router)
app.include_router(pay_router)
app.include_router(payout_router)
app.include_router(events_router)
app.include_router(integration_router)

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Tranche / Ambagan FastAPI Backend",
        "version": "1.0.0",
        "docs": "/docs",
    }

@app.get("/health")
async def health():
    return {"status": "ok"}
