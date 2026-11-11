import os
import json
import time
import base64
import hashlib
import hmac
import uuid
from typing import Optional, Dict, Any, List
from pathlib import Path
from backend.config import SESSION_SECRET, USERS_FILE
from backend.errors import PaiflowError, InputError

SESSION_COOKIE = "tranche_session"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

DEFAULT_DEMO_HASH = (
    "scrypt$c670983bad8a21952238944bd0f22419$"
    "016a36508309ee84b3c1f65d23416ea2250b3e89f9e65b67fa54fb2fe7567073"
    "2bec401b92e3b0badd11ad2e4d1ca4d01a1df53722b3716a4700a8117e30ac73"
)

# In-memory failure tracking
failures: Dict[str, List[float]] = {}
WINDOW_SECONDS = 15 * 60
MAX_FAILURES = 10

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    hashed = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        dklen=64,
    )
    return f"scrypt${salt.hex()}${hashed.hex()}"

def verify_password(password: str, stored: str) -> bool:
    try:
        parts = stored.split("$")
        if len(parts) != 3 or parts[0] != "scrypt":
            return False
        salt = bytes.fromhex(parts[1])
        expected = parts[2]
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=16384,
            r=8,
            p=1,
            dklen=64,
        ).hex()
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

def _b64url_decode(value: str) -> Optional[bytes]:
    try:
        padding = (4 - len(value) % 4) % 4
        return base64.urlsafe_b64decode(value + "=" * padding)
    except Exception:
        return None

