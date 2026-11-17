import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, MessageSquare, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useDebounced, useLoad } from '../hooks/useLoad';
import type { CommentStatus, CommentsResponse, ReaderComment, Settings as SettingsData } from '../lib/types';
import { fmtDateTime, timeAgo } from '../lib/format';
import { Group } from './Settings';
import { Button, Card, CardHead, ConfirmDialog, EmptyState, ErrorState, IconButton, PageHeader, Pill, SkeletonRows, Toggle, cx, inputClass, useToast } from '../components/ui';

const TABS: { key: CommentStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'spam', label: 'Spam' },
  { key: 'all', label: 'All' },
];

const STATUS_PILL: Record<CommentStatus, { label: string; className: string; rule: string }> = {
  pending: { label: 'Pending', className: 'bg-warn-tint text-warn-deep', rule: 'border-warn' },
  approved: { label: 'Approved', className: 'bg-live-tint text-live-deep', rule: 'border-live-deep' },
  rejected: { label: 'Rejected', className: 'bg-brand-tint text-brand', rule: 'border-brand' },
  spam: { label: 'Spam', className: 'bg-ink text-white', rule: 'border-ink' },
};

const DONE: Record<CommentStatus, string> = {
  approved: 'Approved. It can be shown under the story.',
  rejected: 'Rejected. Readers will not see it.',
  spam: 'Marked as spam.',
  pending: 'Moved back to pending.',
};

const EMPTY: Record<string, string> = {
  pending: 'Nothing is waiting. New comments from readers land here first.',
  approved: 'No comments have been approved yet.',
  rejected: 'No comments have been rejected.',
  spam: 'Nothing has been marked as spam.',
  all: 'Readers have not sent any comments yet.',
};

