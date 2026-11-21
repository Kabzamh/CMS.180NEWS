import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Clock, Plus, UserRound } from 'lucide-react';
import { api } from '../lib/api';
import { useMember } from '../contexts/AuthContext';
import { useLoad } from '../hooks/useLoad';
import { DESK, DUE_TONE, dueLabel, type DeskBoard, type DeskStory } from '../lib/desk';
import { fmtShort, timeAgo } from '../lib/format';
import { canEdit } from '../lib/types';
import { AssignDialog, type Assignable } from '../components/AssignDialog';
import { Button, Card, ErrorState, PageHeader, Pill, SkeletonRows, cx } from '../components/ui';

const STAGES: { status: DeskStory['status']; title: string; note: string; empty: string; rule: string }[] = [
  { status: 'draft', title: 'Being written', note: 'Drafts, and stories sent back', empty: 'No drafts in progress.', rule: 'border-t-off' },
  { status: 'review', title: 'Waiting for approval', note: 'With the editors', empty: 'Nothing is waiting for an editor.', rule: 'border-t-warn' },
  { status: 'scheduled', title: 'Approved and scheduled', note: 'Will go live on their own', empty: 'Nothing is scheduled.', rule: 'border-t-navy' },
];

type Show = 'all' | 'mine' | 'unassigned' | 'late';

export default function Assignments() {
  const member = useMember();
  const editor = canEdit(member);
  const board = useLoad(() => api<DeskBoard>(`${DESK}&view=board`), []);
  const [show, setShow] = useState<Show>(editor ? 'all' : 'mine');
  const [assigning, setAssigning] = useState<Assignable | 'new' | null>(null);

  useEffect(() => {
    document.title = 'Assignments · 180news Newsroom CMS';
  }, []);

  const stories = board.data?.stories ?? [];
  const mine = (s: DeskStory) => s.assigned_to === member.id || s.author_id === member.id;
  const late = (s: DeskStory) => s.status !== 'scheduled' && Boolean(s.deadline) && new Date(s.deadline!).getTime() < Date.now();
  const tabs: { key: Show; label: string; count: number }[] = [
    { key: 'all', label: 'Everyone', count: stories.length },
    { key: 'mine', label: 'Mine', count: stories.filter(mine).length },
    ...(editor ? [{ key: 'unassigned' as Show, label: 'Not assigned', count: stories.filter((s) => !s.assigned_to && s.status === 'draft').length }] : []),
    { key: 'late', label: 'Overdue', count: stories.filter(late).length },
  ];
  const shown = stories.filter((s) => (show === 'mine' ? mine(s) : show === 'unassigned' ? !s.assigned_to && s.status === 'draft' : show === 'late' ? late(s) : true));

  return (
    <>
      <PageHeader
        eyebrow="Newsroom"
        title="Assignments"
        description="Every story on its way to being published: who has it, when it is due and where it stands."
        actions={
          editor ? (
            <Button className="h-10" disabled={!board.data} onClick={() => setAssigning('new')} icon={<Plus className="h-[18px] w-[18px]" aria-hidden="true" />}>
              New assignment
            </Button>
          ) : undefined
        }
      />

      {board.error && !board.data ? (
        <ErrorState message={board.error} onRetry={() => board.reload()} />
      ) : !board.data ? (
        <SkeletonRows rows={5} />
      ) : (
        <>
          <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div role="group" aria-label="Show" className="flex w-max gap-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={show === tab.key}
                  onClick={() => setShow(tab.key)}
                  className={cx(
                    'inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 border px-3.5 text-[15px] font-bold whitespace-nowrap transition-colors',
                    show === tab.key ? 'border-ink bg-ink text-white' : 'border-line-strong bg-paper text-body hover:border-ink hover:text-ink',
                  )}
                >
                  {tab.label}
                  <span className={cx('text-[13px] font-extrabold tabular-nums', show === tab.key ? 'text-white/80' : tab.key === 'late' && tab.count > 0 ? 'text-brand' : 'text-muted')}>{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          {stories.length === 0 ? (
            <Card className="px-6 py-12 text-center">
              <ClipboardList className="mx-auto h-9 w-9 text-navy" aria-hidden="true" />
              <p className="mt-2.5 text-lg font-extrabold text-ink">Nothing is in progress</p>
              <p className="mx-auto mt-1 max-w-md text-[15px] leading-relaxed text-muted">
                {editor ? 'Assign a story to a reporter, with a deadline and a brief, and it appears here.' : 'Stories assigned to you, and drafts you start, appear here.'}
              </p>
            </Card>
          ) : (
            <div className="grid items-start gap-5 lg:grid-cols-3">
              {STAGES.map((stage) => {
                const list = shown.filter((s) => s.status === stage.status);
                return (
                  <section key={stage.status} aria-label={stage.title} className={cx('border border-t-4 border-line bg-paper', stage.rule)}>
                    <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-black tracking-[0.06em] text-navy uppercase">{stage.title}</h2>
                        <p className="text-[13px] text-muted">{stage.note}</p>
                      </div>
                      <span className="text-[22px] leading-none font-black text-ink tabular-nums">{list.length}</span>
                    </div>
                    {list.length === 0 ? (
                      <p className="px-4 py-6 text-[15px] text-muted">{show === 'all' ? stage.empty : 'None here.'}</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {list.map((s) => {
                          const due = s.deadline && s.status !== 'scheduled' ? dueLabel(s.deadline) : null;
                          return (
                            <li key={s.id} className="px-4 py-3.5">
                              <Link to={`/articles/${s.id}`} className="block text-[15.5px] leading-snug font-extrabold break-words text-ink hover:text-brand">
                                {s.headline}
                              </Link>
                              <p className="mt-1 flex items-center gap-1.5 text-sm text-body">
                                <UserRound className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                                <span className="min-w-0 truncate">
                                  {s.assigned_name ? <span className="font-bold text-ink">{s.assigned_name}</span> : s.author_name || 'Nobody yet'}
                                  {!s.assigned_name && s.status === 'draft' && <span className="text-muted"> · not assigned</span>}
                                </span>
                              </p>
                              {due && (
                                <p className={cx('mt-0.5 flex items-center gap-1.5 text-sm font-bold', DUE_TONE[due.tone])}>
                                  <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                                  {due.text}
                                </p>
                              )}
                              {s.status === 'scheduled' && s.publish_at && <p className="mt-0.5 text-sm font-bold text-navy">Goes live {fmtShort(s.publish_at)}</p>}
                              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                                {s.review_note && s.status === 'draft' && <Pill className="bg-warn-tint text-warn-deep">Sent back</Pill>}
                                <span>Edited {timeAgo(s.updated_at)}</span>
                              </p>
                              {editor && s.status !== 'scheduled' && (
                                <Button variant="outline" size="sm" className="mt-2.5" onClick={() => setAssigning({ id: s.id, headline: s.headline, assigned_to: s.assigned_to, deadline: s.deadline, brief: s.brief })}>
                                  {s.assigned_to ? 'Change assignment' : 'Assign'}
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-sm text-muted">Deadlines are shown in this device’s time zone. A story leaves this page when it is published.</p>
        </>
      )}

      {assigning && board.data && (
        <AssignDialog
          people={board.data.people}
          story={assigning === 'new' ? null : assigning}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null);
            board.reload(true);
          }}
        />
      )}
    </>
  );
}
