"""
Create the ResearchMind Pro subscription plan in PayPal.

One-time setup. Creates a Product + a Plan billing $1.40 every 6 months,
then prints the PLAN_ID you paste into src/config.js.

Usage (from the backend/ folder):

    # 1. Get your app credentials from developer.paypal.com
    #    → Apps & Credentials → your app → Client ID + Secret
    # 2. Run in SANDBOX first (safe, fake money):
    setx PP_CLIENT_ID "your-sandbox-client-id"      # PowerShell: $env:PP_CLIENT_ID="..."
    setx PP_SECRET    "your-sandbox-secret"
    # 3. Run it:
    python scripts/create_paypal_plan.py

    # When ready for real money, set PP_LIVE=1 and use your LIVE credentials:
    #   $env:PP_LIVE="1"; python scripts/create_paypal_plan.py
"""

import os
import sys
import httpx

LIVE = os.environ.get("PP_LIVE") == "1"
BASE = "https://api-m.paypal.com" if LIVE else "https://api-m.sandbox.paypal.com"
CLIENT_ID = os.environ.get("PP_CLIENT_ID", "")
SECRET = os.environ.get("PP_SECRET", "")

if not CLIENT_ID or not SECRET:
    sys.exit("Set PP_CLIENT_ID and PP_SECRET environment variables first.")


def main() -> None:
    with httpx.Client(timeout=30) as c:
        # 1. OAuth token
        tok = c.post(
            f"{BASE}/v1/oauth2/token",
            auth=(CLIENT_ID, SECRET),
            data={"grant_type": "client_credentials"},
        )
        tok.raise_for_status()
        headers = {"Authorization": f"Bearer {tok.json()['access_token']}"}

        # 2. Product
        prod = c.post(
            f"{BASE}/v1/catalogs/products",
            headers=headers,
            json={
                "name": "ResearchMind AI Pro",
                "description": "Unlimited AI research tools — summaries, citations, writer tools.",
                "type": "SERVICE",
                "category": "SOFTWARE",
            },
        )
        prod.raise_for_status()
        product_id = prod.json()["id"]
        print(f"✓ Product created: {product_id}")

        # 3. Plan — $1.40 every 6 months, auto-renewing
        plan = c.post(
            f"{BASE}/v1/billing/plans",
            headers=headers,
            json={
                "product_id": product_id,
                "name": "ResearchMind Pro — 6 months",
                "description": "Unlimited access, billed $1.40 every 6 months.",
                "billing_cycles": [
                    {
                        "frequency": {"interval_unit": "MONTH", "interval_count": 6},
                        "tenure_type": "REGULAR",
                        "sequence": 1,
                        "total_cycles": 0,  # 0 = renews forever until cancelled
                        "pricing_scheme": {
                            "fixed_price": {"value": "1.40", "currency_code": "USD"}
                        },
                    }
                ],
                "payment_preferences": {
                    "auto_bill_outstanding": True,
                    "payment_failure_threshold": 2,
                },
            },
        )
        plan.raise_for_status()
        plan_id = plan.json()["id"]

        print(f"✓ Plan created: {plan_id}")
        print()
        print("=" * 60)
        print(f"  MODE: {'LIVE (real money)' if LIVE else 'SANDBOX (test money)'}")
        print(f"  PLAN_ID = {plan_id}")
        print("=" * 60)
        print("Paste this PLAN_ID into src/config.js → PAYPAL_PLAN_ID")


if __name__ == "__main__":
    main()
