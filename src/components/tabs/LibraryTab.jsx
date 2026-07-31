import React, { useEffect, useState } from 'react';
import { useApp } from '../../AppContext';
import { getCurrentPage, getSelection } from '../../lib/api';
import { downloadMarkdown, downloadWord } from '../../lib/exporters';
import { addHighlight, getHighlights, removeHighlight } from '../../lib/highlights';
import { getSaved, removeSaved, SAVED_EVENT } from '../../lib/saved';
import { isWeb } from '../../lib/storage';
import LimitBanner from '../LimitBanner';
import RichText from '../RichText';
import UsageBar from '../UsageBar';

export default function LibraryTab() {
  const { isPro, remainingFor, useFeature } = useApp();
  const [highlights, setHighlights] = useState([]);
  const [saved, setSaved] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [noteText, setNoteText] = useState(''); // web mode: paste-a-note

  useEffect(() => {
    getHighlights().then(setHighlights);
    getSaved().then(setSaved);
    // The tab stays mounted, so refresh when a summary is saved elsewhere.
    const reload = () => getSaved().then(setSaved);
    window.addEventListener(SAVED_EVENT, reload);
    return () => window.removeEventListener(SAVED_EVENT, reload);
  }, []);

  const removeSavedItem = async (id) => {
    setSaved(await removeSaved(id));
    if (expanded === id) setExpanded(null);
  };

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

  const saveNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    const allowed = await useFeature('highlight');
    if (!allowed) return;
    const updated = await addHighlight({ text, url: '', title: 'Saved note' });
    setHighlights(updated);
    setNoteText('');
    flash('✓ Note saved');
  };

  const remove = async (id) => {
    setHighlights(await removeHighlight(id));
  };

  return (
    <div className="space-y-3 py-2">
      <div className="glass p-4">
        <div className="mb-2.5 flex items-start justify-between">
          <div>
            <h2 className="text-[13.5px] font-bold text-white">
              {isWeb ? 'Save a note' : 'Save a highlight'}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-slate-400">
              {isWeb
                ? 'Paste a quote, finding, or idea to keep it in your library'
                : 'Select text on the page, then save it to your library'}
            </p>
          </div>
          <span className="text-xl">🖍️</span>
        </div>

        {limitHit ? (
          <LimitBanner message="You've saved all your free highlights today. Unlock unlimited access for just ₹140 for 6 months 🚀" />
        ) : isWeb ? (
          <>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Paste or type something worth keeping…"
              rows={3}
              className="input-dark resize-none"
              aria-label="Note to save"
            />
            <button
              onClick={saveNote}
              disabled={!noteText.trim()}
              className="btn-primary mt-2.5"
            >
              💾 Save to library
            </button>
            <div className="mt-3">
              <UsageBar feature="highlight" />
            </div>
          </>
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

      {/* ---- Auto-saved summaries ---- */}
      {saved.length > 0 && (
        <div className="glass p-4">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
            Saved summaries ({saved.length})
          </h2>
          <ul className="space-y-2.5">
            {saved.map((s) => {
              const open = expanded === s.id;
              return (
                <li
                  key={s.id}
                  className="animate-fade-in rounded-xl border border-white/[0.06] bg-white/[0.03] p-3"
                >
                  <button
                    onClick={() => setExpanded(open ? null : s.id)}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    <span className="mt-[1px] shrink-0 text-[13px]">📄</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-slate-100">
                        {s.title}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">
                        {new Date(s.createdAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                        })}{' '}
                        · {s.length}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-500">{open ? '▲' : '▼'}</span>
                  </button>

                  {open && (
                    <div className="animate-fade-in mt-2.5 border-t border-white/[0.07] pt-2.5">
                      <RichText text={s.summary} />
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <button
                          onClick={() =>
                            navigator.clipboard.writeText(s.summary.replace(/\*\*/g, ''))
                          }
                          className="chip"
                        >
                          📋 Copy
                        </button>
                        <button
                          onClick={() => downloadMarkdown(s.title, s.summary, s.url)}
                          className="chip"
                        >
                          ⬇ .md
                        </button>
                        <button
                          onClick={() => downloadWord(s.title, s.summary, s.url)}
                          className="chip"
                        >
                          ⬇ Word
                        </button>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="chip">
                            Source ↗
                          </a>
                        )}
                        <button
                          onClick={() => removeSavedItem(s.id)}
                          className="chip ml-auto !text-rose-400/80 hover:!text-rose-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="glass p-4">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-400">
          {isWeb ? 'Saved notes' : 'Highlights'} {highlights.length > 0 && `(${highlights.length})`}
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
