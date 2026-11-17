import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CornerDownLeft, LoaderCircle, Search } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import type { Article } from '../lib/types';
import { STATUS_LABEL, timeAgo } from '../lib/format';
import { STATUS_DOT, cx } from './ui';

/** Top-bar story search: results as you type, arrow keys to move, Enter to open, "/" to focus. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const location = useLocation();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);

  const term = q.trim();
  const shown = open && term.length >= 2;
  const total = results.length + 1; // the last option is "see all results"

  useEffect(() => {
    if (term.length < 2) {
      seq.current += 1;
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const run = ++seq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ items: Article[] }>(`/api/articles?brief=1&limit=6&q=${encodeURIComponent(term)}`);
        if (run !== seq.current) return;
        setResults(res.items);
        setError(null);
        setActive(-1);
      } catch (err) {
        if (run !== seq.current) return;
        setResults([]);
        setError(errorMessage(err));
      } finally {
        if (run === seq.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    navigate(path);
  };

  const allResults = () => go(`/articles?q=${encodeURIComponent(term)}`);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (open) setOpen(false);
      else inputRef.current?.blur();
      return;
    }
    if (term.length < 2) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? total - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = active >= 0 && active < results.length ? results[active] : null;
      if (picked) go(`/articles/${picked.id}`);
      else allResults();
    }
  };

  return (
    <div ref={wrapRef} role="search" className="relative min-w-0 flex-1 lg:max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        role="combobox"
        aria-label="Search stories"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Search stories"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-10 w-full min-w-0 border border-line bg-wash pr-3 pl-10 text-base text-ink placeholder:text-muted focus:border-navy focus:bg-paper focus:ring-2 focus:ring-navy/20 focus:outline-none sm:text-[15px] lg:pr-10"
      />
      {loading ? (
        <LoaderCircle className="pointer-events-none absolute top-1/2 right-3 hidden h-4 w-4 -translate-y-1/2 animate-spin text-brand lg:block" aria-hidden="true" />
      ) : (
        !q && (
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden h-6 min-w-6 -translate-y-1/2 items-center justify-center border border-line-strong bg-paper px-1.5 font-sans text-[12px] font-bold text-muted lg:flex">
            /
          </kbd>
        )
      )}

      {shown && (
        <div className="fixed inset-x-3 top-[58px] z-40 border border-line-strong bg-paper shadow-xl sm:absolute sm:inset-x-0 sm:top-full sm:mt-1.5">
          <ul id={listId} role="listbox" aria-label="Matching stories" className="max-h-[calc(100dvh-76px)] overflow-y-auto sm:max-h-[70dvh]">
            {results.map((story, index) => (
              <li
                key={story.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={active === index}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(`/articles/${story.id}`)}
                className={cx('flex cursor-pointer items-start gap-3 border-b border-line px-3.5 py-2.5', active === index && 'bg-navy-tint')}
              >
                <span aria-hidden="true" className={cx('mt-[7px] h-2.5 w-2.5 shrink-0', STATUS_DOT[story.status])} />
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[15px] leading-snug font-bold text-ink">{story.headline}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted">
                    {STATUS_LABEL[story.status]} · {story.author_name} · edited {timeAgo(story.updated_at)}
                  </span>
                </span>
              </li>
            ))}
            {results.length === 0 && (
              <li role="presentation" className="border-b border-line px-3.5 py-3 text-[15px] text-muted">
                {error ? <span className="font-bold text-brand">{error}</span> : loading ? 'Searching…' : `No headlines match “${term}”.`}
              </li>
            )}
            <li
              id={`${listId}-${results.length}`}
              role="option"
              aria-selected={active === results.length}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(results.length)}
              onClick={allResults}
              className={cx('sticky bottom-0 flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-sm font-bold text-navy', active === results.length ? 'bg-navy-tint' : 'bg-paper')}
            >
              <span className="min-w-0 truncate">See every match in Articles</span>
              <CornerDownLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
