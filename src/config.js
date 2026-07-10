// Central configuration for ResearchMind AI.

// FastAPI backend on Vercel — replace with your deployment URL in Step 3.
export const API_BASE = 'https://researchmind-api.vercel.app';

// Demo mode ONLY affects the AI features (summarize/explain/cite), which
// return realistic mock responses until the Claude endpoints ship in the next
// step. The subscription/license system is fully real and always hits the
// backend. Set to false once the AI endpoints are live.
export const DEMO_MODE = true;

// Real PayPal subscription checkout.
// Create the $1.50/month plan in the PayPal dashboard (see backend/README.md)
// and paste its plan id here.
export const PAYPAL_PLAN_ID = 'YOUR_PAYPAL_PLAN_ID';
export const UPGRADE_URL = `https://www.paypal.com/webapps/billing/subscriptions?plan_id=${PAYPAL_PLAN_ID}`;

export const PRICE_LABEL = '$1.50/month';

export const LIMIT_HIT_MESSAGE =
  "You've used all your free summaries today. Unlock unlimited access for just $1.50/month 🚀";

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
];
