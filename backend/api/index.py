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
import hmac
import json
import os
import random
import re
import secrets
import smtplib
import time
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

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
# Tolerate a URL entered without the scheme (e.g. "abc.supabase.co") — httpx
# needs an explicit https:// or every Supabase call fails with UnsupportedProtocol.
if SUPABASE_URL and not SUPABASE_URL.startswith(("http://", "https://")):
    SUPABASE_URL = "https://" + SUPABASE_URL
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
PAYPAL_API = os.environ.get("PAYPAL_API_BASE", "https://api-m.sandbox.paypal.com").rstrip("/")
PAYPAL_CLIENT_ID = os.environ.get("PAYPAL_CLIENT_ID", "")
PAYPAL_CLIENT_SECRET = os.environ.get("PAYPAL_CLIENT_SECRET", "")
PAYPAL_WEBHOOK_ID = os.environ.get("PAYPAL_WEBHOOK_ID", "")

KEY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"  # no 0/O/1/I lookalikes
LICENSE_DAYS = 180  # $1.40 per 6-month subscription cycle

# Public web app — used for the CTA on shared summary pages so every shared
# link becomes a funnel back into the product.
WEB_APP_URL = os.environ.get("WEB_APP_URL", "https://airesearch-mind.vercel.app").rstrip("/")

# Public PayPal identifiers used to render the subscription button. Both are
# publishable (safe in client HTML). The SECRET stays server-side only.
PAYPAL_PLAN_ID = os.environ.get("PAYPAL_PLAN_ID", "P-0HL98976NA5043041NJPSYHQ")

# Razorpay — UPI / GPay / cards for India. Key ID is publishable; the secret
# and webhook secret stay server-side. Test keys (rzp_test_...) let us build
# and verify with fake payments; swap to live keys after KYC to take real money.
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
# Price. Set PRICE_INR in the env in plain RUPEES (e.g. 120). Parsed defensively
# so a stray value (₹, commas, spaces) can never crash startup. Razorpay wants
# paise on the wire, so we convert (₹120 → 12000 paise).
def _int_env(name: str, default: int) -> int:
    digits = re.sub(r"[^\d]", "", str(os.environ.get(name, "") or ""))
    return int(digits) if digits else default


PRICE_INR = _int_env("PRICE_INR", 120)  # rupees
PRICE_INR_PAISE = PRICE_INR * 100
RAZORPAY_API = "https://api.razorpay.com/v1"

# AI providers — all OpenAI-compatible chat-completions endpoints, tried in
# order with automatic fallback so one provider being down/rate-limited never
# takes the product offline. Groq is primary (free, fast, generous limits);
# Hugging Face is the fallback. Set at least one key in the backend env.
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

HF_TOKEN = os.environ.get("HF_TOKEN", "")
MODEL_ID = os.environ.get("MODEL_ID", "Qwen/Qwen2.5-72B-Instruct")
HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions"

# Optional extra OpenAI-compatible providers (OpenRouter, Together, Cerebras,
# DeepInfra, a second Groq project…) for capacity + redundancy at scale. Adding
# one is purely an env change — no code deploy. Set LLM2_API_KEY + LLM2_MODEL
# (and LLM2_CHAT_URL if it isn't OpenRouter). Same for LLM3_*.
LLM2_API_KEY = os.environ.get("LLM2_API_KEY", "")
LLM2_MODEL = os.environ.get("LLM2_MODEL", "")
LLM2_CHAT_URL = os.environ.get("LLM2_CHAT_URL", "https://openrouter.ai/api/v1/chat/completions")
LLM3_API_KEY = os.environ.get("LLM3_API_KEY", "")
LLM3_MODEL = os.environ.get("LLM3_MODEL", "")
LLM3_CHAT_URL = os.environ.get("LLM3_CHAT_URL", "https://openrouter.ai/api/v1/chat/completions")

# SerpAPI — real Google Scholar search for the paper-discovery feature.
SERPAPI_KEY = os.environ.get("SERPAPI_KEY", "")

# RewriteAI — dedicated humanizer. Used first for /humanize when configured;
# the in-house Groq humanizer stays as an automatic fallback.
REWRITEAI_KEY = os.environ.get("REWRITEAI_KEY", "")
REWRITEAI_URL = os.environ.get("REWRITEAI_URL", "https://rewriteai.com/api/v1/humanize")

# Citation styles the generator accepts. Kept in sync with CITE_STYLES in
# src/components/tabs/ResearchTab.jsx.
CITATION_STYLES = (
    "APA",
    "MLA",
    "Chicago",
    "Harvard",
    "IEEE",
    "Vancouver",
    "AMA",
    "ACS",
    "APSA",
    "ASA",
    "Turabian",
    "Bluebook",
    "OSCOLA",
    "NLM",
    "CSE",
)


def ai_providers() -> list[tuple[str, str, str, str]]:
    """(label, url, api_key, model) in priority order. Groq primary, then HF,
    then any configured extra providers — so a rate-limited or exhausted primary
    automatically fails over and load can be spread across accounts at scale."""
    provs = []
    if GROQ_API_KEY:
        provs.append(("groq", GROQ_CHAT_URL, GROQ_API_KEY, GROQ_MODEL))
    if HF_TOKEN:
        provs.append(("hf", HF_CHAT_URL, HF_TOKEN, MODEL_ID))
    if LLM2_API_KEY and LLM2_MODEL:
        provs.append(("llm2", LLM2_CHAT_URL, LLM2_API_KEY, LLM2_MODEL))
    if LLM3_API_KEY and LLM3_MODEL:
        provs.append(("llm3", LLM3_CHAT_URL, LLM3_API_KEY, LLM3_MODEL))
    return provs

# Hugging Face free-tier inference reliably handles ~45k chars; beyond that it
# returns 502s. Free users get a smaller cap; Pro users get the full safe max.
FREE_MAX_INPUT_CHARS = 20_000
PRO_MAX_INPUT_CHARS = 45_000
HARD_MAX_INPUT_CHARS = 45_000  # absolute ceiling llm_chat never exceeds
CACHE_HOURS = 24

# Admin key — set ADMIN_KEY in the backend env to a value of the form
# RMND-XXXX-XXXX-XXXX. Entering it in Settings unlocks Pro + full limits for
# testing, with no Supabase row and no PayPal needed. Keep it secret.
ADMIN_KEY = os.environ.get("ADMIN_KEY", "").strip().upper()


def clamp_for_llm(text: str, cap: int = HARD_MAX_INPUT_CHARS) -> str:
    """Keep large documents within the reliable input size. For long text,
    take the beginning AND end so a paper's intro and conclusion both survive."""
    cap = min(cap, HARD_MAX_INPUT_CHARS)
    if len(text) <= cap:
        return text
    head = int(cap * 0.72)
    tail = cap - head - 40
    return text[:head] + "\n\n[… middle omitted for length …]\n\n" + text[-tail:]

