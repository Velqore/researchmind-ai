import React from 'react';

/** Minimal renderer for the markdown subset the AI returns:
 *  **bold**, bullet lines (• or -), and blank-line paragraphs. */
export default function RichText({ text }) {
  const renderInline = (line, key) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <React.Fragment key={key}>
        {parts.map((part, i) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={i} className="font-semibold text-white">
              {part.slice(2, -2)}
            </strong>
          ) : (
            part
          )
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-2 text-[12.5px] leading-relaxed text-slate-300">
      {text.split(/\n+/).map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (/^[•\-–]\s/.test(trimmed)) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="mt-[1px] text-brand-violet">•</span>
              <span>{renderInline(trimmed.replace(/^[•\-–]\s*/, ''), i)}</span>
            </div>
          );
        }
        return <p key={i}>{renderInline(trimmed, i)}</p>;
      })}
    </div>
  );
}
