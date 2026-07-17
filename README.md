# ResearchMind AI — Chrome Extension

Your AI research copilot: summarize papers, explain terms, generate citations,
and save highlights. Dark glassmorphism UI · React + Tailwind · Manifest V3.

## Project structure

```
researchmind-ai/
├── public/               # copied into dist/ as-is
│   ├── manifest.json     # Chrome MV3 manifest
│   ├── background.js     # service worker (storage init, license expiry checks)
│   ├── content.js        # page text extraction + selection tracking
│   └── icons/            # generated PNG icons (16/48/128)
├── popup.html            # popup entry (400×600)
├── src/
│   ├── main.jsx          # React entry, bundles Inter locally
│   ├── App.jsx           # shell: header + active tab + tab bar + upgrade modal
│   ├── AppContext.jsx    # global state: usage, license, upgrade modal
│   ├── config.js         # API base URL, limits, prices, feature lists, DEMO_MODE
│   ├── index.css         # Tailwind + glass/gradient/skeleton primitives
│   ├── lib/
│   │   ├── storage.js    # chrome.storage.local (localStorage fallback in dev)
│   │   ├── limits.js     # daily limits, local-midnight reset, countdown math
│   │   ├── license.js    # key format, activation, expiry handling
│   │   ├── api.js        # backend client + page-text bridge (demo mode until backend ships)
│   │   └── highlights.js # saved highlights store
│   └── components/       # Header, TabBar, UsageBar, Countdown, Skeleton,
│       │                 # UpgradeModal, LimitBanner, ErrorCard, RichText, Logo
│       └── tabs/         # HomeTab, ResearchTab, WriterTab, LibraryTab, SettingsTab
├── scripts/generate-icons.mjs  # dependency-free PNG icon generator
└── backend/              # FastAPI on Vercel — subscription & license system
    ├── api/index.py      # /validate-key, /generate-key (PayPal webhook), /health
    ├── supabase_schema.sql
    └── README.md         # deployment checklist: Supabase, PayPal, SMTP, Vercel
```

## Develop

```bash
npm install
npm run dev        # open http://localhost:5173/popup.html in a browser
```

Outside Chrome the app falls back to localStorage and mock page data, so the
whole UI (limits, countdown, upgrade flow) is testable in a normal tab.

## Build & load in Chrome (desktop)

```bash
npm run build      # regenerates icons + outputs a complete extension in dist/
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `dist/` folder
4. Pin ResearchMind AI and click the icon on any article/paper

## Use on a phone

Chrome for Android/iOS does **not** support extensions. Working options:

- **Kiwi Browser (Android)** — Chromium-based, installs Chrome extensions
  as-is: open `kiwi://extensions`, enable Developer mode, load the zipped
  `dist/` (or install from the Web Store after publication).
- **Microsoft Edge Canary (Android)** — supports a subset of extensions.
- iOS has no way to run Chrome extensions; a companion PWA/web app would be
  the path there (the FastAPI backend built in Step 3 can serve it).

## Demo mode & the subscription system

The AI endpoints are live (Hugging Face → Qwen2.5-72B-Instruct), so
`DEMO_MODE = false` in `src/config.js`. `API_BASE` points at a local backend
(`http://127.0.0.1:8000`) for development — switch it to your Vercel URL after
deploying. Flip `DEMO_MODE = true` only to demo the UI without a backend.

The **subscription/license system is real** (no demo path): "Upgrade" opens
the PayPal checkout for the plan in `PAYPAL_PLAN_ID`, PayPal's webhook makes
the backend mint and email a license key, and Settings → Activate Pro
validates it against Supabase via `/validate-key`. Deployment steps:
[backend/README.md](backend/README.md).

## Free tier limits (reset at local midnight)

| Feature            | Per day |
| ------------------ | ------- |
| Summaries          | 3       |
| Term explanations  | 5       |
| Citations          | 2       |
| Highlights saved   | 5       |
