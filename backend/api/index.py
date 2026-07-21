"""
ResearchMind AI — FastAPI backend (Vercel serverless).

AI endpoints (Hugging Face Inference Providers, OpenAI-compatible router):
  POST /summarize     — summarize page/document text (24h Supabase cache)
  POST /explain       — explain an academic term simply
  POST /cite          — generate an APA/MLA/Chicago citation
  POST /humanize      — Pro: make AI text sound natural
  POST /paraphrase    — Pro: plagiarism-safe rewrite
  POST /polish        — Pro: grammar & clarity pass
  POST /compare       — Pro: multi-paper comparison
  POST /research-gap  — Pro: identify research gaps

Subscription / license system:
  POST /validate-key   — validate a license key (hashed lookup in Supabase)
  POST /generate-key   — PayPal webhook: verify signature, mint key, email it
  GET  /health         — liveness probe

All secrets come from environment variables (Vercel project settings):
  HF_TOKEN, MODEL_ID,
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  PAYPAL_API_BASE, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID,
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL
"""

import asyncio
import hashlib
import os
import re
import secrets
import smtplib
from urllib.parse import urlparse
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
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
LICENSE_DAYS = 180  # $1.40 per 6-month subscription cycle

# Public PayPal identifiers used to render the subscription button. Both are
# publishable (safe in client HTML). The SECRET stays server-side only.
PAYPAL_PLAN_ID = os.environ.get("PAYPAL_PLAN_ID", "P-0HL98976NA5043041NJPSYHQ")

# Hugging Face Inference Providers — OpenAI-compatible chat completions router.
# Swapping AI providers later (incl. Claude) = change these two env vars only.
HF_TOKEN = os.environ.get("HF_TOKEN", "")
MODEL_ID = os.environ.get("MODEL_ID", "Qwen/Qwen2.5-72B-Instruct")
HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions"

# Hugging Face free-tier inference reliably handles ~45k chars; beyond that it
# returns 502s. Cap well under that for fast, dependable summaries.
MAX_INPUT_CHARS = 32_000
CACHE_HOURS = 24


def clamp_for_llm(text: str) -> str:
    """Keep large documents within the reliable input size. For long text,
    take the beginning AND end so a paper's intro and conclusion both survive."""
    if len(text) <= MAX_INPUT_CHARS:
        return text
    head = int(MAX_INPUT_CHARS * 0.72)
    tail = MAX_INPUT_CHARS - head - 40
    return text[:head] + "\n\n[… middle omitted for length …]\n\n" + text[-tail:]

# Server-side free-tier limits (per hashed IP per UTC day) — a backstop for
# the client-side chrome.storage limits, so a modified client can't bypass them.
FREE_DAILY_LIMITS = {"summarize": 3, "explain": 5, "cite": 2}


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


def client_ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", "0.0.0.0").split(",")[0].strip()


# ------------------------------------------------------------------------- ai


async def llm_chat(system: str, user: str, max_tokens: int = 1200) -> str:
    """One chat completion against the HF router, retrying twice on failure."""
    require_env(("HF_TOKEN", HF_TOKEN))
    payload = {
        "model": MODEL_ID,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user[:MAX_INPUT_CHARS]},
        ],
        "max_tokens": max_tokens,
        "temperature": 0.4,
    }
    async with httpx.AsyncClient(timeout=90) as client:
        for attempt in range(3):  # 1 try + 2 retries
            try:
                r = await client.post(
                    HF_CHAT_URL,
                    headers={"Authorization": f"Bearer {HF_TOKEN}"},
                    json=payload,
                )
                r.raise_for_status()
                return r.json()["choices"][0]["message"]["content"].strip()
            except Exception:
                if attempt == 2:
                    raise HTTPException(
                        502, "The AI service is temporarily unavailable. Please try again."
                    )
                await asyncio.sleep(1.5 * (attempt + 1))


# ------------------------------------------------------------ tier enforcement


async def is_pro(request: Request) -> bool:
    """True when the request carries a valid, unexpired license key."""
    key = (request.headers.get("x-license-key") or "").strip().upper()
    if len(key.replace("-", "")) != 16 or not SUPABASE_URL:
        return False
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            rows = await sb_select(
                client,
                "license_keys",
                f"key_hash=eq.{hash_key(key)}&is_active=eq.true&select=expires_at",
            )
        if not rows:
            return False
        expires = datetime.fromisoformat(rows[0]["expires_at"].replace("Z", "+00:00"))
        return expires > datetime.now(timezone.utc)
    except Exception:
        return False


