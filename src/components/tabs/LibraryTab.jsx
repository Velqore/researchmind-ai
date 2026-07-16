import React, { useEffect, useState } from 'react';
import { useApp } from '../../AppContext';
import { getCurrentPage, getSelection } from '../../lib/api';
import { addHighlight, getHighlights, removeHighlight } from '../../lib/highlights';
import LimitBanner from '../LimitBanner';
import UsageBar from '../UsageBar';

export default function LibraryTab() {
  const { isPro, remainingFor, useFeature } = useApp();
  const [highlights, setHighlights] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getHighlights().then(setHighlights);
  }, []);

  const left = remainingFor('highlight');
  const limitHit = !isPro && left === 0;

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2200);
  };

  const saveSelection = async () => {
    setSaving(true);
    try {
      const selection = await getSelection();
      if (!selection) {
        flash('Highlight some text on the page first, then tap save.');
        return;
      }
      const allowed = await useFeature('highlight');
      if (!allowed) return;
      let page = { url: '', title: '' };
      try {
        page = await getCurrentPage();
      } catch {
        /* selection still saves without page metadata */
      }
      const updated = await addHighlight({ text: selection, url: page.url, title: page.title });
      setHighlights(updated);
      flash('✓ Highlight saved');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    setHighlights(await removeHighlight(id));
  };

  return (
    <div className="space-y-3 py-2">
      <div className="glass p-4">
        <div className="mb-2.5 flex items-start justify-between">
          <div>
            <h2 className="text-[13.5px] font-bold text-white">Save a highlight</h2>
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              Select text on the page, then save it to your library
            </p>
          </div>
          <span className="text-xl">🖍️</span>
        </div>

        {limitHit ? (
          <LimitBanner message="You've saved all your free highlights today. Unlock unlimited access for just $1.40 for 6 months 🚀" />
        ) : (
          <>
            <button onClick={saveSelection} disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : '💾 Save selected text'}
            </button>
            <div className="mt-3">
              <UsageBar feature="highlight" />
            </div>
          </>
        )}
        {notice && (
          <p className="animate-fade-in mt-2 text-center text-[11.5px] font-medium text-brand-cyan">
            {notice}
          </p>
        )}
      </div>

      <div className="glass p-4">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
          Your library {highlights.length > 0 && `(${highlights.length})`}
        </h2>

        {highlights.length === 0 ? (
          <div className="py-6 text-center">
            <div className="mb-2 text-3xl opacity-60">📚</div>
            <p className="text-[12.5px] font-medium text-slate-300">Nothing saved yet</p>
            <p className="mx-auto mt-1 max-w-[260px] text-[11.5px] leading-relaxed text-slate-500">
              Highlights you save from any page will appear here — quotes, definitions, key
              findings.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {highlights.map((h) => (
              <li
                key={h.id}
                className="glass-hover animate-fade-in group rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
              >
                <p className="line-clamp-3 text-[12px] leading-relaxed text-slate-200">
                  “{h.text}”
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <a
                    href={h.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="line-clamp-1 text-[10.5px] text-brand-blue hover:underline"
                  >
                    {h.title || h.url || 'Saved highlight'}
                  </a>
                  <button
                    onClick={() => remove(h.id)}
                    className="shrink-0 text-[10.5px] font-medium text-slate-500 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                    aria-label="Delete highlight"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
