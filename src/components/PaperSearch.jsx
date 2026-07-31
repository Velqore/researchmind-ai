import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { searchPapers } from '../lib/api';
import { SkeletonCard } from './Skeleton';

const URL_RE = /^https?:\/\/\S+\.\S+/;

/** Topic search + link input for the web app. Owns its own state so typing
 *  here doesn't re-render HomeTab's summary/chat tree — a real win on mobile.
 *  Delegates the actual summarizing back up via callbacks. */
export default function PaperSearch({ onSummarizeUrl, onSummarizePaper, busy }) {
  const { license } = useApp();
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState('idle'); // idle | loading | done | error
  const [papers, setPapers] = useState([]);
  const [error, setError] = useState('');

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 3) return;
    setSearchState('loading');
    setError('');
    setPapers([]);
    try {
      const res = await searchPapers({ query: q, licenseKey: license.key });
      setPapers(res.papers || []);
      setSearchState('done');
    } catch (err) {
      setError(err.message || 'Search failed. Please try again.');
      setSearchState('error');
    }
  };

  const submit = () => {
    const q = query.trim();
    if (URL_RE.test(q)) onSummarizeUrl(q);
    else runSearch();
  };

  const loading = searchState === 'loading' || busy;

  return (
    <>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Search a topic, or paste a link…"
          spellCheck={false}
          className="input-dark"
          aria-label="Search papers or paste a link"
        />
        <button
          onClick={submit}
          disabled={loading || query.trim().length < 3}
          className="grad shrink-0 rounded-xl px-4 text-[13px] font-bold text-[#1c1204] transition-all duration-150 hover:brightness-105 active:scale-95 disabled:opacity-50"
          aria-label="Search papers"
        >
          {loading ? '…' : '🔎'}
        </button>
      </div>

      {searchState === 'error' && (
        <p className="animate-fade-in mt-2 text-center text-[11.5px] font-medium text-rose-400">
          {error}
        </p>
      )}
      {searchState === 'loading' && (
        <div className="mt-3">
          <SkeletonCard />
        </div>
      )}
      {searchState === 'done' && papers.length === 0 && (
        <p className="mt-3 text-center text-[11.5px] text-slate-400">
          No papers found — try different keywords.
        </p>
      )}
      {searchState === 'done' && papers.length > 0 && (
        <ul className="animate-fade-in mt-3 max-h-[320px] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {papers.map((p, i) => (
            <li
              key={i}
              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-colors duration-150 active:bg-white/[0.06]"
            >
              <button
                onClick={() => onSummarizePaper(p)}
                className="w-full text-left"
                title="Summarize this paper"
              >
                <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-slate-100">
                  {p.title}
                </span>
                {p.authors && (
                  <span className="mt-1 line-clamp-1 block text-[10.5px] text-slate-400">
                    {p.authors}
                  </span>
                )}
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px]">
                {p.cited_by > 0 && (
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-medium text-slate-300">
                    Cited by {p.cited_by}
                  </span>
                )}
                <button
                  onClick={() => onSummarizePaper(p)}
                  className="font-semibold text-brand-cyan hover:underline"
                >
                  ✨ Summarize
                </button>
                {p.pdf ? (
                  <a
                    href={p.pdf}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="font-semibold text-brand-violet hover:underline"
                  >
                    ⬇ Download PDF
                  </a>
                ) : (
                  p.link && (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-400 hover:underline"
                    >
                      Open ↗
                    </a>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
