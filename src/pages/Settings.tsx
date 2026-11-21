import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Download } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useMember } from '../contexts/AuthContext';
import { useLoad } from '../hooks/useLoad';
import type { Article, Settings as SettingsData, SiteLink } from '../lib/types';
import { timeAgo } from '../lib/format';
import { Button, Card, CardHead, ErrorState, PageHeader, Pill, SkeletonRows, TextArea, TextInput, Toggle, cx, useToast } from '../components/ui';

type Key = keyof SettingsData;

/** One settings group with its own Save button, so nothing else is touched by accident. */
export function Group<K extends Key>({
  title,
  note,
  settingKey,
  saved,
  onSaved,
  saveLabel,
  children,
}: {
  title: string;
  note?: string;
  settingKey: K;
  saved: SettingsData[K];
  onSaved: (next: SettingsData) => void;
  saveLabel: string;
  children: (value: SettingsData[K], set: (patch: Partial<SettingsData[K]>) => void, errors: Record<string, string>, saving: boolean) => ReactNode;
}) {
  const toast = useToast();
  const [value, setValue] = useState(saved);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    try {
      const next = await api<SettingsData>('/api/settings', { method: 'PUT', body: { key: settingKey, value } });
      onSaved(next);
      setValue(next[settingKey]);
      setErrors({});
      toast(`${title} saved.`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHead title={title} note={note} />
      <div className="space-y-4 p-5">
        {children(
          value,
          (patch) => {
            setValue((v) => ({ ...(v as object), ...(patch as object) }) as unknown as SettingsData[K]);
            setErrors({});
          },
          errors,
          saving,
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-wash px-5 py-3.5">
        <p className="text-sm text-muted">{dirty ? <span className="font-bold text-warn-deep">Changes not saved yet.</span> : 'Up to date.'}</p>
        <Button loading={saving} disabled={!dirty} onClick={save}>
          {saveLabel}
        </Button>
      </div>
    </Card>
  );
}

function FeedRow({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${path}`;
  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-ink">{label}</p>
        <p className="font-mono text-[13px] break-all text-muted">{path}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
        icon={copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      >
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </li>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('copied');
        } catch {
          setState('failed');
        }
        setTimeout(() => setState('idle'), 2500);
      }}
      icon={state === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select it and copy by hand' : label}
    </Button>
  );
}

const ON_THE_SITE = [
  'Published stories: headline, summary, text, picture with its caption and credit, byline, category and tags',
  'The main headline and the headline news beside it',
  'YouTube videos, short videos and audio clips on each story',
  'The breaking line and the headline crawl',
  'Categories switched on or off',
  'Adverts in all nine positions, and the master switch',
  'Contact details, once they are filled in below',
  'Read counts, and views and clicks of adverts and headlines, which feed Analytics',
];

const NOT_ON_THE_SITE = ['The site notice', 'The elections update text', 'The order of the homepage sections', 'Reader comments', 'Author profiles'];

const DB_TABLES: [string, string][] = [
  ['articles', 'Stories'],
  ['article_media', 'YouTube videos, short videos and audio clips on stories'],
  ['sections', 'Categories'],
  ['authors', 'Author profiles'],
  ['comments', 'Reader comments and their moderation'],
  ['media', 'Media library'],
  ['ads', 'Advert positions and their banner sizes'],
  ['settings', 'Site settings'],
  ['article_views', 'Analytics: one row for each read'],
  ['click_stats', 'Analytics: views and clicks of adverts and headlines'],
  ['mail_messages', 'Mail: messages and alerts, stored encrypted'],
  ['mail_boxes', 'Mail: each person’s folders, read and starred marks'],
  ['notes', 'Notepad: each person’s notes and their save times, stored encrypted'],
  ['activity', 'Recent editorial activity'],
];

/** The SQL script that creates the CMS's tables. Shown to owners, and does not need the database to be working. */
function DatabaseSetup() {
  const toast = useToast();
  const [sql, setSql] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('../../database/schema.sql?raw')
      .then((file) => {
        if (!cancelled) setSql(file.default);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const download = () => {
    if (!sql) return;
    const url = URL.createObjectURL(new Blob([sql], { type: 'application/sql' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '180news-cms-tables.sql';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const copy = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast('Copying is blocked in this browser. Download the script instead.', 'error');
    }
  };

  return (
    <Card className="mt-6">
      <CardHead title="Database tables" note="The PostgreSQL script that creates every table this CMS uses" />
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-[15px] leading-snug text-body">
            For running this CMS on your own Supabase project, or for a developer who needs the exact tables. Paste it into the Supabase SQL Editor and run it. It is safe to run more than once.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="navy" disabled={!sql} onClick={download} icon={<Download className="h-4 w-4" aria-hidden="true" />}>
              Download the script
            </Button>
            <Button variant="outline" disabled={!sql} onClick={copy} icon={copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}>
              {copied ? 'Copied' : 'Copy the script'}
            </Button>
          </div>
          {failed && (
            <p role="alert" className="mt-2 text-[14.5px] font-bold text-brand">
              The script could not be loaded. Reload the page and try again.
            </p>
          )}
          <ul className="mt-5 space-y-2.5 text-[15px] leading-snug text-body">
            <li>A table that already fits is left exactly as it is, rows included.</li>
            <li>
              A table with the same name that does not fit is kept as <span className="font-mono text-[14px]">name_old</span>, and a correct one is made in its place. Nothing is deleted. This is the fix for
              errors such as “column sections.label does not exist”.
            </li>
            <li>It switches on row-level security, so the tables cannot be read or changed with the public key.</li>
            <li>Team members and roles are not in a table. They are the sign-in accounts under Authentication in Supabase.</li>
            <li>The steps for a new project are written at the top of the script.</li>
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="text-[15px] font-extrabold text-ink">What it creates</h3>
          <dl className="mt-2 divide-y divide-line border-y border-line">
            {DB_TABLES.map(([name, purpose]) => (
              <div key={name} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                <dt className="font-mono text-[14px] font-bold text-ink">{name}</dt>
                <dd className="text-sm text-muted">{purpose}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2.5 text-sm leading-snug text-muted">
            Also a private <span className="font-mono text-[13px]">newsroom-mail</span> bucket for Mail attachments, the two public storage buckets, <span className="font-mono text-[13px]">newsroom-media</span> for pictures and <span className="font-mono text-[13px]">newsroom-av</span> for short videos and audio, the ten categories and
            the nine advert positions with their banner sizes.
          </p>
        </div>
      </div>
    </Card>
  );
}

/** How the 180news site is joined to this CMS, and whether it has been done. */
function SiteConnection({ link }: { link: SiteLink }) {
  // The lasting address of this CMS is used when the host reports one and it answers. The address in the
  // browser can be one that is frozen at this version, so it is only the fallback.
  const [cmsUrl, setCmsUrl] = useState<string | null>(link.cms_url && link.cms_url !== window.location.origin ? null : window.location.origin);
  useEffect(() => {
    const candidate = link.cms_url;
    if (!candidate || candidate === window.location.origin) return;
    let cancelled = false;
    fetch(`${candidate}/api/public?resource=config`)
      .then((r) => {
        if (!cancelled) setCmsUrl(r.ok ? candidate : window.location.origin);
      })
      .catch(() => {
        if (!cancelled) setCmsUrl(window.location.origin);
      });
    return () => {
      cancelled = true;
    };
  }, [link.cms_url]);
  const line = cmsUrl ? `<script async src="${cmsUrl}/connect.js"></script>` : 'Checking the address…';
  const request = `In index.html, add this line inside <head>, and change nothing else:\n${line}`;
  const sites = link.sites ?? [];
  const latest = sites[0];
  const live = Boolean(latest && Date.now() - new Date(latest.at).getTime() < 10 * 60000);
  const outdated = sites.some((site) => site.outdated);
  // The starter stories are still published: they would go out to readers with everything else.
  const samples = useLoad(() => api<{ items: Article[] }>('/api/articles?brief=1&limit=50&status=published&q=Sample%20story'), []);
  const sampleCount = (samples.data?.items ?? []).filter((a) => a.headline.startsWith('Sample story')).length;

  return (
    <Card className="border-t-4 border-t-navy lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-black tracking-[0.06em] text-navy uppercase">Connect the 180news site</h2>
          <p className="mt-0.5 text-sm text-muted">One line on the site makes it show what is published here</p>
        </div>
        {!latest ? (
          <Pill className="bg-brand-tint text-brand">Not connected yet</Pill>
        ) : outdated ? (
          <Pill className="bg-warn-tint text-warn-deep">Needs the new line</Pill>
        ) : live ? (
          <Pill className="bg-live-tint text-live-deep">Connected</Pill>
        ) : (
          <Pill className="bg-warn-tint text-warn-deep">No recent check-in</Pill>
        )}
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {!latest ? (
            <p className="border-l-4 border-brand bg-brand-tint px-4 py-3 text-[15px] leading-snug text-ink">
              <span className="font-extrabold">The site has never asked this CMS for content.</span> Until the step below is done on the site, nothing published here appears on it.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {sites.map((site) => (
                <li key={site.origin} className={cx('flex flex-wrap items-baseline justify-between gap-x-4 border-l-4 px-4 py-2.5 text-[15px]', site.outdated ? 'border-warn bg-warn-tint' : 'border-live-deep bg-live-tint')}>
                  <a href={site.origin} target="_blank" rel="noreferrer" className="min-w-0 font-bold break-all text-ink hover:text-navy hover:underline">
                    {site.origin.replace(/^https:\/\//, '')}
                  </a>
                  <span className="text-sm text-body">
                    {site.outdated && <span className="font-bold text-warn-deep">Older connector · </span>}
                    last checked in {timeAgo(site.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {outdated && (
            <p className="mt-2 border-l-4 border-warn bg-warn-tint px-4 py-3 text-[15px] leading-snug text-ink">
              <span className="font-extrabold">The line on that site points at an older copy of this CMS.</span> Stories still reach it, but newer features, such as the five extra advert positions, do not. Replace the
              line on the site with the one below. It then keeps itself up to date.
            </p>
          )}
          {latest && !live && (
            <p className="mt-2 text-sm leading-snug text-muted">The site checks in whenever a reader has it open, so a gap is normal in quiet hours. If it lasts through a busy day, check the line below is still on the site.</p>
          )}

          {sampleCount > 0 && (
            <p className="mt-3 border-l-4 border-warn bg-warn-tint px-4 py-3 text-[15px] leading-snug text-ink">
              <span className="font-extrabold">
                {sampleCount} sample {sampleCount === 1 ? 'story is' : 'stories are'} still published.
              </span>{' '}
              {latest ? 'Readers can see them on the site.' : 'They would appear on the site with your own stories.'}{' '}
              <Link to="/articles?status=published&q=Sample%20story" className="font-bold text-navy underline">
                Hide or delete them
              </Link>
              {latest ? '.' : ' before you connect.'}
            </p>
          )}

          <h3 className="mt-5 text-[15px] font-extrabold text-ink">{latest ? 'The line on the site' : 'What to do'}</h3>
          <p className="mt-1 text-[15px] leading-snug text-body">
            Add this line to the <span className="font-mono text-[14px]">index.html</span> of the news app, anywhere inside <span className="font-mono text-[14px]">&lt;head&gt;</span>, and publish the app again. That is the public site readers visit, not this CMS. Nothing else on it needs to change.
          </p>
          <pre className="mt-3 overflow-x-auto border border-line bg-wash p-3 font-mono text-[13px] leading-relaxed text-ink">{line}</pre>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {cmsUrl && (
              <>
                <CopyButton text={line} label="Copy the line" />
                <CopyButton text={request} label="Copy as a request for your site builder" />
              </>
            )}
          </div>
          <p className="mt-3 text-sm leading-snug text-muted">
            The site was built in its own project, so the line has to be added there. This CMS cannot change the site’s files itself. Add it to every address the site is published at.
          </p>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <h3 className="text-[15px] font-extrabold text-ink">What this CMS then controls on the site</h3>
            <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-body">
              {ON_THE_SITE.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-live-deep" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm leading-snug text-muted">Changes reach readers within about a minute. The site shows the 50 newest stories.</p>
          </div>
          <div>
            <h3 className="text-[15px] font-extrabold text-ink">Kept here, not shown on the site yet</h3>
            <p className="mt-1 text-sm leading-snug text-muted">The site has no place for these today. They need a change to the site itself.</p>
            <p className="mt-1.5 text-[15px] leading-snug text-body">{NOT_ON_THE_SITE.join(' · ')}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Settings() {
  const toast = useToast();
  const member = useMember();
  const settings = useLoad(() => api<SettingsData>('/api/settings'), []);
  const [savingLive, setSavingLive] = useState(false);

  useEffect(() => {
    document.title = 'Settings · 180news Newsroom CMS';
  }, []);

  const data = settings.data;

  const toggleLive = async (enabled: boolean) => {
    setSavingLive(true);
    try {
      settings.setData(await api<SettingsData>('/api/settings', { method: 'PUT', body: { key: 'live_updates', value: { enabled } } }));
      toast(enabled ? 'Live updates are on.' : 'Live updates are off.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSavingLive(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Site" title="Settings" description="The connection to the 180news site, the elections update and how readers reach the newsroom." />

      {settings.error && !data ? (
        <ErrorState message={settings.error} onRetry={() => settings.reload()} />
      ) : !data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <SiteConnection link={data.site_link} />

          <Group
            title="Elections update"
            note="The panel on the front page during an election"
            settingKey="elections_update"
            saved={data.elections_update}
            onSaved={settings.setData}
            saveLabel="Save the update"
          >
            {(value, set, errors, saving) => (
              <>
                <Toggle label="Show the elections update" checked={value.enabled} disabled={saving} onChange={(enabled) => set({ enabled })} />
                <TextInput label="Title" maxLength={80} disabled={saving} value={value.title} onChange={(e) => set({ title: e.target.value })} error={errors.title} />
                <TextArea
                  label="Update"
                  rows={4}
                  maxLength={600}
                  disabled={saving}
                  value={value.text}
                  onChange={(e) => set({ text: e.target.value })}
                  error={errors.text}
                  hint={`${value.text.length} of 600 characters.`}
                  className="resize-y"
                />
              </>
            )}
          </Group>

          <Group title="Contact details" note="Shown in the site footer and on the About page" settingKey="contact" saved={data.contact} onSaved={settings.setData} saveLabel="Save contact details">
            {(value, set, errors, saving) => (
              <>
                <TextInput
                  label="Newsroom email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  disabled={saving}
                  value={value.email}
                  onChange={(e) => set({ email: e.target.value })}
                  error={errors.email}
                />
                <TextInput label="Contact number" type="tel" inputMode="tel" autoComplete="off" disabled={saving} value={value.phone} onChange={(e) => set({ phone: e.target.value })} error={errors.phone} />
                <TextInput
                  label="Advertising number"
                  optional
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  disabled={saving}
                  value={value.ads_phone}
                  onChange={(e) => set({ ads_phone: e.target.value })}
                  error={errors.ads_phone}
                  hint="For businesses that want to book an advert."
                />
              </>
            )}
          </Group>

          <Card className="p-5">
            <Toggle
              label="Live updates"
              description="The site checks for new headlines on its own while a reader has it open."
              checked={data.live_updates.enabled}
              disabled={savingLive}
              onChange={toggleLive}
            />
          </Card>

          <Card className="lg:col-span-2">
            <CardHead title="Content feed for developers" note="The same content as plain links, for anything else you build. The site itself only needs the line above." />
            <ul className="divide-y divide-line">
              <FeedRow label="Everything for the front page, with the homepage sections in order" path="/api/public" />
              <FeedRow label="Published stories" path="/api/public?resource=articles" />
              <FeedRow label="One story, by its number, with its videos and audio" path="/api/public?resource=article&id=1" />
              <FeedRow label="Count a read when a story is opened (feeds the dashboard traffic)" path="/api/public?resource=view&id=1" />
              <FeedRow label="Categories that are switched on" path="/api/public?resource=sections" />
              <FeedRow label="Author profiles" path="/api/public?resource=authors" />
              <FeedRow label="Approved comments on a story" path="/api/public?resource=comments&id=1" />
              <FeedRow label="Send a reader comment (POST with id, name and body)" path="/api/public?resource=comment" />
              <FeedRow label="Adverts that are switched on" path="/api/public?resource=ads" />
              <FeedRow label="Crawl, notice, elections update and contact details" path="/api/public?resource=settings" />
            </ul>
          </Card>
        </div>
      )}

      {member.role === 'owner' && <DatabaseSetup />}
    </>
  );
}
