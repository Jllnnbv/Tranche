from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from typing import Optional
from backend.services.auth_service import (
    authenticate,
    create_user,
    get_or_create_demo_user,
    reset_password,
    create_session_token,
    read_session_token,
    find_user,
    update_user_profile,
    check_login_rate,
    record_login_failure,
    clear_login_failures,
    SESSION_COOKIE,
    SESSION_TTL_SECONDS,
)
from backend.errors import PaiflowError, InputError

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    email: str
    password: str

class SignupRequest(BaseModel):
    username: str
    email: str
    password: str
    phone: Optional[str] = None

class ResetRequest(BaseModel):
    email: str
    password: str

class ProfileUpdateRequest(BaseModel):
    fullName: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None

def set_session_cookie(response: Response, token: str, is_secure: bool = False):
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_TTL_SECONDS,
        path="/",
        httponly=True,
        samesite="lax",
        secure=is_secure,
    )

def clear_session_cookie(response: Response, is_secure: bool = False):
    response.set_cookie(
        key=SESSION_COOKIE,
        value="",
        max_age=0,
        path="/",
        httponly=True,
        samesite="lax",
        secure=is_secure,
    )

def check_is_secure(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", "").lower()
    return request.url.scheme == "https" or proto == "https"

@router.post("/demo")
async def demo_login(request: Request, response: Response):
    user = get_or_create_demo_user()
    token = create_session_token(user["id"])
    is_secure = check_is_secure(request)
    set_session_cookie(response, token, is_secure)
    return {"data": user}

@router.post("/login")
async def login(req: LoginRequest, request: Request, response: Response):
    email_clean = req.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise InputError("Enter a valid email address.")
    
    check_login_rate(email_clean)
    user = authenticate(email_clean, req.password)
    if not user:
        record_login_failure(email_clean)
        raise PaiflowError(401, "UNAUTHENTICATED", "Email or password is incorrect.")
    
    clear_login_failures(email_clean)
    token = create_session_token(user["id"])
    is_secure = check_is_secure(request)
    set_session_cookie(response, token, is_secure)
    return {"data": user}

@router.post("/signup")
async def signup(req: SignupRequest, request: Request, response: Response):
    username = req.username.strip()
    if len(username) < 2 or len(username) > 40:
        raise InputError("Username must be 2 to 40 characters.")
    
    email_clean = req.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise InputError("Enter a valid email address.")
        
    if len(req.password) < 8 or len(req.password) > 200:
        raise InputError("Password must be 8 to 200 characters.")

    user = create_user(username, email_clean, req.password, req.phone)
    token = create_session_token(user["id"])
    is_secure = check_is_secure(request)
    set_session_cookie(response, token, is_secure)
    return {"data": user}

@router.post("/logout")
async def logout(request: Request, response: Response):
    is_secure = check_is_secure(request)
    clear_session_cookie(response, is_secure)
    return {"data": {"success": True}}

@router.get("/me")
async def me(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    user_id = read_session_token(token)
    if not user_id:
        raise PaiflowError(401, "UNAUTHENTICATED", "Not signed in.")
    user = find_user(user_id)
    if not user:
        raise PaiflowError(401, "UNAUTHENTICATED", "Not signed in.")
    return {"data": user}

@router.post("/profile")
async def update_profile(req: ProfileUpdateRequest, request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    user_id = read_session_token(token)
    if not user_id:
        raise PaiflowError(401, "UNAUTHENTICATED", "Not signed in.")
    
    target_name = (req.fullName or req.username or "").strip()
    target_phone = req.mobile if req.mobile is not None else req.phone
    updated = update_user_profile(
        user_id=user_id,
        username=target_name if target_name else None,
        email=req.email,
        phone=target_phone,
    )
    return {"data": updated}

@router.post("/reset")
async def reset_pwd(req: ResetRequest, request: Request, response: Response):
    email_clean = req.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise InputError("Enter a valid email address.")
    if len(req.password) < 8 or len(req.password) > 200:
        raise InputError("Password must be 8 to 200 characters.")
        
    user = reset_password(email_clean, req.password)
    if not user:
        raise PaiflowError(404, "NOT_FOUND", "No account found with this email.")
        
    token = create_session_token(user["id"])
    is_secure = request.url.scheme == "https"
    set_session_cookie(response, token, is_secure)
    return {"data": user}