async def enforce_tier(request: Request, feature: str, pro_only: bool = False) -> bool:
    """Validate access + log usage. Returns the caller's pro status.

    Free limits are enforced per hashed IP per UTC day via usage_logs.
    If Supabase isn't configured (local dev), logging/limits degrade
    gracefully — the client-side limits still apply.
    """
    pro = await is_pro(request)
    if pro_only and not pro:
        raise HTTPException(
            403, "This is a Pro feature. Upgrade for $1.40 / 6 months to unlock it."
        )
    if not SUPABASE_URL:
        return pro
    ip = hash_ip(client_ip(request))
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            if not pro and feature in FREE_DAILY_LIMITS:
                today = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00")
                rows = await sb_select(
                    client,
                    "usage_logs",
                    f"ip_hash=eq.{ip}&feature=eq.{feature}"
                    f"&created_at=gte.{today}&select=id",
                )
                if len(rows) >= FREE_DAILY_LIMITS[feature]:
                    raise HTTPException(
                        429,
                        "You've used all your free requests today. "
                        "Unlock unlimited access for just $1.40 for 6 months 🚀",
                    )
            await sb_insert(
                client,
                "usage_logs",
                {"feature": feature, "ip_hash": ip, "key_hash": None},
            )
    except HTTPException:
        raise
    except Exception:
        pass  # analytics must never break the request
    return pro


# -------------------------------------------------------------------- caching


def url_hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()


async def cache_get(url: str, length: str) -> str | None:
    if not SUPABASE_URL or not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            now = datetime.now(timezone.utc).isoformat()
            rows = await sb_select(
                client,
                "cached_summaries",
                f"url_hash=eq.{url_hash(url + ':' + length)}"
                f"&expires_at=gt.{now}&select=summary",
            )
        return rows[0]["summary"] if rows else None
    except Exception:
        return None


async def cache_put(url: str, length: str, summary: str) -> None:
    if not SUPABASE_URL or not url:
        return
    try:
        expires = datetime.now(timezone.utc) + timedelta(hours=CACHE_HOURS)
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.post(
                f"{SUPABASE_URL}/rest/v1/cached_summaries",
                headers={**sb_headers(), "Prefer": "resolution=merge-duplicates"},
                json={
                    "url_hash": url_hash(url + ":" + length),
                    "summary": summary,
                    "expires_at": expires.isoformat(),
                },
            )
            r.raise_for_status()
    except Exception:
        pass  # cache failures must never break the request


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