export default function Comments() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const raw = params.get('status') ?? 'pending';
  const status = TABS.some((t) => t.key === raw) ? raw : 'pending';
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim(), 300);

  const list = useLoad(() => {
    const qs = new URLSearchParams();
    if (status !== 'all') qs.set('status', status);
    if (query) qs.set('q', query);
    return api<CommentsResponse>(`/api/comments?${qs.toString()}`);
  }, [status, query]);
  const settings = useLoad(() => api<SettingsData>('/api/settings'), []);

  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ReaderComment | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = 'Comments · 180news Newsroom CMS';
  }, []);

  const moderate = async (comment: ReaderComment, next: CommentStatus) => {
    setBusy(`${next}-${comment.id}`);
    try {
      await api('/api/comments', { method: 'PUT', body: { id: comment.id, status: next } });
      toast(DONE[next]);
      window.dispatchEvent(new Event('comments-changed'));
      await list.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api('/api/comments', { method: 'DELETE', body: { id: toDelete.id } });
      toast('Comment deleted.');
      window.dispatchEvent(new Event('comments-changed'));
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
      <PageHeader eyebrow="Newsroom" title="Comments" description="What readers have written under your stories. Nothing is shown on the site until it is approved, unless you choose otherwise." />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div role="group" aria-label="Filter by status" className="flex w-max gap-1.5">
              {TABS.map((tab) => {
                const active = status === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setParams(tab.key === 'pending' ? {} : { status: tab.key }, { replace: true })}
                    className={cx(
                      'inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 border px-3.5 text-[15px] font-bold whitespace-nowrap transition-colors',
                      active ? 'border-ink bg-ink text-white' : 'border-line-strong bg-paper text-body hover:border-ink hover:text-ink',
                    )}
                  >
                    {tab.label}
                    {counts && <span className={cx('text-[13px] font-extrabold tabular-nums', active ? 'text-white/80' : 'text-muted')}>{counts[tab.key] ?? 0}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative mb-5 max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
            <input type="search" aria-label="Search comments" placeholder="Search what readers wrote" value={search} onChange={(e) => setSearch(e.target.value)} className={cx(inputClass, 'pl-10')} />
          </div>

          {list.error && !list.data ? (
            <ErrorState message={list.error} onRetry={() => list.reload()} />
          ) : list.loading && !list.data ? (
            <SkeletonRows rows={4} />
          ) : items.length === 0 ? (
            query ? (
              <EmptyState icon={<Search className="h-8 w-8" aria-hidden="true" />} title="No comments match" action={<Button variant="outline" onClick={() => setSearch('')}>Clear the search</Button>}>
                Try a different word, or look under another status.
              </EmptyState>
            ) : (
              <EmptyState icon={<MessageSquare className="h-8 w-8" aria-hidden="true" />} title={status === 'pending' ? 'The queue is clear' : 'Nothing here'}>
                {EMPTY[status]}
              </EmptyState>
            )
          ) : (
            <ul className={cx('space-y-3 transition-opacity', list.loading && 'opacity-60')}>
              {items.map((comment) => {
                const pill = STATUS_PILL[comment.status];
                const working = busy !== null;
                return (
                  <li key={comment.id} className={cx('border border-l-4 border-line bg-paper p-4 sm:p-5', pill.rule)}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <p className="text-[16px] font-extrabold text-ink">{comment.author_name}</p>
                      <Pill className={pill.className}>{pill.label}</Pill>
                      <p className="text-[13.5px] text-muted" title={fmtDateTime(comment.created_at)}>
                        {timeAgo(comment.created_at)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      On{' '}
                      {comment.article_headline ? (
                        <Link to={`/articles/${comment.article_id}`} className="font-bold text-navy hover:underline">
                          {comment.article_headline}
                        </Link>
                      ) : (
                        'a story that has been deleted'
                      )}
                    </p>
                    <p className="mt-3 text-[15.5px] leading-relaxed break-words whitespace-pre-line text-body">{comment.body}</p>
                    {comment.moderated_by && comment.status !== 'pending' && (
                      <p className="mt-2 text-[13px] text-muted">
                        {pill.label} by {comment.moderated_by} {timeAgo(comment.moderated_at)}
                      </p>
                    )}
                    <div className="mt-3.5 flex flex-wrap items-center gap-2">
                      {comment.status !== 'approved' && (
                        <Button variant="navy" size="sm" loading={busy === `approved-${comment.id}`} disabled={working} onClick={() => moderate(comment, 'approved')} icon={<Check className="h-4 w-4" aria-hidden="true" />}>
                          Approve
                        </Button>
                      )}
                      {(comment.status === 'pending' || comment.status === 'approved') && (
                        <Button variant="outline" size="sm" loading={busy === `rejected-${comment.id}`} disabled={working} onClick={() => moderate(comment, 'rejected')} icon={<X className="h-4 w-4" aria-hidden="true" />}>
                          Reject
                        </Button>
                      )}
                      {comment.status !== 'spam' && (
                        <Button variant="outline" size="sm" loading={busy === `spam-${comment.id}`} disabled={working} onClick={() => moderate(comment, 'spam')} icon={<ShieldAlert className="h-4 w-4" aria-hidden="true" />}>
                          Spam
                        </Button>
                      )}
                      <IconButton label={`Delete the comment from ${comment.author_name}`} tone="danger" disabled={working} onClick={() => setToDelete(comment)}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {items.length === 200 && <p className="mt-3 text-sm text-muted">Showing the 200 newest. Search to find an older comment.</p>}
        </div>

        <div className="space-y-6">
          {settings.data ? (
            <Group title="Comment settings" settingKey="comments" saved={settings.data.comments} onSaved={settings.setData} saveLabel="Save settings">
              {(value, set, _errors, saving) => (
                <>
                  <Toggle label="Allow comments" description="Readers can write under published stories." checked={value.enabled} disabled={saving} onChange={(enabled) => set({ enabled })} />
                  <Toggle
                    label="Hold every comment for approval"
                    description={value.hold ? 'Nothing appears until an editor approves it.' : 'Comments appear straight away. You can still remove them here.'}
                    checked={value.hold}
                    disabled={saving || !value.enabled}
                    onChange={(hold) => set({ hold })}
                  />
                </>
              )}
            </Group>
          ) : settings.error ? (
            <ErrorState message={settings.error} onRetry={() => settings.reload()} />
          ) : (
            <SkeletonRows rows={1} />
          )}

          <Card>
            <CardHead title="How it works" />
            <ul className="space-y-2.5 p-5 text-[15px] leading-snug text-body">
              <li>Readers give a name and a comment. No email address is asked for or stored.</li>
              <li>Comments with more than two links are sent straight to Spam.</li>
              <li>
                The site sends and loads comments through the links under{' '}
                <Link to="/settings" className="font-bold text-navy underline">
                  Settings, Content feed
                </Link>
                .
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <ConfirmDialog open={Boolean(toDelete)} title="Delete this comment for good?" confirmLabel="Delete comment" busy={deleting} onConfirm={remove} onClose={() => !deleting && setToDelete(null)}>
        <p>
          The comment from <span className="font-bold text-ink">{toDelete?.author_name}</span> will be removed completely. To keep a record but hide it from readers, use Reject instead.
        </p>
      </ConfirmDialog>
    </>
  );
}
