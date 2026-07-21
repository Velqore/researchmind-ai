// API client for the FastAPI backend. Includes the page-text extraction
// bridge to the content script. In DEMO_MODE (backend not yet deployed)
// realistic mock responses are returned so the full UI flow works today.

import { API_BASE, DEMO_MODE } from '../config';
import { isExtension } from './storage';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Get the active tab, then pull readable text via the content script.
 *  Falls back to injecting content.js for tabs opened before install. */
export async function getCurrentPage() {
  if (!isExtension || !chrome.tabs) {
    // Dev preview in a normal browser tab
    return {
      title: 'Attention Is All You Need (dev preview)',
      url: 'https://arxiv.org/abs/1706.03762',
      text: 'Sample page text used during development outside the extension.',
    };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('NO_TAB');
  if (/^(chrome|edge|about|chrome-extension):/.test(tab.url ?? '')) {
    throw new Error('UNSUPPORTED_PAGE');
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' });
  } catch {
    // Content script not present yet — inject it, then retry once.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' });
  }
}

export async function getSelection() {
  if (!isExtension || !chrome.tabs) return '';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return '';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' });
    return res?.selection ?? '';
  } catch {
    return '';
  }
}

async function post(path, body, licenseKey) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(licenseKey ? { 'X-License-Key': licenseKey } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed (${res.status})`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------

const DEMO_SUMMARY = {
  short:
    '**TL;DR** — This page introduces the Transformer, a neural architecture built entirely on attention mechanisms, removing recurrence and convolutions. It trains faster, parallelizes better, and set new state-of-the-art results on machine translation benchmarks.',
  medium:
    '**Overview**\nThis work introduces the Transformer, an architecture that relies entirely on self-attention, dispensing with recurrence and convolutions used in prior sequence models.\n\n**Key points**\n• Multi-head self-attention lets the model weigh relationships between all tokens simultaneously, enabling far better parallelization than RNNs.\n• Positional encodings inject order information without sequential processing.\n• Achieved 28.4 BLEU on WMT 2014 English→German — a new state of the art at the time.\n• Training took 3.5 days on 8 GPUs, a fraction of the cost of previous best models.\n\n**Why it matters**\nThe Transformer became the foundation for virtually all modern large language models, including BERT, GPT, and Claude.',
  detailed:
    '**Overview**\nThis work introduces the Transformer, a sequence transduction architecture that relies entirely on attention mechanisms, dispensing with the recurrence and convolutions used in prior encoder-decoder models.\n\n**Method**\n• The encoder and decoder are stacks of identical layers combining multi-head self-attention with position-wise feed-forward networks, residual connections, and layer normalization.\n• Scaled dot-product attention computes compatibility between queries and keys, scaled by √dₖ to stabilize gradients.\n• Multi-head attention (8 heads) lets the model jointly attend to information from different representation subspaces.\n• Sinusoidal positional encodings inject token-order information without sequential computation.\n\n**Results**\n• 28.4 BLEU on WMT 2014 English→German and 41.8 on English→French — both state of the art at publication.\n• Training completed in 3.5 days on 8 P100 GPUs, dramatically less compute than previous best models.\n• Ablations show attention head count and key dimensionality meaningfully affect quality.\n\n**Limitations & impact**\nAttention is quadratic in sequence length, which later work (sparse/linear attention) addressed. The architecture became the foundation of essentially all modern LLMs — BERT, GPT, and Claude included.',
};

export async function summarize({ url, text, title, length = 'medium', licenseKey }) {
  if (DEMO_MODE) {
    await delay(1400);
    return { summary: DEMO_SUMMARY[length] ?? DEMO_SUMMARY.medium, cached: false, title };
  }
  return post('/summarize', { url, text, title, length }, licenseKey);
}

export async function explainTerm({ term, context, licenseKey }) {
  if (DEMO_MODE) {
    await delay(1000);
    return {
      explanation: `**${term}**\n\nIn plain terms: this is a demo explanation. Once the FastAPI backend is deployed (Step 3), Claude will explain "${term}" using the surrounding page context, at the reading level you choose.`,
    };
  }
  return post('/explain', { term, context }, licenseKey);
}

/** Pro writer tools: mode = 'humanize' | 'paraphrase' | 'polish'. */
export async function rewriteText({ mode, text, licenseKey }) {
  if (DEMO_MODE) {
    await delay(1200);
    return { result: `(demo ${mode}) ${text}` };
  }
  return post(`/${mode}`, { text }, licenseKey);
}

/** Pro: compare 2–4 papers. `papers` is an array of text blocks. */
export async function comparePapers({ papers, licenseKey }) {
  if (DEMO_MODE) {
    await delay(1400);
    return { comparison: '(demo) Comparison of the provided papers…' };
  }
  return post('/compare', { papers }, licenseKey);
}

/** Pro: identify research gaps from 1–4 papers. */
export async function findResearchGaps({ papers, licenseKey }) {
  if (DEMO_MODE) {
    await delay(1400);
    return { gaps: '(demo) Open questions and underexplored angles…' };
  }
  return post('/research-gap', { papers }, licenseKey);
}

export async function generateCitation({ url, title, style, licenseKey }) {
  if (DEMO_MODE) {
    await delay(900);
    const year = new Date().getFullYear();
    const demo = {
      APA: `Vaswani, A., Shazeer, N., Parmar, N., et al. (${year}). ${title || 'Attention is all you need'}. Retrieved from ${url}`,
      MLA: `Vaswani, Ashish, et al. "${title || 'Attention Is All You Need'}." Web. ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}. <${url}>.`,
      Chicago: `Vaswani, Ashish, Noam Shazeer, and Niki Parmar. "${title || 'Attention Is All You Need'}." Accessed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. ${url}.`,
    };
    return { citation: demo[style] ?? demo.APA, style };
  }
  return post('/cite', { url, title, style }, licenseKey);
}