# Server-side free-tier limits (per hashed IP per UTC day). These are an
# ABUSE BACKSTOP, not the user-facing limit — the per-device client limits in
# src/config.js are what a normal user sees. They must stay generous because
# mobile carriers (especially in India) put thousands of subscribers behind a
# single CGNAT address, so a tight per-IP cap would lock out innocent users.
FREE_DAILY_LIMITS = {"summarize": 60, "explain": 80, "cite": 50, "paper_search": 40, "ask": 60}


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


async def _try_provider(client, url, key, model, system, user, max_tokens, temperature):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user[:HARD_MAX_INPUT_CHARS]},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    r = await client.post(url, headers={"Authorization": f"Bearer {key}"}, json=payload)
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


# Retry budget for the whole call. Vercel's function limit is 60s, so we keep
# the total AI wait under this and leave room for fetch/DB work in the request.
LLM_DEADLINE_S = 42
LLM_ATTEMPTS = 3


def _retry_after(e: httpx.HTTPStatusError) -> float | None:
    """Seconds to wait per the provider's Retry-After header, if present."""
    v = e.response.headers.get("retry-after")
    if not v:
        return None
    try:
        return min(float(v), 12.0)  # cap so one slow header can't blow the budget
    except ValueError:
        return None


async def llm_chat(system: str, user: str, max_tokens: int = 1200, temperature: float = 0.4) -> str:
    """Chat completion across all configured providers with rate-limit-aware
    retries. When more than one provider is set, requests are LOAD-BALANCED
    (random primary each call) rather than always hammering the first — so the
    free daily quotas of several providers (Groq + Gemini + Cerebras + …) ADD UP
    instead of one being exhausted while others sit idle. Any provider still
    covers for the others on failure. Transient 429/5xx are retried with
    Retry-After / exponential backoff + jitter, bounded by LLM_DEADLINE_S so a
    burst of concurrent users converts rate-limits into eventual successes
    instead of 502s — without exceeding the serverless budget."""
    provs = ai_providers()
    if not provs:
        raise HTTPException(500, "No AI provider configured — set GROQ_API_KEY or HF_TOKEN.")
    # Spread load: randomise order so no single free quota is the sole hot path.
    # With one provider this is a no-op (keeps current behaviour).
    if len(provs) > 1:
        random.shuffle(provs)
    last = ""
    start = time.monotonic()
    async with httpx.AsyncClient(timeout=45) as client:
        for label, url, key, model in provs:
            for attempt in range(LLM_ATTEMPTS):
                try:
                    return await _try_provider(
                        client, url, key, model, system, user, max_tokens, temperature
                    )
                except httpx.HTTPStatusError as e:
                    last = f"{label} HTTP {e.response.status_code}"
                    # 4xx other than 429 (bad key, quota) won't fix on retry.
                    if e.response.status_code < 500 and e.response.status_code != 429:
                        break
                    wait = _retry_after(e) or (0.6 * (2**attempt) + random.uniform(0, 0.5))
                    if attempt == LLM_ATTEMPTS - 1 or time.monotonic() - start + wait > LLM_DEADLINE_S:
                        break  # out of attempts or budget — fall through to next provider
                    await asyncio.sleep(wait)
                except Exception as e:
                    last = f"{label} {type(e).__name__}"
                    wait = 0.6 * (2**attempt) + random.uniform(0, 0.5)
                    if attempt == LLM_ATTEMPTS - 1 or time.monotonic() - start + wait > LLM_DEADLINE_S:
                        break
                    await asyncio.sleep(wait)
    raise HTTPException(502, f"The AI service is temporarily unavailable ({last}). Please try again.")


# ------------------------------------------------------------ tier enforcement


async def is_pro(request: Request) -> bool:
    """True when the request carries a valid, unexpired license key (or the
    admin key, which unlocks everything for testing)."""
    key = (request.headers.get("x-license-key") or "").strip().upper()
    if ADMIN_KEY and key == ADMIN_KEY:
        return True
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
                limit = FREE_DAILY_LIMITS[feature]
                # Only need to know whether the count has reached the limit — cap
                # the rows returned so this stays cheap no matter how busy the IP.
                rows = await sb_select(
                    client,
                    "usage_logs",
                    f"ip_hash=eq.{ip}&feature=eq.{feature}"
                    f"&created_at=gte.{today}&select=id&limit={limit}",
                )
                if len(rows) >= limit:
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


@app.get("/test-email")
async def test_email(key: str = "", to: str = ""):
    """Admin-only SMTP check: /test-email?key=<ADMIN_KEY>&to=you@example.com
    Sends a real license email so you can confirm SMTP works before going live."""
    if not ADMIN_KEY or key.strip().upper() != ADMIN_KEY:
        raise HTTPException(403, "Admin key required.")
    recipient = to.strip() or os.environ.get("FROM_EMAIL", "") or os.environ.get("SMTP_USER", "")
    if not recipient:
        raise HTTPException(400, "Pass ?to=an-email-address.")
    try:
        # Use the real 6-month validity (LICENSE_DAYS) so the test email shows
        # the same expiry a paying customer sees.
        send_license_email(
            recipient, ADMIN_KEY, datetime.now(timezone.utc) + timedelta(days=LICENSE_DAYS)
        )
        return {"sent": True, "to": recipient}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"SMTP failed: {type(e).__name__}: {str(e)[:200]}")


@app.get("/test-mint")
async def test_mint(key: str = "", to: str = ""):
    """Admin-only: runs the exact post-payment key delivery (mint → store → email)
    so we can see any error without needing a real payment. ?key=<ADMIN>&to=email"""
    if not ADMIN_KEY or key.strip().upper() != ADMIN_KEY:
        raise HTTPException(403, "Admin key required.")
    recipient = to.strip() or os.environ.get("SMTP_USER", "")
    if not recipient:
        raise HTTPException(400, "Pass ?to=an-email-address.")
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            k = await mint_and_deliver(client, recipient, "test_" + secrets.token_hex(6))
        return {"delivered": bool(k), "to": recipient}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Delivery failed: {type(e).__name__}: {str(e)[:220]}")


