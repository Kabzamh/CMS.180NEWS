import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useMember } from '../contexts/AuthContext';
import { useDebounced, useLoad } from '../hooks/useLoad';
import { canEdit, type Article, type ArticleStatus, type Author, type Section } from '../lib/types';
import { fmtShort, timeAgo } from '../lib/format';
import { MediaBadges } from '../components/ClipPlayer';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Pill,
  SkeletonRows,
  StatusBadge,
  buttonClass,
  cx,
  inputClass,
  useToast,
} from '../components/ui';

const TABS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'review', label: 'In review' },
  { key: 'draft', label: 'Drafts' },
  { key: 'hidden', label: 'Hidden' },
];

interface ListResponse {
  items: Article[];
  counts: Record<string, number>;
}

function dateLine(a: Article) {
  if (a.status === 'published') return `Published ${fmtShort(a.publish_at)}`;
  if (a.status === 'scheduled') return `Goes live ${fmtShort(a.publish_at)}`;
  return `Edited ${timeAgo(a.updated_at)}`;
}

export default function Articles() {
  const member = useMember();
  const editor = canEdit(member);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const section = params.get('section') ?? '';
  const author = params.get('author') ?? '';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const query = useDebounced(search.trim(), 300);
  const urlQuery = params.get('q') ?? '';

  useEffect(() => {
    setSearch((current) => (current.trim() === urlQuery ? current : urlQuery));
  }, [urlQuery]);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Article | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = 'Articles · 180news Newsroom CMS';
  }, []);

  const sections = useLoad(() => api<Section[]>('/api/sections'), []);
  const authors = useLoad(() => api<Author[]>('/api/team?authors=1'), []);
  const list = useLoad(() => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (section) qs.set('section', section);
    if (author) qs.set('author', author);
    if (query) qs.set('q', query);
    return api<ListResponse>(`/api/articles?${qs.toString()}`);
  }, [status, section, author, query]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const sectionMap = new Map((sections.data ?? []).map((s) => [s.slug, s]));
  const filtered = Boolean(status || section || author || query);

  const canChange = (a: Article) => editor || (a.author_id === member.id && (a.status === 'draft' || a.status === 'review'));
  const canDelete = (a: Article) => editor || (a.author_id === member.id && a.status === 'draft');

  const setStatus = async (a: Article, next: ArticleStatus) => {
    setBusyId(a.id);
    try {
      await api('/api/articles', { method: 'PUT', body: { id: a.id, status: next } });
      toast(next === 'published' ? 'Published. It is live on the site feed.' : 'Hidden from the site.');
      await list.reload(true);
    } catch (err) {
      const detail = err instanceof ApiError && err.fields ? Object.values(err.fields)[0] : null;
      toast(detail ? `Could not publish yet. ${detail}` : errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api('/api/articles', { method: 'DELETE', body: { id: toDelete.id } });
      toast('Story deleted.');
      setToDelete(null);
      await list.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const items = list.data?.items ?? [];
  const counts = list.data?.counts;

  return (
    <>
      <PageHeader
        eyebrow="Newsroom"
        title="Articles"
        description="Every story the team has written, whatever stage it is at."
      />

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div role="group" aria-label="Filter by status" className="flex w-max gap-1.5">
          {TABS.map((tab) => {
            const active = status === tab.key;
            const count = counts ? counts[tab.key || 'all'] ?? 0 : null;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => setParam('status', tab.key)}
                className={cx(
                  'inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 border px-3.5 text-[15px] font-bold whitespace-nowrap transition-colors',
                  active ? 'border-ink bg-ink text-white' : 'border-line-strong bg-paper text-body hover:border-ink hover:text-ink',
                )}
              >
                {tab.label}
                {count !== null && <span className={cx('text-[13px] font-extrabold tabular-nums', active ? 'text-white/80' : 'text-muted')}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search headlines"
            placeholder="Search headlines"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setParam('q', e.target.value.trim());
            }}
            className={cx(inputClass, 'pl-10')}
          />
        </div>
        <select aria-label="Filter by section" value={section} onChange={(e) => setParam('section', e.target.value)} className={cx(inputClass, 'cursor-pointer')}>
          <option value="">All categories</option>
          {(sections.data ?? []).map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by author" value={author} onChange={(e) => setParam('author', e.target.value)} className={cx(inputClass, 'cursor-pointer')}>
          <option value="">All authors</option>
          {(authors.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={() => list.reload()} />
      ) : list.loading && !list.data ? (
        <SkeletonRows rows={6} />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={<Search className="h-8 w-8" aria-hidden="true" />}
            title="No stories match"
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                Clear the filters
              </Button>
            }
          >
            Try a different word, or widen the status, category or author.
          </EmptyState>
        ) : (
          <EmptyState
            icon={<FileText className="h-8 w-8" aria-hidden="true" />}
            title="No stories yet"
            action={
              <Link to="/articles/new" className={buttonClass('primary')}>
                <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
                Write the first one
              </Link>
            }
          >
            Stories are saved here for the whole team as soon as you write them.
          </EmptyState>
        )
      ) : (
        <>
          {list.error && <p className="mb-3 text-sm font-bold text-brand">Could not refresh the list. {list.error}</p>}
          <ul className={cx('divide-y divide-line border border-line bg-paper transition-opacity', list.loading && 'opacity-60')}>
            {items.map((a) => {
              const sec = a.section ? sectionMap.get(a.section) : undefined;
              return (
                <li key={a.id} className="flex gap-3.5 p-4 sm:gap-4">
                  {a.image_url ? (
                    <img src={a.image_url} alt="" loading="lazy" className="h-[60px] w-20 shrink-0 bg-wash object-cover sm:h-[76px] sm:w-28" />
                  ) : (
                    <div aria-hidden="true" className="flex h-[60px] w-20 shrink-0 items-center justify-center bg-wash text-line-strong sm:h-[76px] sm:w-28">
                      <FileText className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={a.status} />
                        {a.placement === 'main' && <Pill className="bg-brand text-white">Main headline</Pill>}
                        {a.placement === 'headline' && <Pill className="bg-ink text-white">Headline news</Pill>}
                        <MediaBadges kinds={a.media_kinds} />
                        {sec && !sec.enabled && <Pill className="bg-warn-tint text-warn-deep">Category switched off</Pill>}
                      </div>
                      <Link to={`/articles/${a.id}`} className="mt-1.5 block text-[17px] leading-snug font-extrabold text-ink hover:text-brand">
                        {a.headline}
                      </Link>
                      <p className="mt-1 text-sm leading-snug text-muted">
                        <span className="font-bold text-body">{sec?.label ?? 'No category'}</span> · {a.author_name} · {dateLine(a)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link to={`/articles/${a.id}`} className={buttonClass('outline', 'sm')}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        {canChange(a) ? 'Edit' : 'Open'}
                      </Link>
                      {editor && (a.status === 'review' || a.status === 'hidden') && (
                        <Button variant="navy" size="sm" loading={busyId === a.id} onClick={() => setStatus(a, 'published')}>
                          Publish
                        </Button>
                      )}
                      {editor && a.status === 'published' && (
                        <Button variant="outline" size="sm" loading={busyId === a.id} onClick={() => setStatus(a, 'hidden')}>
                          Hide
                        </Button>
                      )}
                      {canDelete(a) && (
                        <IconButton label={`Delete “${a.headline}”`} tone="danger" onClick={() => setToDelete(a)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-muted">
            Showing {items.length} {items.length === 1 ? 'story' : 'stories'}
            {items.length === 300 ? ', the most recently edited. Use the filters to narrow it down.' : '.'}
          </p>
        </>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this story for good?"
        confirmLabel="Delete for good"
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setToDelete(null)}
      >
        <p>
          <span className="font-bold text-ink">{toDelete?.headline}</span> will be removed from the newsroom and from the site. This cannot be undone.
        </p>
        {toDelete?.status === 'published' && <p className="mt-2">To take it off the site but keep the copy, close this and choose Hide instead.</p>}
      </ConfirmDialog>
    </>
  );
}
