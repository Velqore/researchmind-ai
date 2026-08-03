// Central configuration for ResearchMind AI.

// FastAPI backend on Vercel. For local backend development, switch to
// 'http://127.0.0.1:8000'.
export const API_BASE = 'https://airesearchmind.vercel.app';

// Demo mode returns mock AI responses instead of calling the backend.
// The AI endpoints are live now, so it's off; flip to true only to demo
// the UI without a running backend.
export const DEMO_MODE = false;

// Checkout. The backend hosts two CSP-safe pages:
//   /pay      — Razorpay UPI / GPay / cards (primary, for India)
//   /checkout — PayPal subscription (linked from /pay for international buyers)
export const PAYPAL_PLAN_ID = 'P-0HL98976NA5043041NJPSYHQ';
export const UPGRADE_URL = `${API_BASE}/pay`;

export const PRICE_LABEL = '₹140 / 6 months';
export const PRICE_SUBTEXT = 'One payment · about 140₹ for 6 month';
export const PLAN_DAYS = 180;

export const LIMIT_HIT_MESSAGE =
  "You're out of daily credits. Unlock unlimited access for just ₹140 for 6 months 🚀";

// Free tier uses a single daily CREDIT pool (resets at LOCAL midnight) rather
// than separate per-feature counts. Every action spends credits by roughly how
// much AI work it costs — so a token-style budget, shown to users as friendly
// "credits". ~100 credits ≈ 6 summaries, or 25 explanations, or a mix.
export const FREE_DAILY_CREDITS = 100;

export const CREDIT_COST = {
  summarize: 15,
  ask: 8,
  cite: 6,
  explain: 4,
  paper_search: 2,
  highlight: 1,
};

// Kept for the few places that still reference feature names.
export const FEATURE_LABELS = {
  summarize: 'Summaries',
  explain: 'Term explanations',
  cite: 'Citations',
  highlight: 'Highlights saved',
  ask: 'Paper questions',
};

export const PRO_FEATURES = [
  { icon: '∞', label: 'Unlimited summaries, explanations & citations' },
  { icon: '📊', label: 'Multi-paper comparison' },
  { icon: '🧭', label: 'Research gap identifier' },
  { icon: '📖', label: 'Auto bibliography builder' },
  { icon: '🎥', label: 'YouTube lecture summarizer' },
  { icon: '💬', label: 'Ask questions to any PDF' },
  { icon: '📤', label: 'Export to Notion & Google Docs' },
  { icon: '📰', label: 'Daily research digest (Google Scholar)' },
  { icon: '🕐', label: 'Research timeline builder' },
  { icon: '✨', label: 'AI text humanizer' },
  { icon: '🔄', label: 'Plagiarism remover & paraphraser' },
  { icon: '🃏', label: 'Flashcard generator from any paper' },
  { icon: '🕸️', label: 'Mind-map builder for topics & papers' },
  { icon: '📝', label: 'Literature review draft writer' },
  { icon: '🔗', label: 'Related-papers finder' },
  { icon: '📋', label: 'Table & figure extraction from PDFs' },
  { icon: '🌐', label: 'Translate papers (50+ languages)' },
  { icon: '🧹', label: 'Grammar & clarity polish' },
  { icon: '⚡', label: 'Priority support & early access to new tools' },
];