@app.get("/diag")
async def diag(key: str = ""):
    """Admin-only provider health check: ?key=<ADMIN_KEY>. Reports which AI
    providers are configured and which actually respond to a tiny request."""
    if not ADMIN_KEY or key.strip().upper() != ADMIN_KEY:
        raise HTTPException(403, "Admin key required.")
    results = []
    async with httpx.AsyncClient(timeout=30) as client:
        for label, url, k, model in ai_providers():
            try:
                out = await _try_provider(client, url, k, model, "You are a test.", "Say OK.", 5, 0.0)
                results.append({"provider": label, "model": model, "ok": True, "sample": out[:30]})
            except httpx.HTTPStatusError as e:
                results.append({"provider": label, "model": model, "ok": False,
                                "error": f"HTTP {e.response.status_code}", "body": e.response.text[:160]})
            except Exception as e:
                results.append({"provider": label, "model": model, "ok": False, "error": type(e).__name__})
    # Razorpay: confirm the keys in this environment are valid + can create orders.
    rzp = {
        "key_id": RAZORPAY_KEY_ID or None,
        "secret_set": bool(RAZORPAY_KEY_SECRET),
        "secret_len": len(RAZORPAY_KEY_SECRET),
        "secret_tail": RAZORPAY_KEY_SECRET[-4:] if RAZORPAY_KEY_SECRET else "",
        "price_inr": PRICE_INR,
    }
    if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                r = await c.post(
                    f"{RAZORPAY_API}/orders",
                    auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
                    json={"amount": PRICE_INR_PAISE, "currency": "INR", "receipt": "diag"},
                )
            rzp["order_test"] = "ok" if r.status_code < 400 else f"HTTP {r.status_code}: {r.text[:120]}"
        except Exception as e:
            rzp["order_test"] = type(e).__name__
    # RewriteAI humanizer health
    rw = {"key_set": bool(REWRITEAI_KEY), "url": REWRITEAI_URL}
    if REWRITEAI_KEY:
        out = await rewriteai_humanize(
            "The utilization of said methodologies facilitates the optimization of outcomes."
        )
        rw["ok"] = bool(out)
        rw["sample"] = (out or "")[:80]
    return {
        "providers_configured": [p[0] for p in ai_providers()],
        "supabase": bool(SUPABASE_URL),
        "admin_key_set": bool(ADMIN_KEY),
        "razorpay": rzp,
        "rewriteai": rw,
        "results": results,
    }


# ------------------------------------------------------------------ Razorpay


async def mint_and_deliver(client: httpx.AsyncClient, email: str, payment_id: str) -> str | None:
    """Generate a license key, store it, and email it. Resilient: works whether or
    not the optional `razorpay_payment_id` column exists, and never lets a storage
    hiccup block the customer's key email. Idempotent per payment_id when possible."""
    if SUPABASE_URL and payment_id:
        try:
            seen = await sb_select(
                client, "license_keys", f"razorpay_payment_id=eq.{payment_id}&select=id"
            )
            if seen:
                return None
        except Exception:
            pass  # column may not exist yet — fall through and issue the key

    key = generate_license_key()
    expires_at = datetime.now(timezone.utc) + timedelta(days=LICENSE_DAYS)
    if SUPABASE_URL:
        base = {
            "key_hash": hash_key(key),
            "email": email,
            "expires_at": expires_at.isoformat(),
            "is_active": True,
        }
        try:
            await sb_insert(client, "license_keys", {**base, "razorpay_payment_id": payment_id})
        except Exception:
            # razorpay_payment_id column missing — store the key without it so
            # activation still works. Run the ALTER in supabase_schema.sql to
            # restore idempotency.
            await sb_insert(client, "license_keys", base)

    send_license_email(email, key, expires_at)
    return key


class RzpOrderRequest(BaseModel):
    email: str


@app.post("/razorpay/order")
async def razorpay_order(body: RzpOrderRequest):
    require_env(("RAZORPAY_KEY_ID", RAZORPAY_KEY_ID), ("RAZORPAY_KEY_SECRET", RAZORPAY_KEY_SECRET))
    email = body.email.strip()
    if "@" not in email or "." not in email:
        raise HTTPException(400, "Please enter a valid email address.")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{RAZORPAY_API}/orders",
            auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
            json={
                "amount": PRICE_INR_PAISE,
                "currency": "INR",
                "receipt": f"rm_{secrets.token_hex(8)}",
                "notes": {"email": email},
            },
        )
        if r.status_code >= 400:
            raise HTTPException(502, f"Could not start payment: {r.text[:160]}")
        order = r.json()
    return {
        "order_id": order["id"],
        "key_id": RAZORPAY_KEY_ID,
        "amount": PRICE_INR_PAISE,
        "currency": "INR",
    }


class RzpVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    email: str