@app.get("/", response_class=HTMLResponse)
async def root():
    """Human-friendly status page — the real consumers of this API are the
    Chrome extension's JSON endpoints below."""
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ResearchMind AI — API</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:Inter,system-ui,sans-serif;color:#e5e1f2;
    background:radial-gradient(60% 45% at 15% -10%,rgba(139,92,246,.3),transparent 60%),
    radial-gradient(55% 40% at 95% 0%,rgba(59,130,246,.24),transparent 60%),#0a0714}
  .card{max-width:430px;margin:24px;padding:36px 32px;border-radius:24px;text-align:center;
    border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.04)}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#34d399;
    margin-right:8px;box-shadow:0 0 12px #34d399}
  h1{font-size:22px;margin:14px 0 6px}
  .grad{background:linear-gradient(120deg,#c4b5fd,#60a5fa);-webkit-background-clip:text;
    background-clip:text;color:transparent}
  p{font-size:14px;line-height:1.6;color:#94a3b8;margin:10px 0}
  code{background:rgba(255,255,255,.07);padding:2px 8px;border-radius:8px;font-size:12.5px}
  a{color:#a78bfa}
</style></head><body><div class="card">
  <div><span class="dot"></span><span style="font-size:13px;font-weight:600;color:#34d399">API RUNNING</span></div>
  <h1>ResearchMind <span class="grad">AI</span> — Engine</h1>
  <p>This server is the invisible engine behind the ResearchMind AI Chrome
     extension. It has no pages to browse — it answers JSON requests like
     <code>/summarize</code>, <code>/explain</code> and <code>/cite</code>
     sent by the extension.</p>
  <p>To use ResearchMind, install the Chrome extension and click its icon
     on any article or paper.</p>
  <p><a href="https://github.com/Velqore/researchmind-ai#readme">Source &amp; documentation</a></p>
</div></body></html>"""


@app.get("/health")
async def health():
    return {"status": "ok", "service": "researchmind-api"}


@app.get("/checkout", response_class=HTMLResponse)
async def checkout():
    """Hosted PayPal subscription button. Opened in a new tab by both the web
    app and the Chrome extension (extensions can't load the PayPal SDK inline
    under manifest CSP, so a hosted page is the reliable path). Renders the
    official PayPal Buttons SDK — the raw subscriptions URL is not a supported
    standalone checkout."""
    if not PAYPAL_CLIENT_ID:
        return HTMLResponse(
            "<h2 style='font-family:sans-serif'>Checkout isn't configured yet.</h2>",
            status_code=503,
        )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upgrade to ResearchMind Pro</title>
<style>
  body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:Inter,system-ui,sans-serif;color:#e5e1f2;
    background:radial-gradient(60% 45% at 15% -10%,rgba(139,92,246,.3),transparent 60%),
    radial-gradient(55% 40% at 95% 0%,rgba(59,130,246,.24),transparent 60%),#0a0714}}
  .card{{max-width:420px;width:100%;margin:20px;padding:30px 26px;border-radius:24px;text-align:center;
    border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.04)}}
  h1{{font-size:21px;margin:6px 0 2px}}
  .grad{{background:linear-gradient(120deg,#c4b5fd,#60a5fa);-webkit-background-clip:text;
    background-clip:text;color:transparent}}
  .price{{font-size:26px;font-weight:800;margin:14px 0 2px}}
  .sub{{font-size:12.5px;color:#94a3b8;margin-bottom:18px}}
  #paypal-button-container{{min-height:50px}}
  .note{{font-size:11px;color:#64748b;margin-top:16px;line-height:1.5}}
  .ok{{display:none;padding:16px;border-radius:14px;background:rgba(52,211,153,.12);
    border:1px solid rgba(52,211,153,.3);color:#a7f3d0;font-size:13px;line-height:1.6}}
</style></head><body><div class="card">
  <div style="font-size:30px">🚀</div>
  <h1>ResearchMind <span class="grad">Pro</span></h1>
  <div class="price">$1.40 <span style="font-size:14px;color:#94a3b8">/ 6 months</span></div>
  <div class="sub">Unlimited summaries, citations & writer tools</div>
  <div id="paypal-button-container"></div>
  <div id="success" class="ok">
    ✅ Subscription active! Your license key is on its way to your email —
    check your inbox (and spam) in a minute, then paste it into the ResearchMind
    Settings tab to unlock Pro.
  </div>
  <div id="err" style="display:none;margin-top:14px;padding:14px;border-radius:12px;
    background:rgba(244,63,94,.12);border:1px solid rgba(244,63,94,.3);
    color:#fecaca;font-size:12px;line-height:1.55;text-align:left;word-break:break-word"></div>
  <p class="note">Secure payment via PayPal · Cancel anytime · License key sent by email</p>
</div>
<script src="https://www.paypal.com/sdk/js?client-id={PAYPAL_CLIENT_ID}&vault=true&intent=subscription&currency=USD"
        data-page-type="checkout"
        onerror="document.getElementById('err').style.display='block';document.getElementById('err').textContent='PayPal SDK failed to load. Check the Client ID or that the account is approved for Live payments.';"></script>
<script>
  function showErr(msg) {{
    var e = document.getElementById('err');
    e.style.display = 'block';
    e.textContent = 'PayPal error: ' + msg;
  }}
  if (window.paypal) {{
    paypal.Buttons({{
      style: {{ shape: 'pill', color: 'blue', layout: 'vertical', label: 'subscribe' }},
      createSubscription: function(data, actions) {{
        return actions.subscription.create({{ plan_id: '{PAYPAL_PLAN_ID}' }})
          .catch(function(e) {{ showErr('could not create subscription — ' + (e && e.message ? e.message : e)); throw e; }});
      }},
      onApprove: function(data) {{
        document.getElementById('paypal-button-container').style.display = 'none';
        document.getElementById('success').style.display = 'block';
      }},
      onError: function(err) {{ showErr((err && err.message) ? err.message : String(err)); }},
      onCancel: function() {{ showErr('payment was cancelled or the window closed before completing.'); }}
    }}).render('#paypal-button-container').catch(function(e) {{
      showErr('button failed to render — ' + (e && e.message ? e.message : e));
    }});
  }} else {{
    showErr('SDK object not available.');
  }}
</script>
</body></html>"""


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
            # Subscription renewal — extend the existing key by another cycle.
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


# --------------------------------------------------------------- AI endpoints

SUMMARY_STYLES = {
    "short": (
        "Write a 2-4 sentence TL;DR. Start with '**TL;DR** — '. "
        "Plain, precise language a busy researcher can absorb in seconds."
    ),
    "medium": (
        "Structure the summary as markdown with exactly these sections:\n"
        "**Overview** — 1-2 sentences on what this is.\n"
        "**Key points** — 3-5 bullet lines, each starting with '• '.\n"
        "**Why it matters** — 1-2 sentences on significance.\n"
        "Keep it under 250 words."
    ),
    "detailed": (
        "Structure the summary as markdown with exactly these sections:\n"
        "**Overview** — 2-3 sentences.\n"
        "**Method / approach** — bullet lines starting with '• '.\n"
        "**Results / findings** — bullet lines starting with '• '.\n"
        "**Limitations & impact** — a short paragraph.\n"
        "Keep it under 500 words."
    ),
}


async def fetch_page_text(url: str) -> tuple[str, str]:
    """Server-side page fetch for the web app (browsers can't cross-origin
    fetch arbitrary sites). Returns (title, text). Basic SSRF guard: http(s)
    only, no local/private hosts."""
    p = urlparse(url)
    host = (p.hostname or "").lower()
    if p.scheme not in ("http", "https") or not host:
        raise HTTPException(400, "Please enter a valid http(s) URL.")
    if (
        host in ("localhost", "0.0.0.0")
        or host.startswith(("127.", "10.", "192.168.", "169.254.", "172.16.", "172.17."))
        or host.endswith((".local", ".internal"))
    ):
        raise HTTPException(400, "That URL can't be fetched.")
    try:
        async with httpx.AsyncClient(
            timeout=20,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ResearchMindBot/1.0)"},
        ) as client:
            r = await client.get(url)
            r.raise_for_status()
            html = r.text[:800_000]
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            400, "Couldn't fetch that URL — check the link, or paste the text instead."
        )
    title_m = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    html = re.sub(
        r"(?is)<(script|style|noscript|nav|footer|header|aside|svg)[^>]*>.*?</\1>", " ", html
    )
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    for ent, ch in (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                    ("&quot;", '"'), ("&#39;", "'"), ("&#160;", " ")):
        text = text.replace(ent, ch)
    text = re.sub(r"[ \t\r\f]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else url
    return title, text[:MAX_INPUT_CHARS]


class SummarizeRequest(BaseModel):
    text: str = ""
    url: str = ""
    title: str = ""
    length: str = "medium"


@app.post("/summarize")
async def summarize(body: SummarizeRequest, request: Request):
    text = body.text.strip()
    title = body.title
    length = body.length if body.length in SUMMARY_STYLES else "medium"

    # Cached result costs the user nothing and skips their daily limit.
    cached = await cache_get(body.url, length)
    if cached:
        return {"summary": cached, "cached": True, "title": title or body.url}

    await enforce_tier(request, "summarize")

    # Web app sends only a URL — fetch and extract the page server-side.
    if len(text) < 40 and body.url:
        fetched_title, text = await fetch_page_text(body.url)
        title = title or fetched_title
    if len(text) < 40:
        raise HTTPException(400, "Not enough readable text on this page to summarize.")

    summary = await llm_chat(
        "You are ResearchMind, an expert research assistant. Summarize accurately — "
        "never invent facts, numbers, or citations not present in the text. "
        "Use **bold** for section headers and '• ' for bullets. " + SUMMARY_STYLES[length],
        f"Title: {title}\n\nContent:\n{clamp_for_llm(text)}",
        max_tokens=900,
    )
    await cache_put(body.url, length, summary)
    return {"summary": summary, "cached": False, "title": title or body.url}


class ExplainRequest(BaseModel):
    term: str
    context: str = ""


@app.post("/explain")
async def explain(body: ExplainRequest, request: Request):
    term = body.term.strip()[:200]
    if not term:
        raise HTTPException(400, "No term provided.")
    await enforce_tier(request, "explain")
    explanation = await llm_chat(
        "You are ResearchMind, an expert at explaining academic jargon. "
        "Explain the term in plain language a smart undergraduate would understand. "
        "Format: '**{term}**' on the first line, then 2-4 short sentences, "
        "then one line starting with '• ' giving a concrete example or analogy. "
        "Under 120 words total.",
        f"Term: {term}" + (f"\n\nSurrounding context:\n{body.context[:2000]}" if body.context else ""),
        max_tokens=300,
    )
    return {"explanation": explanation}


class CiteRequest(BaseModel):
    url: str
    title: str = ""
    style: str = "APA"


@app.post("/cite")
async def cite(body: CiteRequest, request: Request):
    style = body.style if body.style in ("APA", "MLA", "Chicago") else "APA"
    await enforce_tier(request, "cite")
    today = datetime.now(timezone.utc).strftime("%B %d, %Y")
    citation = await llm_chat(
        f"You generate {style}-style citations for web sources. "
        "Return ONLY the citation text — no preamble, no quotes, no explanation. "
        "If author or publication date are unknown, follow the style's rules for "
        "missing information rather than inventing them.",
        f"Title: {body.title or 'Unknown'}\nURL: {body.url}\nAccessed: {today}",
        max_tokens=200,
    )
    return {"citation": citation, "style": style}


class TextRequest(BaseModel):
    text: str


WRITER_TOOLS = {
    "humanize": (
        "Rewrite the text so it reads as natural, warm human writing: vary sentence "
        "length, use contractions where natural, remove robotic transitions and "
        "AI clichés. Preserve the meaning, facts, and approximate length. "
        "Return ONLY the rewritten text."
    ),
    "paraphrase": (
        "Paraphrase the text completely: new sentence structures and vocabulary "
        "while preserving the exact meaning and all facts. The result must not "
        "reuse distinctive phrases from the original. Return ONLY the rewritten text."
    ),
    "polish": (
        "Fix grammar, spelling, and punctuation, and sharpen clarity — but keep the "
        "author's voice, tone, and structure. Change as little as possible. "
        "Return ONLY the corrected text."
    ),
}


def writer_endpoint(mode: str):
    async def handler(body: TextRequest, request: Request):
        text = body.text.strip()
        if len(text) < 20:
            raise HTTPException(400, "Please provide at least a sentence of text.")
        await enforce_tier(request, mode, pro_only=True)
        result = await llm_chat(WRITER_TOOLS[mode], text, max_tokens=1500)
        return {"result": result}

    return handler


app.post("/humanize")(writer_endpoint("humanize"))
app.post("/paraphrase")(writer_endpoint("paraphrase"))
app.post("/polish")(writer_endpoint("polish"))


class PapersRequest(BaseModel):
    papers: list[str]


@app.post("/compare")
async def compare(body: PapersRequest, request: Request):
    papers = [p.strip()[:20_000] for p in body.papers if p.strip()][:4]
    if len(papers) < 2:
        raise HTTPException(400, "Provide at least two papers to compare.")
    await enforce_tier(request, "compare", pro_only=True)
    joined = "\n\n---PAPER BREAK---\n\n".join(
        f"PAPER {i + 1}:\n{p}" for i, p in enumerate(papers)
    )
    result = await llm_chat(
        "You are ResearchMind. Compare the provided papers as markdown: "
        "**Shared ground** (bullets with '• '), **Key differences** (bullets), "
        "**Methodological comparison** (bullets), **Verdict** (2-3 sentences on "
        "which is stronger for what purpose). Never invent findings.",
        joined,
        max_tokens=1200,
    )
    return {"comparison": result}


@app.post("/research-gap")
async def research_gap(body: PapersRequest, request: Request):
    papers = [p.strip()[:20_000] for p in body.papers if p.strip()][:4]
    if not papers:
        raise HTTPException(400, "Provide at least one paper.")
    await enforce_tier(request, "research_gap", pro_only=True)
    joined = "\n\n---PAPER BREAK---\n\n".join(
        f"PAPER {i + 1}:\n{p}" for i, p in enumerate(papers)
    )
    result = await llm_chat(
        "You are ResearchMind, an expert research strategist. From the provided "
        "paper(s), identify genuine research gaps as markdown: **Open questions** "
        "(bullets with '• '), **Underexplored angles** (bullets), **Suggested next "
        "studies** (2-3 bullets, each a concrete study design). Ground every gap in "
        "what the papers actually say or omit.",
        joined,
        max_tokens=1000,
    )
    return {"gaps": result}
