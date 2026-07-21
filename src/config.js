// Central configuration for ResearchMind AI.

// FastAPI backend on Vercel. For local backend development, switch to
// 'http://127.0.0.1:8000'.
export const API_BASE = 'https://airesearchmind.vercel.app';

// Demo mode returns mock AI responses instead of calling the backend.
// The AI endpoints are live now, so it's off; flip to true only to demo
// the UI without a running backend.
export const DEMO_MODE = false;

// Real PayPal subscription checkout.
// Create the $1.40 / 6-month plan in the PayPal dashboard (see backend/README.md)
// and paste its plan id here.
export const PAYPAL_PLAN_ID = 'YOUR_PAYPAL_PLAN_ID';
export const UPGRADE_URL = `https://www.paypal.com/webapps/billing/subscriptions?plan_id=${PAYPAL_PLAN_ID}`;

export const PRICE_LABEL = '$1.40 / 6 months';
export const PRICE_SUBTEXT = 'One payment · ~23¢ a month';
export const PLAN_DAYS = 180;

export const LIMIT_HIT_MESSAGE =
  "You've used all your free summaries today. Unlock unlimited access for just $1.40 for 6 months 🚀";

// Free tier daily limits — reset at LOCAL midnight.
export const DAILY_LIMITS = {
  summarize: 3,
  explain: 5,
  cite: 2,
  highlight: 5,
};

export const FEATURE_LABELS = {
  summarize: 'Summaries',
  explain: 'Term explanations',
  cite: 'Citations',
  highlight: 'Highlights saved',
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