@app.post("/razorpay/verify")
async def razorpay_verify(body: RzpVerifyRequest):
    require_env(("RAZORPAY_KEY_SECRET", RAZORPAY_KEY_SECRET))
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(400, "Payment signature could not be verified.")
    # Signature is valid → deliver the key. Surface the real reason if this fails.
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            await mint_and_deliver(client, body.email.strip(), body.razorpay_payment_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Key delivery failed: {type(e).__name__}: {str(e)[:160]}")
    return {"ok": True}


@app.post("/razorpay/webhook")
async def razorpay_webhook(request: Request):
    """Backup delivery path: Razorpay POSTs payment.captured here. Verifies the
    webhook signature, then mints+emails the key (idempotent)."""
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(503, "Webhook not configured.")
    raw = await request.body()
    sig = request.headers.get("x-razorpay-signature", "")
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(400, "Invalid webhook signature.")
    event = await request.json()
    if event.get("event") in ("payment.captured", "order.paid"):
        entity = (
            event.get("payload", {}).get("payment", {}).get("entity", {})
        )
        email = entity.get("notes", {}).get("email") or entity.get("email", "")
        payment_id = entity.get("id", "")
        if email and payment_id:
            async with httpx.AsyncClient(timeout=20) as client:
                await mint_and_deliver(client, email, payment_id)
    return {"status": "ok"}


@app.get("/pay", response_class=HTMLResponse)
async def pay():
    """Hosted Razorpay checkout — UPI / GPay / cards for India. Opened in a new
    tab by the app (CSP-safe). Collects the buyer's email, creates an order, runs
    Razorpay Checkout, verifies, and the key is emailed on success."""
    if not RAZORPAY_KEY_ID:
        return HTMLResponse(
            "<h2 style='font-family:sans-serif'>UPI checkout isn't configured yet.</h2>",
            status_code=503,
        )
    rupees = PRICE_INR_PAISE // 100
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upgrade to ResearchMind Pro</title>
<style>
  body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:Inter,system-ui,sans-serif;color:#f5edda;
    background:radial-gradient(90% 70% at 50% -20%,#17203a,transparent 55%),#05070f}}
  .card{{max-width:420px;width:100%;margin:20px;padding:30px 26px;border-radius:24px;text-align:center;
    border:1px solid rgba(227,189,118,.2);background:rgba(255,255,255,.04)}}
  .em{{font-size:30px}}
  h1{{font-size:21px;margin:8px 0 2px;font-family:Georgia,serif}}
  .grad{{background:linear-gradient(120deg,#f4d99a,#c69a4c);-webkit-background-clip:text;
    background-clip:text;color:transparent}}
  .price{{font-size:28px;font-weight:800;margin:14px 0 2px}}
  .sub{{font-size:12.5px;color:#9fb0cf;margin-bottom:18px}}
  input{{width:100%;box-sizing:border-box;padding:13px 15px;border-radius:12px;margin-bottom:12px;
    background:rgba(0,0,0,.3);border:1px solid rgba(227,189,118,.25);color:#f5edda;font-size:14px}}
  button{{width:100%;padding:14px;border:none;border-radius:14px;font-size:15px;font-weight:700;
    cursor:pointer;color:#1c1204;background:linear-gradient(120deg,#f4d99a,#e3bd76,#c69a4c);
    box-shadow:0 10px 30px rgba(227,189,118,.4)}}
  button:disabled{{opacity:.6;cursor:default}}
  .or{{display:flex;align-items:center;gap:10px;margin:14px 0;color:#64748b;font-size:11px}}
  .or::before,.or::after{{content:"";flex:1;height:1px;background:rgba(255,255,255,.12)}}
  .alt{{display:block;width:100%;box-sizing:border-box;padding:13px;border-radius:14px;
    font-size:14px;font-weight:600;text-decoration:none;color:#dbe4f5;
    background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16)}}
  .alt:hover{{background:rgba(255,255,255,.09)}}
  .note{{font-size:11px;color:#64748b;margin-top:16px;line-height:1.5}}
  .ok,.err{{display:none;margin-top:14px;padding:14px;border-radius:12px;font-size:13px;line-height:1.6;text-align:left}}
  .ok{{background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);color:#a7f3d0}}
  .err{{background:rgba(244,63,94,.12);border:1px solid rgba(244,63,94,.3);color:#fecaca}}
  a{{color:#9fb0cf;font-size:11.5px}}
</style></head><body><div class="card">
  <div class="em">🚀</div>
  <h1>ResearchMind <span class="grad">Pro</span></h1>
  <div class="price">₹{rupees} <span style="font-size:14px;color:#9fb0cf">/ 6 months</span></div>
  <div class="sub">UPI · GPay · PhonePe · Cards — one payment, no auto-renew</div>
  <div id="form">
    <input id="email" type="email" placeholder="Your email (your key is sent here)" autocomplete="email">
    <button id="payBtn" onclick="pay()">Pay ₹{rupees} with UPI / Card</button>
    <div class="or"><span>or</span></div>
    <a class="alt" href="/checkout">🌍 &nbsp;Pay with PayPal (international)</a>
  </div>
  <div id="ok" class="ok">✅ Payment successful! Your license key has been emailed to you —
    check your inbox (and spam) in a minute, then paste it into ResearchMind → Settings.</div>
  <div id="err" class="err"></div>
  <p class="note">Secure payment · License key sent by email · No auto-renew</p>
</div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  function showErr(m){{var e=document.getElementById('err');e.style.display='block';e.textContent=m;}}
  async function pay(){{
    var email=document.getElementById('email').value.trim();
    if(!email||email.indexOf('@')<0){{showErr('Please enter a valid email — your key is sent there.');return;}}
    var btn=document.getElementById('payBtn');btn.disabled=true;btn.textContent='Starting…';
    try{{
      var res=await fetch('/razorpay/order',{{method:'POST',headers:{{'Content-Type':'application/json'}},
        body:JSON.stringify({{email:email}})}});
      if(!res.ok){{throw new Error((await res.json()).detail||'Could not start payment');}}
      var o=await res.json();
      var rzp=new Razorpay({{
        key:o.key_id, order_id:o.order_id, amount:o.amount, currency:o.currency,
        name:'ResearchMind AI', description:'Pro — 6 months', prefill:{{email:email}},
        theme:{{color:'#c69a4c'}},
        handler:async function(resp){{
          var v=await fetch('/razorpay/verify',{{method:'POST',headers:{{'Content-Type':'application/json'}},
            body:JSON.stringify({{razorpay_order_id:resp.razorpay_order_id,
              razorpay_payment_id:resp.razorpay_payment_id,
              razorpay_signature:resp.razorpay_signature, email:email}})}});
          if(v.ok){{document.getElementById('form').style.display='none';
            document.getElementById('ok').style.display='block';}}
          else{{var m='verification failed';try{{m=(await v.json()).detail||m;}}catch(e){{}}
            showErr('Payment captured but '+m+' · payment id: '+resp.razorpay_payment_id);}}
        }},
        modal:{{ondismiss:function(){{btn.disabled=false;btn.textContent='Pay ₹{rupees} with UPI / Card';}}}}
      }});
      rzp.on('payment.failed',function(r){{showErr('Payment failed: '+(r.error&&r.error.description||'try again'));
        btn.disabled=false;btn.textContent='Pay ₹{rupees} with UPI / Card';}});
      rzp.open();
    }}catch(e){{showErr(e.message||'Something went wrong.');
      btn.disabled=false;btn.textContent='Pay ₹{rupees} with UPI / Card';}}
  }}
</script>
</body></html>"""


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
  <p class="note">Secure payment via PayPal · Cancel anytime · License key sent by email<br>
    <a href="/pay" style="color:#94a3b8">← In India? Pay ₹140 with UPI / GPay</a></p>
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
    key = body.key.strip().upper()
    if len(key.replace("-", "")) != 16:
        raise HTTPException(400, "This key is invalid or has expired.")

    # Admin key: instant Pro for testing, no Supabase/PayPal required.
    if ADMIN_KEY and key == ADMIN_KEY:
        far_future = (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()
        return {"valid": True, "expires_at": far_future}

    require_env(("SUPABASE_URL", SUPABASE_URL), ("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_KEY))

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


def extract_pdf_text(data: bytes, url: str) -> tuple[str, str]:
    """Pull readable text out of a fetched PDF. Returns (title, text).
    Raises a friendly error for scanned/image-only PDFs that carry no text."""
    try:
        from io import BytesIO

        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data))
        pages = []
        # 20 pages covers a typical paper and keeps parse time well inside the
        # serverless budget — bigger books should be uploaded instead of fetched.
        for page in reader.pages[:20]:
            try:
                pages.append(page.extract_text() or "")
            except Exception:
                continue
        text = "\n\n".join(p for p in pages if p.strip())
        title = ""
        try:
            title = (reader.metadata.title or "").strip() if reader.metadata else ""
        except Exception:
            title = ""
    except Exception:
        raise HTTPException(
            400,
            "That PDF couldn't be read. Try downloading it and using the upload button instead.",
        )

    text = re.sub(r"[ \t\r\f]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text).strip()
    if len(text) < 200:
        raise HTTPException(
            400,
            "This PDF has no selectable text (it looks scanned). Try another link, "
            "or upload a text-based PDF.",
        )
    return (title or url), text[:HARD_MAX_INPUT_CHARS]


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
    # Granular timeouts + a hard byte cap via streaming. Searched papers often
    # point at slow publisher PDFs; without this, a slow fetch eats the whole
    # serverless budget and Vercel returns a 502/504 that reaches the user as a
    # confusing "couldn't reach the server". Failing fast with a clean 400 lets
    # the client show an actionable message and offer the upload path instead.
    MAX_BYTES = 6_000_000
    timeout = httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)
    try:
        async with httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ResearchMindBot/1.0)"},
        ) as client:
            async with client.stream("GET", url) as r:
                r.raise_for_status()
                ctype = (r.headers.get("content-type") or "").lower()
                chunks, total = [], 0
                async for chunk in r.aiter_bytes():
                    chunks.append(chunk)
                    total += len(chunk)
                    if total >= MAX_BYTES:
                        break  # stop downloading once we have enough
                raw = b"".join(chunks)
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise HTTPException(
            400,
            "That source took too long to load. Try another link, or download the "
            "PDF and use the upload button.",
        )
    except Exception:
        raise HTTPException(
            400, "Couldn't fetch that URL — check the link, or upload the PDF instead."
        )

    # PDFs are binary — extract real text instead of stripping "tags" from bytes
    # (which fed raw PDF internals like "endobj/xref/stream" to the model).
    if "application/pdf" in ctype or raw[:5] == b"%PDF-":
        return extract_pdf_text(raw, url)

    html = raw.decode(r.encoding or "utf-8", errors="replace")[:800_000]
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
    # Publisher/paywall/preview pages (Google Books, ScienceDirect, etc.) return
    # a shell with almost no article text. Say so instead of letting the model
    # guess from the title.
    if len(text) < 400:
        raise HTTPException(
            400,
            "This page doesn't expose the full text (it may be paywalled or a "
            "preview). Try a direct PDF link, or download the file and upload it.",
        )
    return title, text[:HARD_MAX_INPUT_CHARS]


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

    pro = await enforce_tier(request, "summarize")

    # Web app sends only a URL — fetch and extract the page server-side.
    if len(text) < 40 and body.url:
        fetched_title, text = await fetch_page_text(body.url)
        title = title or fetched_title
    if len(text) < 40:
        raise HTTPException(400, "Not enough readable text on this page to summarize.")

    cap = PRO_MAX_INPUT_CHARS if pro else FREE_MAX_INPUT_CHARS
    summary = await llm_chat(
        "You are ResearchMind, an expert research assistant. Summarize accurately — "
        "never invent facts, numbers, or citations not present in the text. "
        "If the supplied content is unreadable, truncated, or clearly not the "
        "article (e.g. binary junk or an error page), say so plainly in one line "
        "and stop — do NOT reconstruct a summary from the title or prior knowledge. "
        "Use **bold** for section headers and '• ' for bullets. " + SUMMARY_STYLES[length],
        f"Title: {title}\n\nContent:\n{clamp_for_llm(text, cap)}",
        max_tokens=900,
    )
    await cache_put(body.url, length, summary)
    # Return the extracted source text so the client can power "chat with this
    # paper" without re-fetching. Capped to keep the response reasonable.
    return {
        "summary": summary,
        "cached": False,
        "title": title or body.url,
        "source": text[:PRO_MAX_INPUT_CHARS],
    }


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
    url: str = ""
    title: str = ""
    style: str = "APA"
    text: str = ""  # pasted / uploaded paper content
    concept: str = ""  # a specific quote or concept to cite from the source


@app.post("/cite")
async def cite(body: CiteRequest, request: Request):
    style = body.style if body.style in CITATION_STYLES else "APA"
    await enforce_tier(request, "cite")
    today = datetime.now(timezone.utc).strftime("%B %d, %Y")

    content = body.text.strip()
    title = body.title.strip()
    # When only a link is given, fetch & read the page so the citation is built
    # from real metadata (author, date, publisher) instead of the URL alone.
    if not content and body.url:
        try:
            fetched_title, content = await fetch_page_text(body.url)
            title = title or fetched_title
        except HTTPException:
            content = ""

    concept = body.concept.strip()
    if content:
        system = (
            f"You are ResearchMind, an expert at {style} citations. From the SOURCE "
            "CONTENT, identify the real author(s), publication year/date, title, and "
            f"publisher or site, and build an accurate {style} reference. Use the URL "
            f"and access date {today} for web sources. Never invent details that are "
            "genuinely absent — follow the style's missing-information rules instead."
        )
        if concept:
            system += (
                "\n\nThe user wants to cite a specific idea/quote from this source. "
                "Return markdown with exactly:\n**In-text citation** — the correct "
                f"{style} in-text form for that idea (include a page/section if the "
                "content shows one).\n**Reference** — the full reference-list entry.\n"
                "Base the in-text citation only on where that idea actually appears."
            )
        else:
            system += " Return ONLY the reference-list entry — no preamble or notes."
        user = f"URL: {body.url or 'n/a'}\nConcept to cite: {concept or 'n/a'}\n\nSOURCE CONTENT:\n{clamp_for_llm(content, 24000)}"
        citation = await llm_chat(system, user, max_tokens=350)
    else:
        citation = await llm_chat(
            f"You generate {style}-style citations for web sources. Return ONLY the "
            "citation text — no preamble. If author or date are unknown, follow the "
            "style's missing-information rules rather than inventing them.",
            f"Title: {title or 'Unknown'}\nURL: {body.url}\nAccessed: {today}",
            max_tokens=200,
        )
    return {"citation": citation, "style": style}


class TextRequest(BaseModel):
    text: str


# (system prompt, temperature). AI detectors key on low "burstiness" (uniform
# sentence length) and low "perplexity" (predictable word choice), so the
# humanizer deliberately raises both. Grammar polish runs near-deterministic
# so it fixes errors instead of introducing them.
WRITER_TOOLS = {
    "humanize": (
        "You rewrite AI-generated text so it reads as if a real person wrote it. "
        "Keep the meaning, facts, and roughly the same length, but transform the "
        "STYLE using how humans actually write:\n"
        "• Burstiness — vary sentence length hard. Mix very short sentences (even "
        "three words) with longer, winding ones. Never let sentences settle into a "
        "uniform rhythm.\n"
        "• Natural word choice — prefer specific, concrete, occasionally unexpected "
        "words over generic ones. Use contractions (it's, don't, they're).\n"
        "• Vary sentence openings — do not start consecutive sentences the same way. "
        "Occasionally open with 'And', 'But', or 'So'.\n"
        "• Kill AI tells — remove 'Moreover', 'Furthermore', 'Additionally', "
        "'In conclusion', 'It is important to note', 'plays a crucial role', "
        "'delve', 'tapestry', 'realm', and balanced 'not only… but also' scaffolding.\n"
        "• Add light human texture — a rhetorical question, an aside, a plain-spoken "
        "phrase — without adding new facts.\n"
        "Grammar must stay correct. Return ONLY the rewritten text, nothing else."
    ),
    "paraphrase": (
        "Rewrite the text completely in fresh words and sentence structures while "
        "preserving the exact meaning and every fact. Do not reuse distinctive "
        "phrases from the original — change the wording enough that it would not be "
        "flagged as copied, yet reads naturally with varied sentence length. Keep "
        "grammar correct. Return ONLY the rewritten text."
    ),
    "polish": (
        "You are a meticulous copy editor. Correct EVERY error in the text: grammar, "
        "spelling, punctuation, capitalization, subject–verb agreement, verb tense, "
        "articles (a/an/the), prepositions, plurals, and run-on or fragmented "
        "sentences. Read the whole text carefully and fix all mistakes. Preserve the "
        "author's meaning, voice, and content — do not add, remove, or restructure "
        "ideas. Return ONLY the fully corrected text, nothing else."
    ),
}

WRITER_TEMP = {"humanize": 1.0, "paraphrase": 0.8, "polish": 0.15}


async def rewriteai_humanize(text: str) -> str | None:
    """Humanize via RewriteAI. Returns None on any failure so the caller can
    fall back to the in-house humanizer rather than surfacing an error."""
    if not REWRITEAI_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                REWRITEAI_URL,
                headers={
                    "Authorization": f"Bearer {REWRITEAI_KEY}",
                    "Content-Type": "application/json",
                },
                json={"text": text},
            )
            r.raise_for_status()
            data = r.json()
    except Exception:
        return None
    # Response field names aren't guaranteed — accept the common shapes.
    if isinstance(data, str):
        return data.strip() or None
    for key in ("humanized_text", "humanized", "result", "output", "text", "content"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    inner = data.get("data")
    if isinstance(inner, dict):
        for key in ("humanized_text", "humanized", "result", "output", "text"):
            val = inner.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    elif isinstance(inner, str) and inner.strip():
        return inner.strip()
    return None


# Second-pass humanizer used on EVERY writer tool so paraphrased and
# grammar-corrected output doesn't read as machine-written. Unlike the primary
# humanize prompt, this one is explicit about preserving correctness, because
# it runs after the grammar pass.
HUMANIZE_PASS = (
    "Rewrite the text so it reads as natural human writing while keeping the "
    "meaning, facts, and correctness exactly intact.\n"
    "• Vary sentence length sharply — mix short punchy sentences with longer ones.\n"
    "• Use contractions and specific, natural word choices.\n"
    "• Vary how sentences begin; never repeat the same opener.\n"
    "• Remove AI tells: 'Moreover', 'Furthermore', 'Additionally', 'In conclusion', "
    "'It is important to note', 'plays a crucial role', 'delve', 'realm', 'tapestry', "
    "and symmetrical 'not only… but also' scaffolding.\n"
    "• Grammar, spelling and punctuation must remain flawless — do not introduce errors.\n"
    "Return ONLY the rewritten text."
)


# Conservative variant for grammar polish: the text is already correct and the
# user only asked for fixes, so this must not expand, add ideas, or re-explain.
HUMANIZE_LIGHT = (
    "Lightly adjust the phrasing of the text so it reads as natural human writing. "
    "Strict rules:\n"
    "• Do NOT add, remove, or explain any content. Keep the same sentences and "
    "roughly the same length — this is a phrasing touch-up, not a rewrite.\n"
    "• Vary sentence rhythm and use contractions where natural.\n"
    "• Avoid AI tells ('Moreover', 'Furthermore', 'In conclusion', 'delve').\n"
    "• Grammar, spelling and punctuation must remain flawless — never introduce "
    "an error. If a sentence is already natural and correct, leave it unchanged.\n"
    "Return ONLY the resulting text."
)


async def humanize_text(text: str, light: bool = False) -> str:
    """Run text through the humanizer. `light` keeps length/content intact (used
    after grammar polish). Falls back to the input if anything fails, and rejects
    a pass that balloons the text or is suspiciously short."""
    if not light:
        out = await rewriteai_humanize(clamp_for_llm(text, 20_000))
        if out:
            return out
    try:
        result = await llm_chat(
            HUMANIZE_LIGHT if light else HUMANIZE_PASS,
            text,
            max_tokens=2000,
            temperature=0.6 if light else 1.0,
        )
    except Exception:
        return text
    if not result:
        return text
    # Guard against the pass rewriting/expanding beyond its brief.
    ratio = len(result) / max(len(text), 1)
    if light and (ratio > 1.5 or ratio < 0.6):
        return text
    return result


def writer_endpoint(mode: str):
    async def handler(body: TextRequest, request: Request):
        text = body.text.strip()
        if len(text) < 20:
            raise HTTPException(400, "Please provide at least a sentence of text.")
        await enforce_tier(request, mode, pro_only=True)

        if mode == "humanize":
            return {"result": await humanize_text(text)}

        # Paraphrase / grammar polish: do the job, then humanize the output so
        # the result never reads as machine-written. Grammar uses the light pass
        # so corrections aren't expanded into a rewrite.
        result = await llm_chat(
            WRITER_TOOLS[mode], text, max_tokens=2000, temperature=WRITER_TEMP[mode]
        )
        return {"result": await humanize_text(result, light=(mode == "polish"))}

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


# ---- Unified Pro tool endpoint (every remaining research/writing tool) -----

# Each tool: (system prompt, max_tokens). All ground output in the user's own
# pasted text so nothing is fabricated. {opt} is filled from the `option` field.
PRO_TOOLS = {
    "compare": (
        "You are ResearchMind. Compare the provided papers as markdown: "
        "**Shared ground** (bullets with '• '), **Key differences** (bullets), "
        "**Methodological comparison** (bullets), **Verdict** (2-3 sentences on which "
        "is stronger for what purpose). Never invent findings; compare only what the "
        "sources state.",
        1200,
    ),
    "research_gap": (
        "You are ResearchMind, an expert research strategist. From the provided "
        "source(s), identify genuine research gaps as markdown: **Open questions** "
        "(bullets with '• '), **Underexplored angles** (bullets), **Suggested next "
        "studies** (2-3 bullets, each a concrete study design). Ground every gap in "
        "what the sources actually say or omit.",
        1000,
    ),
    "bibliography": (
        "You are ResearchMind. Turn the provided sources (titles, URLs, author/date "
        "notes) into a clean, alphabetically ordered reference list in the style the "
        "user names (default APA). Use ONLY details present in the input — if a field "
        "is missing, follow the style's missing-info rules; never invent authors, "
        "years, or journals. Output each reference on its own line.",
        1200,
    ),
    "flashcards": (
        "You are ResearchMind, a study-tools expert. From the provided text, create "
        "8-15 study flashcards drawn strictly from its content. Format each as two "
        "lines:\n**Q:** <question>\n**A:** <concise answer>\nSeparate cards with a "
        "blank line. Cover the key concepts, definitions, and findings.",
        1600,
    ),
    "mindmap": (
        "You are ResearchMind. Build a hierarchical mind-map outline of the provided "
        "topic or text as nested markdown bullets — a central theme, main branches "
        "(**bold**), and sub-points ('• '). Two to three levels deep. Base every "
        "branch on the input; keep it structural and scannable.",
        1200,
    ),
    "litreview": (
        "You are ResearchMind, an academic writing assistant. Draft a first-draft "
        "literature-review section synthesising the provided papers as markdown: "
        "**Introduction** (what the body of work addresses), **Themes** (bullets "
        "grouping shared findings), **Contrasts & debates** (bullets), **Summary & "
        "gaps** (short paragraph). Synthesise only what the papers state; do not add "
        "outside citations.",
        1800,
    ),
    "related": (
        "You are ResearchMind, a research strategist. From the provided abstract or "
        "topic, suggest how to discover connected work as markdown: **Directions to "
        "explore** (bullets — adjacent subfields, methods, applications), **Search "
        "queries** (5-8 concrete query strings a user could paste into Google Scholar "
        "or arXiv), **Key terms & keywords** (bullets). Do NOT fabricate specific "
        "paper titles, authors, or citations — give directions and search strategies.",
        1000,
    ),
    "tables": (
        "You are ResearchMind. Extract any tabular or structured data present in the "
        "provided text and render it as clean markdown tables, one per distinct table, "
        "each with a short **bold** caption. If the text contains no tabular data, say "
        "so plainly. Use ONLY values present in the text; never invent numbers.",
        1600,
    ),
    "translate": (
        "You are ResearchMind, an expert academic translator. Translate the provided "
        "text into {opt}, preserving meaning, technical terminology, and tone. Return "
        "ONLY the translation, no preamble or notes.",
        2000,
    ),
    "youtube": (
        "You are ResearchMind. The user pasted a lecture/video transcript. Summarise it "
        "into structured study notes as markdown: **Overview** (2-3 sentences), **Key "
        "points** (bullets), **Important terms** (bullets: term — meaning), **Takeaways** "
        "(2-3 bullets). Base everything on the transcript; do not invent content.",
        1400,
    ),
    "askpaper": (
        "You are ResearchMind. Answer the user's question using ONLY the provided "
        "document text. Be accurate and cite the relevant part in your own words. If "
        "the answer is not in the text, say so clearly rather than guessing. "
        "Question: {opt}",
        1000,
    ),
    "digest": (
        "You are ResearchMind, a study guide. For the topic the user names, produce a "
        "learning briefing as markdown: **What it is** (2-3 sentences), **Core "
        "subtopics** (bullets), **Key methods & approaches** (bullets), **Open debates "
        "& directions** (bullets), **How to go deeper** (2-3 search strategies). Give "
        "durable, foundational knowledge; do NOT claim specific recent papers, dates, "
        "or citations you cannot verify.",
        1400,
    ),
}


class ProToolRequest(BaseModel):
    tool: str
    text: str = ""
    papers: list[str] = []
    option: str = ""


@app.post("/pro-tool")
async def pro_tool(body: ProToolRequest, request: Request):
    spec = PRO_TOOLS.get(body.tool)
    if not spec:
        raise HTTPException(400, "Unknown tool.")
    system, max_tokens = spec

    # Accept either a single text blob or multiple papers (joined).
    if body.papers:
        parts = [p.strip()[:20_000] for p in body.papers if p.strip()][:4]
        text = "\n\n---\n\n".join(f"SOURCE {i + 1}:\n{p}" for i, p in enumerate(parts))
    else:
        text = body.text.strip()
    if len(text) < 15:
        raise HTTPException(400, "Please paste some text to work with.")

    pro = await enforce_tier(request, f"pro_{body.tool}", pro_only=True)
    system = system.replace("{opt}", body.option.strip() or "the requested target")
    cap = PRO_MAX_INPUT_CHARS if pro else FREE_MAX_INPUT_CHARS
    result = await llm_chat(system, clamp_for_llm(text, cap), max_tokens=max_tokens)
    return {"result": result}


# ------------------------------------------------------- chat with this paper


class AskRequest(BaseModel):
    question: str
    text: str = ""  # the paper's text (client keeps it from /summarize)
    url: str = ""  # fallback: fetch the source if text wasn't retained
    title: str = ""


@app.post("/ask")
async def ask(body: AskRequest, request: Request):
    """Answer a question grounded strictly in one document — the interactive
    'chat with this paper' feature. Free-tier limited (not Pro-only) so it can
    pull new users in."""
    question = body.question.strip()
    if len(question) < 3:
        raise HTTPException(400, "Please ask a fuller question.")

    pro = await enforce_tier(request, "ask")

    text = body.text.strip()
    # Client didn't retain the source (e.g. a cached summary) — fetch it.
    if len(text) < 40 and body.url:
        _, text = await fetch_page_text(body.url)
    if len(text) < 40:
        raise HTTPException(
            400, "The document text isn't available — re-open the summary and try again."
        )

    cap = PRO_MAX_INPUT_CHARS if pro else FREE_MAX_INPUT_CHARS
    answer = await llm_chat(
        "You are ResearchMind, answering questions about ONE document for a "
        "researcher. Use ONLY the document text provided — do not use outside "
        "knowledge. Answer directly and concisely, quoting or paraphrasing the "
        "relevant part. If the answer is genuinely not in the document, say "
        "\"The document doesn't cover that\" rather than guessing. Use **bold** "
        "and '• ' bullets when it aids clarity.",
        f"DOCUMENT TITLE: {body.title or 'Untitled'}\n\n"
        f"DOCUMENT TEXT:\n{clamp_for_llm(text, cap)}\n\n"
        f"QUESTION: {question}",
        max_tokens=700,
    )
    return {"answer": answer}


# ---------------------------------------------------------- shareable summaries


def _esc(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_summary_html(md: str) -> str:
    """Render the small markdown subset the model emits (**bold**, headers,
    '• ' bullets, numbered items, paragraphs) into safe HTML for the share page."""
    def inline(t: str) -> str:
        out, i = [], 0
        for j, part in enumerate(re.split(r"(\*\*[^*]+\*\*)", t)):
            if part.startswith("**") and part.endswith("**"):
                out.append("<strong>" + _esc(part[2:-2]) + "</strong>")
            else:
                out.append(_esc(part))
        return "".join(out)

    blocks, bullets = [], []

    def flush():
        if bullets:
            blocks.append("<ul>" + "".join(f"<li>{b}</li>" for b in bullets) + "</ul>")
            bullets.clear()

    for raw in md.split("\n"):
        line = raw.strip()
        if not line:
            flush()
            continue
        h = re.match(r"^#{1,6}\s+(.*)$", line)
        if h:
            flush()
            blocks.append(f"<h3>{inline(h.group(1).replace('**', ''))}</h3>")
        elif re.match(r"^[•\-–*]\s", line):
            bullets.append(inline(re.sub(r"^[•\-–*]\s*", "", line)))
        elif re.match(r"^\d+\.\s", line):
            bullets.append(inline(re.sub(r"^\d+\.\s*", "", line)))
        else:
            flush()
            blocks.append(f"<p>{inline(line)}</p>")
    flush()
    return "".join(blocks)


class ShareRequest(BaseModel):
    title: str = ""
    summary: str
    url: str = ""


@app.post("/share")
async def share_create(body: ShareRequest, request: Request):
    """Persist a summary and return a public shareable URL. Every shared link
    carries a 'Try ResearchMind free' CTA — the core growth loop."""
    summary = body.summary.strip()
    if len(summary) < 30:
        raise HTTPException(400, "Nothing to share yet — generate a summary first.")
    if not SUPABASE_URL:
        raise HTTPException(503, "Sharing isn't configured yet. Please try again later.")

    sid = "".join(secrets.choice(KEY_ALPHABET) for _ in range(8)).lower()
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            await sb_insert(
                client,
                "shared_summaries",
                {
                    "id": sid,
                    "title": body.title.strip()[:300] or "Shared summary",
                    "summary": summary[:8000],
                    "source_url": body.url.strip()[:1000],
                },
            )
    except Exception:
        raise HTTPException(
            500, "Couldn't create the share link. Please try again in a moment."
        )
    return {"id": sid, "share_url": f"{PUBLIC_BASE(request)}/s/{sid}"}


def PUBLIC_BASE(request: Request) -> str:
    """Absolute origin of this backend, honouring the proxy host on Vercel."""
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    proto = request.headers.get("x-forwarded-proto", "https")
    return f"{proto}://{host}" if host else API_ORIGIN_FALLBACK


API_ORIGIN_FALLBACK = os.environ.get("API_BASE_URL", "https://airesearchmind.vercel.app").rstrip("/")


@app.get("/s/{sid}", response_class=HTMLResponse)
async def share_view(sid: str):
    sid = re.sub(r"[^a-z0-9]", "", sid.lower())[:16]
    row = None
    if SUPABASE_URL and sid:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                rows = await sb_select(
                    client,
                    "shared_summaries",
                    f"id=eq.{sid}&select=title,summary,source_url&limit=1",
                )
            row = rows[0] if rows else None
        except Exception:
            row = None

    if not row:
        body_html = (
            "<div class='card'><h1>Summary not found</h1>"
            "<p>This shared link may have expired or is incorrect.</p>"
            f"<a class='cta' href='{WEB_APP_URL}'>Try ResearchMind AI free →</a></div>"
        )
        return HTMLResponse(SHARE_SHELL.format(title="ResearchMind AI", body=body_html), status_code=404)

    src = row.get("source_url") or ""
    src_line = (
        f"<a class='src' href='{_esc(src)}' target='_blank' rel='noreferrer noopener'>View original source ↗</a>"
        if src.startswith("http")
        else ""
    )
    body_html = (
        "<div class='card'>"
        "<div class='brand'>📚 ResearchMind AI</div>"
        f"<h1>{_esc(row.get('title') or 'Shared summary')}</h1>"
        f"<div class='summary'>{render_summary_html(row.get('summary') or '')}</div>"
        f"{src_line}"
        "</div>"
        "<div class='promo'>"
        "<p><strong>Summarized in seconds with ResearchMind AI</strong></p>"
        "<p>Search papers, summarize any PDF or link, get citations in 15 styles — free to start.</p>"
        f"<a class='cta' href='{WEB_APP_URL}'>Try ResearchMind AI free →</a>"
        "</div>"
    )
    return HTMLResponse(
        SHARE_SHELL.format(title=_esc(row.get("title") or "Shared summary") + " · ResearchMind AI", body=body_html)
    )


SHARE_SHELL = """<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  :root{{ color-scheme:dark; }}
  *{{ box-sizing:border-box; }}
  body{{ margin:0; font-family:'Inter',system-ui,-apple-system,sans-serif; line-height:1.65;
    color:#e7e3f5; background:
      radial-gradient(70% 50% at 50% -10%, rgba(139,92,246,.16), transparent 60%),
      radial-gradient(60% 45% at 90% 8%, rgba(227,189,118,.08), transparent 55%), #07050f;
    -webkit-font-smoothing:antialiased; padding:28px 18px 60px; }}
  .wrap{{ max-width:680px; margin:0 auto; }}
  .card{{ background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.09);
    border-radius:20px; padding:26px 24px; box-shadow:0 20px 60px rgba(0,0,0,.4); }}
  .brand{{ font-size:13px; font-weight:700; letter-spacing:.02em;
    background:linear-gradient(120deg,#f4d99a,#e3bd76 45%,#caa24f); -webkit-background-clip:text;
    background-clip:text; color:transparent; margin-bottom:14px; }}
  h1{{ font-family:Georgia,'Times New Roman',serif; font-size:24px; line-height:1.25;
    letter-spacing:-.01em; margin:0 0 16px; color:#fff; }}
  .summary h3{{ font-size:15.5px; color:#fff; margin:20px 0 6px; }}
  .summary p{{ margin:.55em 0; color:#cfc9e6; font-size:15px; }}
  .summary ul{{ margin:.4em 0; padding-left:0; list-style:none; }}
  .summary li{{ position:relative; padding-left:20px; margin:.3em 0; color:#cfc9e6; font-size:15px; }}
  .summary li::before{{ content:'•'; position:absolute; left:4px; color:#a78bfa; }}
  .summary strong{{ color:#fff; }}
  .src{{ display:inline-block; margin-top:18px; font-size:13px; color:#7cc7ff; text-decoration:none; }}
  .src:hover{{ text-decoration:underline; }}
  .promo{{ margin-top:20px; text-align:center; padding:22px; border-radius:18px;
    background:rgba(139,92,246,.08); border:1px solid rgba(139,92,246,.2); }}
  .promo p{{ margin:.3em 0; font-size:14px; color:#c9c2e6; }}
  .promo p strong{{ color:#fff; font-size:15px; }}
  .cta{{ display:inline-block; margin-top:14px; padding:13px 26px; border-radius:14px;
    font-weight:700; font-size:15px; text-decoration:none; color:#1c1204;
    background:linear-gradient(120deg,#f4d99a,#e3bd76 45%,#c69a4c); }}
  .cta:hover{{ filter:brightness(1.05); }}
  @media (max-width:520px){{ h1{{ font-size:21px; }} }}
</style></head><body><div class="wrap">{body}</div></body></html>"""


# ------------------------------------------------- Google Scholar paper search


class ScholarRequest(BaseModel):
    query: str


@app.post("/search-papers")
async def search_papers(body: ScholarRequest, request: Request):
    """Search real academic papers via SerpAPI's Google Scholar engine. Returns
    title, authors, year, citation count, link and PDF for each result. Pro-gated
    to protect the shared SerpAPI quota."""
    require_env(("SERPAPI_KEY", SERPAPI_KEY))
    q = body.query.strip()
    if len(q) < 3:
        raise HTTPException(400, "Enter at least a few words to search.")

    # Cache identical queries for 24h — a repeated search costs no SerpAPI call
    # and no daily-limit use, which stretches the shared quota a long way.
    cache_key = "scholar:" + q.lower()
    cached = await cache_get(cache_key, "")
    if cached:
        try:
            return {"papers": json.loads(cached), "query": q, "cached": True}
        except Exception:
            pass

    await enforce_tier(request, "paper_search")

    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(
            "https://serpapi.com/search",
            params={"engine": "google_scholar", "q": q, "api_key": SERPAPI_KEY, "num": 10},
        )
    if r.status_code >= 400:
        raise HTTPException(502, "Paper search is temporarily unavailable. Please try again.")
    data = r.json()

    papers = []
    for it in (data.get("organic_results") or [])[:10]:
        pub = it.get("publication_info", {}) or {}
        summary = pub.get("summary", "")
        year = ""
        m = re.search(r"\b(19|20)\d{2}\b", summary)
        if m:
            year = m.group(0)
        resources = it.get("resources") or []
        pdf = next((x.get("link", "") for x in resources if x.get("file_format") == "PDF"), "")
        cited = (it.get("inline_links", {}).get("cited_by", {}) or {}).get("total", 0)
        papers.append(
            {
                "title": it.get("title", ""),
                "link": it.get("link", ""),
                "snippet": it.get("snippet", ""),
                "authors": summary,
                "year": year,
                "cited_by": cited,
                "pdf": pdf,
            }
        )
    if papers:
        await cache_put(cache_key, "", json.dumps(papers))
    return {"papers": papers, "query": q, "cached": False}
