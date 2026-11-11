import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Root of the starter repo
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env.local first, then .env
env_local = BASE_DIR / ".env.local"
if env_local.exists():
    load_dotenv(env_local, override=True)
env_file = BASE_DIR / ".env"
if env_file.exists():
    load_dotenv(env_file, override=False)

PAIFLOW_MODE = os.getenv("PAIFLOW_MODE", "prepare")
PAIFLOW_BASE_URL = os.getenv("PAIFLOW_BASE_URL", "https://beta.app.paiflow.xyz").rstrip("/")
PAIFLOW_API_TOKEN = os.getenv("PAIFLOW_API_TOKEN", "")
PAIFLOW_DEPLOYMENT_ID = os.getenv("PAIFLOW_DEPLOYMENT_ID", "")
PAIFLOW_WEBHOOK_SECRET = os.getenv("PAIFLOW_WEBHOOK_SECRET", "")

HORIZON_URL = os.getenv("HORIZON_URL", "https://horizon-testnet.stellar.org").rstrip("/")
TRANCHE_VAULT_ACCOUNT = os.getenv("AMBAGAN_VAULT_ACCOUNT") or os.getenv("TRANCHE_VAULT_ACCOUNT", "")
TRANCHE_FUND_ACCOUNT = os.getenv("AMBAGAN_FUND_ACCOUNT") or os.getenv("TRANCHE_FUND_ACCOUNT", "")

SESSION_SECRET = os.getenv("SESSION_SECRET", "")
if not SESSION_SECRET:
    SESSION_SECRET = "default_development_secret_must_be_at_least_32_characters_long"

def get_rounds_config():
    raw = os.getenv("TRANCHE_ROUNDS_JSON", "[]")
    try:
        return json.loads(raw)
    except Exception:
        return []

GROUP_FILE = (
    os.getenv("AMBAGAN_GROUP_FILE")
    or os.getenv("TRANCHE_GROUP_FILE")
    or str(BASE_DIR / "config" / "group.json")
)

DATA_FILE = (
    os.getenv("AMBAGAN_DATA_FILE")
    or os.getenv("TRANCHE_DATA_FILE")
    or str(BASE_DIR / "data" / "ledger.json")
)

USERS_FILE = os.getenv("TRANCHE_USERS_FILE") or str(BASE_DIR / "data" / "users.json")
