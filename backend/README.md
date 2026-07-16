# ResearchMind AI — Backend (FastAPI on Vercel)

Subscription & license system. AI endpoints (`/summarize`, `/explain`, `/cite`, …) ship in the next build step.

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness probe |
| `/validate-key` | POST | Validates a license key (SHA-256 lookup in Supabase, expiry check) |
| `/generate-key` | POST | PayPal webhook: verifies signature, mints a key, saves the hash, emails the key |

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