def create_session_token(user_id: str, now: Optional[int] = None) -> str:
    current_time = now if now is not None else int(time.time())
    payload = {
        "uid": user_id,
        "exp": current_time + SESSION_TTL_SECONDS,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)

    secret_bytes = SESSION_SECRET.encode("utf-8")
    signature = hmac.new(secret_bytes, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = _b64url_encode(signature)
    return f"{payload_b64}.{sig_b64}"

def read_session_token(token: Optional[str], now: Optional[int] = None) -> Optional[str]:
    if not token:
        return None
    parts = token.split(".")
    if len(parts) != 2:
        return None
    payload_b64, sig_b64 = parts

    secret_bytes = SESSION_SECRET.encode("utf-8")
    expected_sig = hmac.new(secret_bytes, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    expected_sig_b64 = _b64url_encode(expected_sig)

    if not hmac.compare_digest(sig_b64, expected_sig_b64):
        return None

    payload_bytes = _b64url_decode(payload_b64)
    if not payload_bytes:
        return None

    try:
        data = json.loads(payload_bytes.decode("utf-8"))
        uid = data.get("uid")
        exp = data.get("exp")
        current_time = now if now is not None else int(time.time())
        if isinstance(uid, str) and isinstance(exp, (int, float)) and exp > current_time:
            return uid
    except Exception:
        pass
    return None

def load_users() -> List[Dict[str, Any]]:
    path = Path(USERS_FILE)
    if not path.exists():
        default_users = [
            {
                "id": "76724fe8-1c64-443e-b3c1-f07675a0a3fa",
                "username": "Julianna",
                "email": "julianna@tranche.finance",
                "phone": "09154077526",
                "passwordHash": DEFAULT_DEMO_HASH,
                "createdAt": "2026-10-14T06:57:31.471Z",
            },
            {
                "id": "a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6",
                "username": "Demo Organizer",
                "email": "demo@tranche.finance",
                "phone": None,
                "passwordHash": DEFAULT_DEMO_HASH,
                "createdAt": "2026-10-14T07:00:00.000Z",
            },
            {
                "id": "f8e7d6c5-b4a3-4210-9876-543210fedcba",
                "username": "Keith",
                "email": "keithalan.speirs25@gmail.com",
                "phone": "09154077526",
                "passwordHash": DEFAULT_DEMO_HASH,
                "createdAt": "2026-10-14T06:57:31.471Z",
            },
        ]
        save_users(default_users)
        return default_users

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data.get("users", [])
    except Exception as e:
        raise PaiflowError(500, "USERS_UNREADABLE", "Tranche accounts file is unreadable.")

def save_users(users: List[Dict[str, Any]]) -> None:
    path = Path(USERS_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f".{os.getpid()}.tmp")
    tmp_path.write_text(json.dumps({"users": users}, indent=2), encoding="utf-8")
    tmp_path.replace(path)

def to_public_user(u: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": u["id"],
        "username": u["username"],
        "email": u["email"],
        "phone": u.get("phone"),
    }

def update_user_profile(
    user_id: str,
    username: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
) -> Dict[str, Any]:
    users = load_users()
    target = None
    for u in users:
        if u["id"] == user_id:
            target = u
            break
    if not target:
        raise PaiflowError(404, "NOT_FOUND", "User not found.")

    if username and username.strip():
        target["username"] = username.strip()
    if email and "@" in email:
        target["email"] = email.strip().lower()
    if phone is not None:
        target["phone"] = phone.strip()

    save_users(users)
    return to_public_user(target)

def find_user(user_id: str) -> Optional[Dict[str, str]]:
    users = load_users()
    for u in users:
        if u["id"] == user_id:
            return to_public_user(u)
    return None

def check_login_rate(email: str):
    email_clean = email.lower().strip()
    if email_clean in ("demo@tranche.finance", "julianna@tranche.finance"):
        return
    now = time.time()
    recent = [t for t in failures.get(email_clean, []) if now - t < WINDOW_SECONDS]
    failures[email_clean] = recent
    if len(recent) >= MAX_FAILURES:
        raise PaiflowError(
            429,
            "RATE_LIMITED",
            "Too many attempts. Try again in a few minutes.",
            retry_after="900",
        )

def record_login_failure(email: str):
    email_clean = email.lower().strip()
    failures.setdefault(email_clean, []).append(time.time())

def clear_login_failures(email: str):
    email_clean = email.lower().strip()
    failures.pop(email_clean, None)

def authenticate(email: str, password: str) -> Optional[Dict[str, str]]:
    users = load_users()
    email_clean = email.lower().strip()
    user = next((u for u in users if u["email"].lower() == email_clean), None)
    if not user:
        return None
    if verify_password(password, user.get("passwordHash", "")):
        return to_public_user(user)
    return None

def create_user(username: str, email: str, password: str, phone: Optional[str] = None) -> Dict[str, str]:
    users = load_users()
    email_clean = email.lower().strip()
    if any(u["email"].lower() == email_clean for u in users):
        raise PaiflowError(409, "CONFLICT", "An account with this email already exists. Log in instead.")

    new_user = {
        "id": str(uuid.uuid4()),
        "username": username.strip(),
        "email": email_clean,
        "phone": phone.strip() if phone else None,
        "passwordHash": hash_password(password),
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
    }
    users.append(new_user)
    save_users(users)
    return to_public_user(new_user)

def get_or_create_demo_user() -> Dict[str, str]:
    users = load_users()
    demo = next(
        (u for u in users if u["email"].lower() in ("julianna@tranche.finance", "demo@tranche.finance")),
        None,
    )
    if demo:
        return to_public_user(demo)

    new_demo = {
        "id": str(uuid.uuid4()),
        "username": "Julianna",
        "email": "julianna@tranche.finance",
        "phone": "09154077526",
        "passwordHash": DEFAULT_DEMO_HASH,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
    }
    users.append(new_demo)
    save_users(users)
    return to_public_user(new_demo)

def reset_password(email: str, new_password: str) -> Optional[Dict[str, str]]:
    users = load_users()
    email_clean = email.lower().strip()
    user = next((u for u in users if u["email"].lower() == email_clean), None)
    if not user:
        return None
    user["passwordHash"] = hash_password(new_password)
    save_users(users)
    return to_public_user(user)
