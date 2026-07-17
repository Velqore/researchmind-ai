# ResearchMind AI — Backend (FastAPI on Vercel)

AI endpoints (Hugging Face Inference Providers, model: `Qwen/Qwen2.5-72B-Instruct` by default) + subscription & license system.

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness probe |
| `/summarize` | POST | Summarize page/document text — cached 24h in Supabase, free-tier limited |
| `/explain` | POST | Explain an academic term (free-tier limited) |
| `/cite` | POST | APA/MLA/Chicago citation (free-tier limited) |
| `/humanize` `/paraphrase` `/polish` | POST | **Pro** writer tools (valid license key required) |
| `/compare` `/research-gap` | POST | **Pro** multi-paper analysis |
| `/validate-key` | POST | Validates a license key (SHA-256 lookup in Supabase, expiry check) |
| `/generate-key` | POST | PayPal webhook: verifies signature, mints a key, saves the hash, emails the key |

Free-tier limits are enforced server-side per hashed IP per day (3 summaries / 5 explains / 2 citations) as a backstop to the client-side limits. Every AI call retries twice before failing. Identical URLs serve cached summaries without touching the AI or the user's limit.

## Quick local test (only needs the HF token)

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt uvicorn
copy .env.example .env        # paste your HF_TOKEN, leave the rest for later
uvicorn api.index:app --env-file .env
```

Supabase/PayPal/SMTP can stay unconfigured for local testing — caching, analytics, and server-side limits switch off gracefully; summarize/explain/cite still work.

## Going live — checklist

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase_schema.sql` in the SQL Editor (enable the **pg_cron** extension first: Database → Extensions).
3. Copy the **Project URL** and **service_role key** (Project Settings → API).

### 2. PayPal
1. In [developer.paypal.com](https://developer.paypal.com) create an app → copy **Client ID** and **Secret** (start in Sandbox).
2. Create a **product** and a **subscription plan**: **$1.40 every 6 months** (PayPal dashboard → Pay & Get Paid → Subscriptions, or via API; billing cycle = 6 months).
3. Paste the plan id into the extension's `src/config.js` → `PAYPAL_PLAN_ID`.
4. Add a **webhook** pointing to `https://YOUR-DEPLOYMENT.vercel.app/generate-key` subscribed to:
   - `BILLING.SUBSCRIPTION.ACTIVATED` (issues the key, valid 180 days)
   - `PAYMENT.SALE.COMPLETED` (renewal → +180 days)
   - `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED` (deactivates the key)
5. Copy the **Webhook ID**.

### 3. Email (SMTP)
For Gmail: enable 2FA, then create an **App Password** (myaccount.google.com → Security → App passwords) and use it as `SMTP_PASS`. For higher deliverability at scale, switch to a transactional provider (Resend, Postmark, SES) later.

### 4. Vercel
1. Import this repo in Vercel; set the **Root Directory** to `backend/`.
2. Add every variable from `.env.example` in Project → Settings → Environment Variables.
3. Deploy, then set the extension's `src/config.js` → `API_BASE` to the deployment URL.

### 5. Test the loop (sandbox)
1. Subscribe with a PayPal **sandbox buyer** account via your plan link.
2. Watch the webhook fire (PayPal dashboard → Webhooks → Events) — a key row appears in Supabase and the email arrives.
3. Paste the key in the extension → Settings → Activate Pro.

## Local development

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt uvicorn
copy .env.example .env                            # fill in values
uvicorn api.index:app --reload --env-file .env
```

## Security notes
- License keys are stored **only as SHA-256 hashes** — the plain key exists solely in the buyer's email.
- Every webhook call is verified against PayPal's `verify-webhook-signature` API; forged events are rejected with 401.
- The Supabase service-role key never leaves the server; RLS blocks the public anon key entirely.
