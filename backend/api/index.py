"""
ResearchMind AI — FastAPI backend (Vercel serverless).

Subscription / license system (this step):
  POST /validate-key   — validate a license key (hashed lookup in Supabase)
  POST /generate-key   — PayPal webhook: verify signature, mint key, email it
  GET  /health         — liveness probe

AI endpoints (/summarize, /explain, /cite, …) ship in the next build step.

All secrets come from environment variables (Vercel project settings):
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  PAYPAL_API_BASE, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL
"""

import hashlib
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="ResearchMind AI API", version="1.0.0")

# The popup calls from a chrome-extension:// origin; no cookies are used,
# so a wildcard origin is safe here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------- config

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
PAYPAL_API = os.environ.get("PAYPAL_API_BASE", "https://api-m.sandbox.paypal.com").rstrip("/")
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET", "")
PAYPAL_WEBHOOK_ID = os.environ.get("PAYPAL_WEBHOOK_ID", "")

KEY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"  # no 0/O/1/I lookalikes
LICENSE_DAYS = 30


def require_env(*pairs: tuple[str, str]) -> None:
    missing = [name for name, value in pairs if not value]
    if missing:
        raise HTTPException(500, f"Server misconfigured — missing env: {', '.join(missing)}")


# ------------------------------------------------------------------- supabase


def sb_headers(write: bool = False) -> dict:
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if write:
        h["Prefer"] = "return=representation"
    return h


async def sb_select(client: httpx.AsyncClient, table: str, query: str) -> list:
    r = await client.get(f"{SUPABASE_URL}/rest/v1/{table}?{query}", headers=sb_headers())
    r.raise_for_status()
    return r.json()


async def sb_insert(client: httpx.AsyncClient, table: str, row: dict) -> list:
    r = await client.post(
        f"{SUPABASE_URL}/rest/v1/{table}", headers=sb_headers(write=True), json=row
    )
    r.raise_for_status()
    return r.json()


async def sb_update(client: httpx.AsyncClient, table: str, query: str, patch: dict) -> list:
    r = await client.patch(
        f"{SUPABASE_URL}/rest/v1/{table}?{query}", headers=sb_headers(write=True), json=patch
    )
    r.raise_for_status()
    return r.json()


# ----------------------------------------------------------------------- keys


def generate_license_key() -> str:
    chars = [secrets.choice(KEY_ALPHABET) for _ in range(12)]
    return f"RMND-{''.join(chars[0:4])}-{''.join(chars[4:8])}-{''.join(chars[8:12])}"


def hash_key(key: str) -> str:
    return hashlib.sha256(key.strip().upper().encode()).hexdigest()


def hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()[:32]


# ---------------------------------------------------------------------- email


def send_license_email(to_email: str, license_key: str, expires_at: datetime) -> None:
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("FROM_EMAIL", user)
    require_env(("SMTP_HOST", host), ("SMTP_USER", user), ("SMTP_PASS", password))

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "🎉 Your ResearchMind Pro license key"
    msg["From"] = f"ResearchMind AI <{sender}>"
    msg["To"] = to_email

    expiry_str = expires_at.strftime("%B %d, %Y")
    msg.attach(
        MIMEText(
            f"Welcome to ResearchMind Pro!\n\n"
            f"Your license key: {license_key}\n"
            f"Valid until: {expiry_str} (renews automatically with your subscription)\n\n"
            f"To activate: open the ResearchMind AI extension → Settings → "
            f"Activate Pro → paste your key.\n",
            "plain",
        )
    )
    msg.attach(
        MIMEText(
            f"""\
<div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;
            background:#0a0714;border-radius:20px;overflow:hidden;color:#e5e1f2">
  <div style="background:linear-gradient(135deg,#8b5cf6,#6366f1,#3b82f6);
              padding:32px 24px;text-align:center;color:#fff">
    <h1 style="margin:0;font-size:22px">🎉 Welcome to ResearchMind Pro!</h1>
    <p style="margin:8px 0 0;opacity:.9;font-size:14px">Unlimited AI research tools, unlocked.</p>
  </div>
  <div style="padding:28px 24px;text-align:center">
    <p style="font-size:14px;color:#94a3b8;margin:0 0 12px">Your license key</p>
    <div style="border:2px dashed #8b5cf6;border-radius:14px;padding:16px;
                font-family:monospace;font-size:20px;font-weight:700;
                letter-spacing:3px;color:#fff">{license_key}</div>
    <p style="font-size:13px;color:#94a3b8;margin:16px 0 0">
      Valid until <b style="color:#c4b5fd">{expiry_str}</b> — renews automatically with your subscription.
    </p>
    <div style="text-align:left;background:rgba(255,255,255,.05);border-radius:12px;
                padding:16px 20px;margin-top:24px;font-size:13.5px;line-height:2">
      <b>To activate:</b><br/>
      1. Open the ResearchMind AI extension<br/>
      2. Go to ⚙️ Settings → Activate Pro<br/>
      3. Paste your key and hit Activate 🚀
    </div>
  </div>
</div>""",
            "html",
        )
    )

    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=15) as server:
            server.login(user, password)
            server.sendmail(sender, to_email, msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(sender, to_email, msg.as_string())


# --------------------------------------------------------------------- paypal


async def paypal_access_token(client: httpx.AsyncClient) -> str:
    r = await client.post(
        f"{PAYPAL_API}/v1/oauth2/token",
        auth=(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET),
        data={"grant_type": "client_credentials"},
    )
    r.raise_for_status()
    return r.json()["access_token"]


async def verify_paypal_webhook(client: httpx.AsyncClient, request: Request, event: dict) -> bool:
    """Ask PayPal to verify the webhook signature. Rejecting unverified events
    is what stops anyone from minting free keys by POSTing fake webhooks."""
    token = await paypal_access_token(client)
    r = await client.post(
        f"{PAYPAL_API}/v1/notifications/verify-webhook-signature",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "auth_algo": request.headers.get("paypal-auth-algo", ""),
            "cert_url": request.headers.get("paypal-cert-url", ""),
            "transmission_id": request.headers.get("paypal-transmission-id", ""),
            "transmission_sig": request.headers.get("paypal-transmission-sig", ""),
            "transmission_time": request.headers.get("paypal-transmission-time", ""),
            "webhook_id": PAYPAL_WEBHOOK_ID,
            "webhook_event": event,
        },
    )
    r.raise_for_status()
    return r.json().get("verification_status") == "SUCCESS"


