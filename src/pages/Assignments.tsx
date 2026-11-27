import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCheck, CalendarClock } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, CardHead, Select, Badge, Spinner, ErrorBox, Toast, Empty, fmtDate } from '../components/ui';
import type { Article, TeamMember } from '../lib/types';

const OPEN_STATUSES = ['draft', 'review', 'scheduled'];

export default function AssignmentsPage() {
  const articles = useApi<{ items: Article[] }>(() => api('/api/articles'), []);
  const team = useApi<TeamMember[]>(() => api('/api/team'), []);
  const [filterMember, setFilterMember] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Assignments · 180news Newsroom CMS';
  }, []);

  const items = (articles.data?.items || []).filter((a) => OPEN_STATUSES.includes(a.status));
  const members = team.data || [];

  const workload = useMemo(() => {
    const map = new Map<number, number>();
    for (const a of items) {
      if (a.assigned_to) map.set(a.assigned_to, (map.get(a.assigned_to) || 0) + 1);
    }
    return map;
  }, [items]);

  const unassignedCount = items.filter((a) => !a.assigned_to).length;

  const filtered = filterMember
    ? filterMember === 'unassigned'
      ? items.filter((a) => !a.assigned_to)
      : items.filter((a) => String(a.assigned_to) === filterMember)
    : items;

  const assign = async (a: Article, memberId: string) => {
    setBusy(a.id);
    try {
      await api('/api/articles', {
        method: 'PUT',
        body: { id: a.id, revision: a.revision, assigned_to: memberId ? Number(memberId) : null },
      });
      setToast(memberId ? 'Story assigned.' : 'Assignment cleared.');
      await articles.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const setDueDate = async (a: Article, value: string) => {
    setBusy(a.id);
    try {
      await api('/api/articles', {
        method: 'PUT',
        body: { id: a.id, revision: a.revision, due_at: value ? new Date(value).toISOString() : null },
      });
      await articles.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Assignments"
        description="Hand draft, review and scheduled stories to a team member with an optional deadline."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-sm font-bold text-muted">Open stories</p>
          <p className="mt-1 text-2xl font-extrabold text-ink">{items.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm font-bold text-muted">Unassigned</p>
          <p className="mt-1 text-2xl font-extrabold text-brand">{unassignedCount}</p>
        </Card>
        {members.slice(0, 2).map((m) => (
          <Card key={m.id} className="p-4">
            <p className="truncate text-sm font-bold text-muted">{m.name}</p>
            <p className="mt-1 text-2xl font-extrabold text-navy">{workload.get(m.id) || 0}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <CardHead title="Team workload" note="Open stories currently assigned to each team member" />
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-navy" />
                <span className="font-bold text-ink">{m.name}</span>
                <Badge tone="wash">{m.role}</Badge>
              </div>
              <Badge tone="navy">{workload.get(m.id) || 0} stories</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mb-4 max-w-xs">
        <Select label="Filter by assignee" value={filterMember} onChange={(e) => setFilterMember(e.target.value)}>
          <option value="">Everyone</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </div>

      <Card>
        {articles.loading || team.loading ? (
          <Spinner label="Loading assignments" />
        ) : articles.error ? (
          <ErrorBox message={articles.error} onRetry={() => articles.reload()} />
        ) : filtered.length === 0 ? (
          <Empty icon={<UserCheck className="h-8 w-8" />} title="Nothing to assign" />
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Link to={`/articles/${a.id}`} className="font-extrabold text-ink hover:text-brand">
                    {a.headline}
                  </Link>
                  <p className="mt-0.5 text-sm text-muted">
                    <Badge tone={a.status}>{a.status}</Badge>{' '}
                    {a.section && <span className="capitalize">{a.section.replace(/-/g, ' ')}</span>}
                    {a.due_at && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-brand">
                        <CalendarClock className="h-3.5 w-3.5" /> Due {fmtDate(a.due_at)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={a.assigned_to ?? ''}
                    disabled={busy === a.id}
                    onChange={(e) => assign(a, e.target.value)}
                    className="h-10 border border-line-strong bg-paper px-3 text-sm font-bold text-ink outline-none focus:border-navy"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    disabled={busy === a.id}
                    defaultValue={a.due_at ? a.due_at.slice(0, 10) : ''}
                    onChange={(e) => setDueDate(a, e.target.value)}
                    className="h-10 border border-line-strong bg-paper px-2 text-sm text-ink outline-none focus:border-navy"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {toast && <Toast message={toast} />}
    </>
  );
}
