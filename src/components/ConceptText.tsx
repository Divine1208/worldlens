import { Fragment } from 'react';
import { CONCEPT_REGEX } from '../lib/conceptDetect';
import { CONCEPT_INDEX } from '../data/concepts';
import { useApp } from '../store/AppContext';

/** Renders text with clickable, dotted-underlined concept terms that open the Term Decoder drawer. */
export function ConceptText({ text, storyId }: { text: string; storyId?: string }) {
  const { openDrawer, user } = useApp();
  if (!text) return null;
  const out: (string | JSX.Element)[] = [];
  let last = 0;
  const seen = new Set<string>();
  for (const m of text.matchAll(new RegExp(CONCEPT_REGEX.source, 'gi'))) {
    const c = CONCEPT_INDEX.get(m[1].toLowerCase());
    const idx = m.index ?? 0;
    if (!c || seen.has(c.term)) continue;
    // acronyms must be upper-case in the text
    if (m[1].length <= 4 && m[1] !== m[1].toUpperCase() && !['saas', 'gdp'].includes(m[1].toLowerCase())) continue;
    seen.add(c.term);
    out.push(text.slice(last, idx));
    const learned = !!user.learnedConcepts[c.term];
    out.push(
      <button
        key={idx}
        onClick={(e) => {
          e.stopPropagation();
          openDrawer({ tab: 'term', term: c.term, storyId });
        }}
        className="cursor-help border-b border-dotted border-sky-500 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300"
        title={learned ? `${c.term} — you’ve decoded this before` : `Decode: ${c.term}`}
      >
        {m[1]}
        {learned && <sup className="ml-0.5 text-[9px] text-emerald-500">✓</sup>}
      </button>,
    );
    last = idx + m[1].length;
  }
  out.push(text.slice(last));
  return (
    <>
      {out.map((x, i) => (
        <Fragment key={i}>{x}</Fragment>
      ))}
    </>
  );
}