# ------------------------------------------------------------------ endpoints


@app.get("/health")
async def health():
    return {"status": "ok", "service": "researchmind-api"}


class ValidateKeyRequest(BaseModel):
    key: str


@app.post("/validate-key")
async def validate_key(body: ValidateKeyRequest, request: Request):
    require_env(("SUPABASE_URL", SUPABASE_URL), ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_KEY))
    key = body.key.strip().upper()
    if len(key.replace("-", "")) != 16:
        raise HTTPException(400, "This key is invalid or has expired.")

    async with httpx.AsyncClient(timeout=10) as client:
        rows = await sb_select(
            client,
            "license_keys",
            f"key_hash=eq.{hash_key(key)}&is_active=eq.true&select=expires_at,email",
        )
        if not rows:
            raise HTTPException(404, "This key is invalid or has expired.")

        expires_at = datetime.fromisoformat(rows[0]["expires_at"].replace("Z", "+00:00"))
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(404, "This key has expired. Renew your subscription to continue.")

        # Usage analytics + groundwork for suspicious-activity detection
        # (same key seen from 5+ IPs gets flagged in a later step).
        client_ip = request.headers.get("x-forwarded-for", "0.0.0.0").split(",")[0].strip()
        await sb_insert(
            client,
            "usage_logs",
            {"key_hash": hash_key(key), "feature": "validate_key", "ip_hash": hash_ip(client_ip)},
        )

    return {"valid": True, "expires_at": expires_at.isoformat()}


@app.post("/generate-key")
async def generate_key(request: Request):
    """PayPal webhook receiver. Configure this URL + the events below in the
    PayPal developer dashboard (see backend/README.md)."""
    require_env(
        ("SUPABASE_URL", SUPABASE_URL),
        ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_KEY),
        ("PAYPAL_CLIENT_ID", PAYPAL_CLIENT_ID),
        ("PAYPAL_CLIENT_SECRET", PAYPAL_CLIENT_SECRET),
        ("PAYPAL_WEBHOOK_ID", PAYPAL_WEBHOOK_ID),
    )
    event = await request.json()
    event_type = event.get("event_type", "")
    resource = event.get("resource", {})

    async with httpx.AsyncClient(timeout=20) as client:
        if not await verify_paypal_webhook(client, request, event):
            raise HTTPException(401, "Webhook signature verification failed.")

        now = datetime.now(timezone.utc)

        if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
            email = resource.get("subscriber", {}).get("email_address")
            subscription_id = resource.get("id")
            if not email or not subscription_id:
                raise HTTPException(400, "Event missing subscriber email or subscription id.")

            key = generate_license_key()
            expires_at = now + timedelta(days=LICENSE_DAYS)
            existing = await sb_select(
                client,
                "license_keys",
                f"paypal_subscription_id=eq.{subscription_id}&select=id",
            )
            row = {
                "key_hash": hash_key(key),
                "email": email,
                "expires_at": expires_at.isoformat(),
                "is_active": True,
            }
            if existing:
                # Webhook retry or re-activation: rotate the key on the same row.
                await sb_update(
                    client,
                    "license_keys",
                    f"paypal_subscription_id=eq.{subscription_id}",
                    row,
                )
            else:
                row["paypal_subscription_id"] = subscription_id
                await sb_insert(client, "license_keys", row)

            send_license_email(email, key, expires_at)
            return {"status": "key_issued"}

        if event_type == "PAYMENT.SALE.COMPLETED":
            # Monthly renewal — extend the existing key by 30 days.
            subscription_id = resource.get("billing_agreement_id")
            if subscription_id:
                rows = await sb_select(
                    client,
                    "license_keys",
                    f"paypal_subscription_id=eq.{subscription_id}&select=expires_at",
                )
                if rows:
                    current = datetime.fromisoformat(
                        rows[0]["expires_at"].replace("Z", "+00:00")
                    )
                    new_expiry = max(current, now) + timedelta(days=LICENSE_DAYS)
                    await sb_update(
                        client,
                        "license_keys",
                        f"paypal_subscription_id=eq.{subscription_id}",
                        {
                            "expires_at": new_expiry.isoformat(),
                            "is_active": True,
                            "paypal_transaction_id": resource.get("id"),
                        },
                    )
                    return {"status": "renewed"}
            return {"status": "ignored"}

        if event_type in ("PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED"):
            subscription_id = resource.get("billing_agreement_id")
            if subscription_id:
                await sb_update(
                    client,
                    "license_keys",
                    f"paypal_subscription_id=eq.{subscription_id}",
                    {"is_active": False},
                )
            return {"status": "deactivated"}

        # CANCELLED/SUSPENDED: user keeps access until the paid period expires.
        return {"status": "ignored"}
