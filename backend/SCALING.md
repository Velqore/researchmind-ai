# Scaling ResearchMind to thousands of users

The code is stateless and auto-scales on Vercel. The **only** capacity ceiling
is the AI provider's daily quota. This doc is the checklist to raise it.

## The math

A rough day at 2000 registered users ≈ **300–500 daily-active**, each doing a
few AI actions ≈ **~3–6M tokens/day**. A single free AI tier can't cover that.
Two ways to get there:

## Option A — Stack free providers (no billing)

`llm_chat` now **load-balances across every configured provider** (random
primary each call), so their free daily quotas *add up* instead of one being
drained while others idle. Add as many free OpenAI-compatible providers as you
can and the aggregate free capacity multiplies.

Each is just env vars in Vercel — no code deploy. All are OpenAI-compatible:

| Provider | Env vars to set | Notes |
|---|---|---|
| **Groq** (already set) | `GROQ_API_KEY`, `GROQ_MODEL` | primary |
| **Google Gemini** | `LLM2_API_KEY`, `LLM2_MODEL=gemini-2.0-flash`, `LLM2_CHAT_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | large free tier |
| **Cerebras** | `LLM3_API_KEY`, `LLM3_MODEL=llama-3.3-70b`, `LLM3_CHAT_URL=https://api.cerebras.ai/v1/chat/completions` | fast, free tier |
| **OpenRouter (free models)** | `LLM2_API_KEY`, `LLM2_MODEL=meta-llama/llama-3.3-70b-instruct:free` | default `LLM2_CHAT_URL` already points at OpenRouter |

> Get a **free** API key from each provider's console. Verify exact free-tier
> limits there (they change) — do not assume. Then load-test (below).

## Option B — Enable billing on one provider (simplest for 2000+)

Add a payment method to **Groq** (pay-as-you-go Dev tier, ~$0.59/M tokens for
llama-3.3-70b). This lifts the daily cap to effectively unlimited and is the
least-effort path to a real launch. Gemini/Cerebras paid tiers work the same.

## Also required at scale

1. Run [`supabase_scale.sql`](supabase_scale.sql) — indexes the hot rate-limit
   query and adds growth-purge crons.
2. **SerpAPI** (paper search): free = 100 searches/month. Pay, or make search
   Pro-only.
3. **Email**: move key delivery off Gmail SMTP (~500/day) to Resend/SendGrid
   before a launch-day purchase burst.
4. **Supabase Pro** ($25/mo) once past a few hundred daily-active users.

## Verify capacity before launch

```bash
# ramp concurrency; watch success rate stay ~100% and p95 latency stay sane
python backend/scripts/loadtest.py --total 200 --concurrency 25 --key <admin-key>
python backend/scripts/loadtest.py --total 400 --concurrency 40 --key <admin-key>
```

- Wall of `429` → provider rate limit hit (add providers / billing).
- Wall of `502/503` → provider overloaded (add providers / billing).
- `~100%` success as concurrency climbs → you have headroom.
