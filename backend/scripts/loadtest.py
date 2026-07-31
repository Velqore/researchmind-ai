#!/usr/bin/env python3
"""ResearchMind AI — load test.

Simulates many concurrent users hitting the live API so you can empirically
confirm capacity (e.g. after enabling Groq billing) BEFORE a real launch.

It reports success rate, latency percentiles, and an error/status breakdown —
the numbers that actually tell you whether you're ready for N users.

Usage:
    python loadtest.py                       # 50 requests, 10 at a time, /explain
    python loadtest.py --total 400 --concurrency 40
    python loadtest.py --endpoint summarize  # heavier: real PDF summarize
    python loadtest.py --base https://airesearchmind.vercel.app

Notes:
  • /explain and /ask are the cheapest realistic AI calls — use them to probe
    throughput without burning your whole token budget.
  • Ramp up gradually (50 → 200 → 800). If success rate stays ~100% and p95
    latency stays reasonable as concurrency climbs, you have headroom.
  • A wall of 429s = you've hit the AI provider's rate limit (the real ceiling).
  • A wall of 502/503 = provider overloaded/unavailable.
"""
import argparse
import asyncio
import statistics
import time
from collections import Counter

import httpx

SAMPLE_PDF = "https://arxiv.org/abs/1706.03762"


def build_request(endpoint: str, i: int) -> tuple[str, dict]:
    if endpoint == "summarize":
        return "/summarize", {"url": SAMPLE_PDF, "length": "short"}
    if endpoint == "ask":
        return "/ask", {"question": f"What is the main contribution? (#{i})", "url": SAMPLE_PDF}
    if endpoint == "search":
        return "/search-papers", {"query": f"machine learning {i % 5}"}
    # default: cheapest AI call
    return "/explain", {"term": f"gradient descent {i}", "context": ""}


async def one(client: httpx.AsyncClient, base: str, endpoint: str, i: int, key: str | None):
    path, payload = build_request(endpoint, i)
    headers = {"X-License-Key": key} if key else {}
    t = time.time()
    try:
        r = await client.post(base + path, json=payload, headers=headers, timeout=120)
        return r.status_code, time.time() - t
    except Exception as e:  # noqa: BLE001
        return type(e).__name__, time.time() - t


async def run(base: str, endpoint: str, total: int, concurrency: int, key: str | None):
    sem = asyncio.Semaphore(concurrency)
    results = []

    async with httpx.AsyncClient() as client:
        async def bound(i):
            async with sem:
                results.append(await one(client, base, endpoint, i, key))

        start = time.time()
        await asyncio.gather(*[bound(i) for i in range(total)])
        wall = time.time() - start

    codes = Counter(str(c) for c, _ in results)
    ok_lat = sorted(dt for c, dt in results if c == 200)
    n_ok = len(ok_lat)

    def pct(p):
        if not ok_lat:
            return 0.0
        k = min(len(ok_lat) - 1, int(len(ok_lat) * p))
        return ok_lat[k]

    print(f"\n=== ResearchMind load test — {endpoint} ===")
    print(f"target        : {base}")
    print(f"requests      : {total}  |  concurrency: {concurrency}")
    print(f"wall time     : {wall:.1f}s  |  throughput: {total / wall:.1f} req/s")
    print(f"success rate  : {n_ok}/{total}  ({100 * n_ok / total:.1f}%)")
    if ok_lat:
        print(
            f"latency (ok)  : p50 {pct(0.5):.1f}s  p95 {pct(0.95):.1f}s  "
            f"max {ok_lat[-1]:.1f}s  mean {statistics.mean(ok_lat):.1f}s"
        )
    print(f"status/errors : {dict(codes)}")
    if codes.get("429"):
        print("  ! 429s present — you're hitting the AI provider's rate limit (the real ceiling).")
    if codes.get("502") or codes.get("503"):
        print("  ! 502/503 present — provider overloaded/unavailable; add capacity (LLM2_*).")
    print()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://airesearchmind.vercel.app")
    ap.add_argument("--endpoint", default="explain",
                    choices=["explain", "ask", "summarize", "search"])
    ap.add_argument("--total", type=int, default=50)
    ap.add_argument("--concurrency", type=int, default=10)
    ap.add_argument("--key", default=None, help="X-License-Key (admin/Pro) to bypass free limits")
    args = ap.parse_args()
    asyncio.run(run(args.base, args.endpoint, args.total, args.concurrency, args.key))
