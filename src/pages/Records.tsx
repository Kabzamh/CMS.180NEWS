import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DatabaseBackup, Download, FileSpreadsheet, RotateCcw, ScrollText, Search } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useDebounced, useLoad } from '../hooks/useLoad';
import { DESK, desk } from '../lib/desk';
import { fmtBytes, fmtDateTime } from '../lib/format';
import type { Activity } from '../lib/types';
import { Button, Card, CardHead, Dialog, ErrorState, PageHeader, Pill, SkeletonRows, Spinner, cx, inputClass, useToast } from '../components/ui';

const KINDS: [string, string][] = [
  ['article', 'Stories'],
  ['team', 'Users and roles'],
  ['backup', 'Backups'],
  ['settings', 'Settings'],
  ['section', 'Categories'],
  ['tag', 'Tags'],
  ['author', 'Authors'],
  ['comment', 'Comments'],
  ['media', 'Media library'],
  ['ad', 'Adverts'],
];
const KIND_LABEL = Object.fromEntries(KINDS);

interface AuditPage {
  items: Activity[];
  more: boolean;
  people: string[];
}

function AuditLog() {
  const toast = useToast();
  const [who, setWho] = useState('');
  const [kind, setKind] = useState('');
  const [day, setDay] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const filters = `${who ? `&who=${encodeURIComponent(who)}` : ''}${kind ? `&kind=${kind}` : ''}${day ? `&day=${day}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const first = useLoad(() => api<AuditPage>(`${DESK}&view=audit${filters}`), [filters]);
  const [extra, setExtra] = useState<Activity[]>([]);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setExtra([]);
    setMore(first.data?.more ?? false);
  }, [first.data]);

  const items = [...(first.data?.items ?? []), ...extra];
  const filtered = Boolean(who || kind || day || q);

  const showMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const next = await api<AuditPage>(`${DESK}&view=audit${filters}&before=${last.id}`);
      setExtra((current) => [...current, ...next.items]);
      setMore(next.more);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const download = async () => {
    setExporting(true);
    try {
      const all = await api<AuditPage>(`${DESK}&view=audit${filters}&limit=5000`);
      // A cell that starts with =, +, - or @ would be run as a formula by a spreadsheet, so it is made plain text.
      const cell = (value: unknown) => {
        const text = String(value ?? '');
        return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
      };
      const rows = [['Date and time', 'Who', 'What', 'About', 'Action'], ...all.items.map((a) => [new Date(a.created_at).toISOString(), a.actor, a.summary, KIND_LABEL[a.entity_type] ?? a.entity_type, a.action])];
      const url = URL.createObjectURL(new Blob([`\ufeff${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `180news-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`${all.items.length} ${all.items.length === 1 ? 'entry' : 'entries'} downloaded${all.more ? ', the newest 5 000' : ''}.`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setExporting(false);
    }
  };

  const select = cx(inputClass, 'h-10 cursor-pointer');

  return (
    <Card>
      <CardHead
        title="Audit log"
        note="Who did what, and when"
        action={
          <Button variant="outline" size="sm" loading={exporting} disabled={!items.length} onClick={download} icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}>
            Download as a spreadsheet
          </Button>
        }
      />
      <div className="grid gap-2.5 border-b border-line p-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_170px]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" aria-label="Search the audit log" placeholder="Search, for example a headline" value={search} onChange={(e) => setSearch(e.target.value)} className={cx(inputClass, 'h-10 pl-9')} />
        </div>
        <select aria-label="Who" value={who} onChange={(e) => setWho(e.target.value)} className={select}>
          <option value="">Everyone</option>
          {(first.data?.people ?? []).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="About" value={kind} onChange={(e) => setKind(e.target.value)} className={select}>
          <option value="">Everything</option>
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input type="date" aria-label="On this day" value={day} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} className={cx(inputClass, 'h-10')} />
      </div>

      {first.error && !first.data ? (
        <div className="p-4">
          <ErrorState message={first.error} onRetry={() => first.reload()} />
        </div>
      ) : !first.data ? (
        <SkeletonRows rows={6} />
      ) : items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <ScrollText className="mx-auto h-8 w-8 text-navy" aria-hidden="true" />
          <p className="mt-2 text-lg font-extrabold text-ink">{filtered ? 'Nothing matches' : 'Nothing has been recorded yet'}</p>
          <p className="mx-auto mt-1 max-w-sm text-[15px] leading-snug text-muted">{filtered ? 'Try another person, kind, day or word.' : 'Saves, publishing, assignments and changes to the site are listed here as they happen.'}</p>
          {filtered && (
            <Button variant="outline" className="mt-4" onClick={() => (setWho(''), setKind(''), setDay(''), setSearch(''))}>
              Clear the filters
            </Button>
          )}
        </div>
      ) : (
        <>
          <ol className={cx('divide-y divide-line transition-opacity', first.loading && 'opacity-60')}>
            {items.map((item) => (
              <li key={item.id} className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-baseline sm:px-5">
                <time dateTime={item.created_at} className="text-[13.5px] text-muted tabular-nums">
                  {fmtDateTime(item.created_at)}
                </time>
                <p className="min-w-0 text-[15px] leading-snug break-words text-body">
                  {item.entity_type === 'article' && item.entity_id && item.action !== 'deleted' ? (
                    <Link to={`/articles/${item.entity_id}`} className="hover:text-brand">
                      {item.summary}
                    </Link>
                  ) : (
                    item.summary
                  )}
                </p>
                <Pill className="w-fit bg-wash text-body ring-1 ring-line-strong ring-inset">{KIND_LABEL[item.entity_type] ?? item.entity_type}</Pill>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-wash px-5 py-3">
            <p className="text-sm text-muted">
              Showing {items.length} {items.length === 1 ? 'entry' : 'entries'}, newest first.
            </p>
            {more && (
              <Button variant="outline" size="sm" loading={loadingMore} onClick={showMore}>
                Show older entries
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

interface Backup {
  name: string;
  at: string;
  kind: 'auto' | 'manual';
  size: number;
}

interface BackupStory {
  id: number;
  headline: string;
  status: string;
  author_name: string;
  updated_at: string;
  now: 'missing' | 'changed' | 'same';
}

const NOW_LABEL = { missing: ['Deleted since', 'bg-brand-tint text-brand'], changed: ['Changed since', 'bg-warn-tint text-warn-deep'], same: ['Unchanged', 'bg-wash text-body ring-1 ring-line-strong ring-inset'] } as const;

function BackupStories({ backup, onClose }: { backup: Backup; onClose: () => void }) {
  const toast = useToast();
  const data = useLoad(() => desk<{ made_at: string; stories: BackupStory[] }>('backup_stories', { name: backup.name }), [backup.name]);
  const [busy, setBusy] = useState<number | null>(null);
  const [back, setBack] = useState<Record<number, number>>({});

  const restore = async (story: BackupStory) => {
    setBusy(story.id);
    try {
      const made = await desk<{ id: number }>('restore_story', { name: backup.name, id: story.id });
      setBack((current) => ({ ...current, [story.id]: made.id }));
      toast('Brought back as a draft. Nothing that is in the CMS now was changed.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      wide
      title={`Stories in the backup of ${fmtDateTime(backup.at)}`}
      onClose={() => busy === null && onClose()}
      footer={
        <Button variant="navy" disabled={busy !== null} onClick={onClose}>
          Done
        </Button>
      }
    >
      {data.error ? (
        <ErrorState message={data.error} onRetry={() => data.reload()} />
      ) : !data.data ? (
        <Spinner label="Opening the backup" />
      ) : data.data.stories.length === 0 ? (
        <p className="py-6 text-center text-[15px] text-muted">This backup holds no stories.</p>
      ) : (
        <>
          <p className="mb-3 text-[15px] leading-snug text-body">
            Any story here can be brought back as it was then. It arrives as a <span className="font-bold text-ink">new draft</span>: the story in the CMS now, if there is one, is not replaced.
          </p>
          <ul className="divide-y divide-line border border-line">
            {data.data.stories.map((story) => (
              <li key={story.id} className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-[15px] leading-snug font-bold break-words text-ink">{story.headline}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                    <Pill className={NOW_LABEL[story.now][1]}>{NOW_LABEL[story.now][0]}</Pill>
                    <span>
                      {story.author_name || 'No byline'} · was {story.status} · last saved {fmtDateTime(story.updated_at)}
                    </span>
                  </p>
                </div>
                {back[story.id] ? (
                  <Link to={`/articles/${back[story.id]}`} className="shrink-0 text-sm font-bold text-navy underline">
                    Open the draft
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" className="shrink-0" loading={busy === story.id} disabled={busy !== null} onClick={() => restore(story)} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
                    Bring back as a draft
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}

function Backups() {
  const toast = useToast();
  const list = useLoad(() => api<{ backups: Backup[]; keep: number }>(`${DESK}&view=backups`), []);
  const [making, setMaking] = useState(false);
  const [fetching, setFetching] = useState<string | null>(null);
  const [opened, setOpened] = useState<Backup | null>(null);

  const make = async () => {
    setMaking(true);
    try {
      const made = await desk<{ counts: Record<string, number>; size: number }>('backup');
      toast(`Backup made: ${made.counts.articles} ${made.counts.articles === 1 ? 'story' : 'stories'}, ${fmtBytes(made.size)}.`);
      await list.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setMaking(false);
    }
  };

  const download = async (backup: Backup) => {
    setFetching(backup.name);
    try {
      const { url } = await desk<{ url: string }>('backup_link', { name: backup.name });
      const link = document.createElement('a');
      link.href = url;
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setFetching(null);
    }
  };

  const backups = list.data?.backups ?? [];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHead
          title="Backups"
          note={list.data ? `The newest ${list.data.keep} are kept` : undefined}
          action={
            <Button size="sm" loading={making} onClick={make} icon={<DatabaseBackup className="h-4 w-4" aria-hidden="true" />}>
              {making ? 'Making a backup' : 'Back up now'}
            </Button>
          }
        />
        {list.error && !list.data ? (
          <div className="p-4">
            <ErrorState message={list.error} onRetry={() => list.reload()} />
          </div>
        ) : !list.data ? (
          <SkeletonRows rows={3} />
        ) : backups.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <DatabaseBackup className="mx-auto h-8 w-8 text-navy" aria-hidden="true" />
            <p className="mt-2 text-lg font-extrabold text-ink">No backups yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[15px] leading-snug text-muted">Make the first one now. After that, one is made each day the dashboard is opened by an editor or an admin.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {backups.map((backup, index) => (
              <li key={backup.name} className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="text-[16px] font-extrabold text-ink tabular-nums">{fmtDateTime(backup.at)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                    <Pill className={backup.kind === 'auto' ? 'bg-navy-tint text-navy' : 'bg-wash text-body ring-1 ring-line-strong ring-inset'}>{backup.kind === 'auto' ? 'Daily' : 'Made by hand'}</Pill>
                    <span className="tabular-nums">{fmtBytes(backup.size)}</span>
                    {index === 0 && <span>· the latest</span>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOpened(backup)} icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
                    Bring back a story
                  </Button>
                  <Button variant="outline" size="sm" loading={fetching === backup.name} onClick={() => download(backup)} icon={<Download className="h-4 w-4" aria-hidden="true" />}>
                    Download
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHead title="What a backup holds" />
        <div className="space-y-3 p-5 text-[15px] leading-snug text-body">
          <p>
            <span className="font-bold text-ink">In it:</span> every story with its search text, assignment and clips, categories, author profiles, comments, adverts, site settings, the media library’s list, view and click counts, and the audit log.
          </p>
          <p>
            <span className="font-bold text-ink">Not in it:</span> the picture, video and audio files themselves, which stay in storage; Mail and the Notepad, which are private to each person; sign-in accounts and passwords; and the version history of
            stories.
          </p>
          <p>
            <span className="font-bold text-ink">Daily:</span> a backup is made the first time each day that an editor or an admin opens the dashboard. On a day nobody does, none is made.
          </p>
          <p>
            <span className="font-bold text-ink">Keep a copy elsewhere:</span> these are stored with the CMS. Download one now and then and keep it somewhere else.
          </p>
        </div>
      </Card>

      {opened && <BackupStories backup={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}

export default function Records() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'backups' ? 'backups' : 'audit';

  useEffect(() => {
    document.title = `${tab === 'backups' ? 'Backups' : 'Audit log'} · 180news Newsroom CMS`;
  }, [tab]);

  return (
    <>
      <PageHeader eyebrow="People" title="Backups and audit log" description="A record of what was done in the newsroom, and copies of its content to fall back on." />
      <div role="tablist" aria-label="Records" className="mb-5 flex w-max border border-line-strong bg-paper">
        {(
          [
            ['audit', 'Audit log'],
            ['backups', 'Backups'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'audit' ? {} : { tab: key }, { replace: true })}
            className={cx('h-10 cursor-pointer px-4 text-[15px] font-bold whitespace-nowrap', tab === key ? 'bg-ink text-white' : 'text-body hover:bg-wash')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'audit' ? <AuditLog /> : <Backups />}
    </>
  );
}
