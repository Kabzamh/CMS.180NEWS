import { useEffect, useState } from 'react';
import { Mail, Plus, Trash2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, ApiError, errMsg } from '../lib/api';
import { PageHeader, Card, CardHead, Button, Input, TextArea, Toggle, Select, Spinner, ErrorBox, Toast, Badge, Empty } from '../components/ui';
import type { EmailAccountRow, TeamMember } from '../lib/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function SettingBlock({
  title,
  note,
  settingKey,
  saved,
  onSaved,
  validate,
  children,
}: {
  title: string;
  note?: string;
  settingKey: string;
  saved: any;
  onSaved: (all: any) => void;
  validate?: (draft: any) => Record<string, string>;
  children: (draft: any, setDraft: (p: any) => void, fields: any, saving: boolean) => import('react').ReactNode;
}) {
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setDraft(saved), [saved]);

  const save = async () => {
    const problems = validate ? validate(draft) : {};
    setFields(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    try {
      const all = await api('/api/settings', { method: 'PUT', body: { key: settingKey, value: draft } });
      onSaved(all);
      setToast('Saved.');
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2500);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-lg font-extrabold text-ink">{title}</h2>
        {note && <p className="text-sm text-muted">{note}</p>}
      </div>
      <div className="space-y-3">{children(draft, (p) => setDraft((d: any) => ({ ...d, ...p })), fields, saving)}</div>
      <Button className="mt-4" loading={saving} onClick={save}>Save</Button>
      {toast && <Toast message={toast} />}
    </Card>
  );
}

function EmailAccountsCard() {
  const accounts = useApi<{ accounts: EmailAccountRow[]; domain: string }>(() => api('/api/email-accounts'), []);
  const team = useApi<TeamMember[]>(() => api('/api/team'), []);
  const [localPart, setLocalPart] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [forwardTo, setForwardTo] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const domain = accounts.data?.domain || '180news.co.za';
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const addAccount = async () => {
    setFields({});
    setAdding(true);
    try {
      const created = await api<EmailAccountRow>('/api/email-accounts', {
        method: 'POST',
        body: { local_part: localPart.trim(), display_name: displayName.trim(), forward_to_user_id: forwardTo || null },
      });
      accounts.setData((prev) => (prev ? { ...prev, accounts: [...prev.accounts, created] } : prev));
      flash(`${localPart.trim()}@${domain} created.`);
      setLocalPart('');
      setDisplayName('');
      setForwardTo('');
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      flash(errMsg(e));
    } finally {
      setAdding(false);
    }
  };

  const setAccountForward = async (acc: EmailAccountRow, userId: string) => {
    setBusyId(acc.id);
    try {
      const updated = await api<EmailAccountRow>('/api/email-accounts', { method: 'PUT', body: { id: acc.id, forward_to_user_id: userId || null } });
      accounts.setData((prev) => (prev ? { ...prev, accounts: prev.accounts.map((a) => (a.id === acc.id ? updated : a)) } : prev));
    } catch (e) {
      flash(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (acc: EmailAccountRow) => {
    setBusyId(acc.id);
    try {
      const updated = await api<EmailAccountRow>('/api/email-accounts', { method: 'PUT', body: { id: acc.id, active: !acc.active } });
      accounts.setData((prev) => (prev ? { ...prev, accounts: prev.accounts.map((a) => (a.id === acc.id ? updated : a)) } : prev));
    } catch (e) {
      flash(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const removeAccount = async (acc: EmailAccountRow) => {
    setBusyId(acc.id);
    try {
      await api('/api/email-accounts', { method: 'DELETE', body: { id: acc.id } });
      // Update the list directly rather than relying on a background
      // reload, so a removed mailbox disappears immediately.
      accounts.setData((prev) => (prev ? { ...prev, accounts: prev.accounts.filter((a) => a.id !== acc.id) } : prev));
      flash(`${acc.email} removed.`);
    } catch (e) {
      flash(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHead title="Email accounts" note={`Newsroom mailboxes on @${domain}, forwarded to a desk inbox`} />
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Input
            label="New mailbox"
            placeholder="e.g. sport"
            value={localPart}
            onChange={(e) => setLocalPart(e.target.value)}
            error={fields.local_part}
            hint={localPart ? `${localPart.trim().toLowerCase()}@${domain}` : `yourname@${domain}`}
          />
          <Input label="Display name" placeholder="e.g. Sport desk" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={fields.display_name} />
          <Select label="Forward to" value={forwardTo} onChange={(e) => setForwardTo(e.target.value)}>
            <option value="">No one yet</option>
            {(team.data || []).filter((t) => t.active).map((t) => (
              <option key={t.user_id} value={t.user_id}>{t.name} ({t.role})</option>
            ))}
          </Select>
          <Button icon={<Plus className="h-4 w-4" />} loading={adding} onClick={addAccount}>
            Add
          </Button>
        </div>

        {accounts.loading && !accounts.data ? (
          <Spinner label="Loading email accounts" />
        ) : accounts.error ? (
          <ErrorBox message={accounts.error} onRetry={() => accounts.reload()} />
        ) : !(accounts.data?.accounts || []).length ? (
          <Empty icon={<Mail className="h-8 w-8" />} title="No mailboxes yet">
            Add one above — mail sent to it can be forwarded to any team member's desk inbox.
          </Empty>
        ) : (
          <ul className="divide-y divide-line border border-line">
            {(accounts.data?.accounts || []).map((acc) => (
              <li key={acc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-extrabold text-ink">{acc.email}</p>
                    <Badge tone={acc.active ? 'published' : 'wash'}>{acc.active ? 'Active' : 'Paused'}</Badge>
                  </div>
                  <p className="text-sm text-muted">{acc.display_name}</p>
                </div>
                <Select
                  value={acc.forward_to_user_id || ''}
                  disabled={busyId === acc.id}
                  onChange={(e) => setAccountForward(acc, e.target.value)}
                  className="h-10 w-auto min-w-[160px]"
                >
                  <option value="">Forward to…</option>
                  {(team.data || []).filter((t) => t.active).map((t) => (
                    <option key={t.user_id} value={t.user_id}>{t.name}</option>
                  ))}
                </Select>
                <Button size="sm" variant="outline" disabled={busyId === acc.id} onClick={() => toggleActive(acc)}>
                  {acc.active ? 'Pause' : 'Resume'}
                </Button>
                <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} disabled={busyId === acc.id} onClick={() => removeAccount(acc)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {toast && <Toast message={toast} />}
    </Card>
  );
}

export default function SettingsPage() {
  const settings = useApi<any>(() => api('/api/settings'), []);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Settings · 180news Newsroom CMS';
  }, []);

  if (settings.loading && !settings.data) return <Spinner label="Loading settings" />;
  if (settings.error && !settings.data) return <ErrorBox message={settings.error} onRetry={() => settings.reload()} />;
  const s = settings.data;
  if (!s) return null;

  return (
    <>
      <PageHeader
        eyebrow="Site"
        title="Settings"
        description="The connection to the 180news site, the elections update, newsroom mailboxes and how readers reach the desk."
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHead title="Site connection" />
          <div className="mt-3 space-y-2 text-sm">
            {(s.site_link?.sites || [{ name: '180news', origin: 'https://www.180news.co.za' }]).map((site: any) => (
              <a key={site.origin} href={site.origin} target="_blank" rel="noreferrer" className="block font-bold text-navy hover:underline">
                {site.name}: {site.origin}
              </a>
            ))}
            <p className="text-muted">Public feed: <code className="text-ink">/api/public</code></p>
          </div>
        </Card>

        <SettingBlock title="Elections update" note="Panel on the front page during an election" settingKey="elections_update" saved={s.elections_update} onSaved={settings.setData}>
          {(d, setD, _f, saving) => (
            <>
              <Toggle label="Show the elections update" checked={!!d.enabled} disabled={saving} onChange={(v) => setD({ enabled: v })} />
              <Input label="Title" maxLength={80} disabled={saving} value={d.title || ''} onChange={(e) => setD({ title: e.target.value })} />
              <TextArea label="Update" rows={4} maxLength={600} disabled={saving} value={d.text || ''} onChange={(e) => setD({ text: e.target.value })} hint={`${(d.text || '').length} of 600 characters.`} />
            </>
          )}
        </SettingBlock>

        <SettingBlock
          title="Contact details"
          note="Shown in the site footer and on the About page"
          settingKey="contact"
          saved={s.contact}
          onSaved={settings.setData}
          validate={(d) => {
            const f: Record<string, string> = {};
            if (d.email && !EMAIL_RE.test(d.email)) f.email = 'Enter a valid email address.';
            if (d.phone && d.phone.replace(/[^0-9]/g, '').length < 7) f.phone = 'Enter a valid contact number.';
            return f;
          }}
        >
          {(d, setD, f, saving) => (
            <>
              <Input label="Newsroom email" type="email" disabled={saving} value={d.email || ''} onChange={(e) => setD({ email: e.target.value })} error={f.email} />
              <Input label="Contact number" type="tel" disabled={saving} value={d.phone || ''} onChange={(e) => setD({ phone: e.target.value })} error={f.phone} />
              <Input label="Advertising number" optional type="tel" disabled={saving} value={d.ads_phone || ''} onChange={(e) => setD({ ads_phone: e.target.value })} hint="For businesses that want to book an advert." />
            </>
          )}
        </SettingBlock>

        <EmailAccountsCard />

        <SettingBlock
          title="Email notifications"
          note="Desk-wide defaults for publish, review and comment alerts to staff"
          settingKey="email_notifications"
          saved={s.email_notifications || {
            enabled: true,
            from_name: '180news Newsroom',
            from_email: 'newsroom@180news.co.za',
            notify_on_publish: true,
            notify_on_review: true,
            notify_on_comment: true,
          }}
          onSaved={settings.setData}
          validate={(d) => {
            const f: Record<string, string> = {};
            if (d.from_email && !EMAIL_RE.test(d.from_email)) f.from_email = 'Enter a valid email address.';
            return f;
          }}
        >
          {(d, setD, f, saving) => (
            <>
              <Toggle
                label="Enable desk email alerts"
                description="Queue notification emails when stories move and readers comment."
                checked={d.enabled !== false}
                disabled={saving}
                onChange={(v) => setD({ enabled: v })}
              />
              <Input label="From name" disabled={saving} value={d.from_name || ''} onChange={(e) => setD({ from_name: e.target.value })} />
              <Input label="From email" type="email" disabled={saving} value={d.from_email || ''} onChange={(e) => setD({ from_email: e.target.value })} error={f.from_email} />
              <Toggle label="Notify on publish" checked={d.notify_on_publish !== false} disabled={saving} onChange={(v) => setD({ notify_on_publish: v })} />
              <Toggle label="Notify on review" checked={d.notify_on_review !== false} disabled={saving} onChange={(v) => setD({ notify_on_review: v })} />
              <Toggle label="Notify on new comments" checked={d.notify_on_comment !== false} disabled={saving} onChange={(v) => setD({ notify_on_comment: v })} />
              <p className="text-[13px] text-muted">
                Staff set personal addresses under Your account. Alerts appear in Notifications; connect SMTP later for outbound delivery.
              </p>
            </>
          )}
        </SettingBlock>

        <SettingBlock title="Headline crawl" note="Breaking line that runs ahead of headlines" settingKey="crawl" saved={s.crawl} onSaved={settings.setData}>
          {(d, setD, f, saving) => (
            <>
              <Input label="Breaking line" optional maxLength={140} disabled={saving} value={d.message || ''} onChange={(e) => setD({ message: e.target.value })} error={f.message} placeholder="For example: Results expected at 18:00" />
              <Toggle label="Show the crawl" checked={!!d.enabled} disabled={saving} onChange={(v) => setD({ enabled: v })} />
              <Select label="Speed" disabled={saving} value={d.speed || 'normal'} onChange={(e) => setD({ speed: e.target.value })}>
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </Select>
            </>
          )}
        </SettingBlock>

        <SettingBlock title="Site notice" note="Banner across every page" settingKey="notice" saved={s.notice} onSaved={settings.setData}>
          {(d, setD, f, saving) => (
            <>
              <Toggle label="Show the notice" checked={!!d.enabled} disabled={saving} onChange={(v) => setD({ enabled: v })} />
              <TextArea label="Notice" rows={4} maxLength={240} disabled={saving} value={d.text || ''} onChange={(e) => setD({ text: e.target.value })} error={f.text} hint={`${(d.text || '').length} of 240 characters.`} />
            </>
          )}
        </SettingBlock>

        <Card className="p-5">
          <Toggle
            label="Live updates"
            description="The site checks for new headlines on its own while a reader has it open."
            checked={!!s.live_updates?.enabled}
            onChange={async (v) => {
              try {
                const next = await api('/api/settings', { method: 'PUT', body: { key: 'live_updates', value: { enabled: v } } });
                settings.setData(next);
                setToast(v ? 'Live updates are on.' : 'Live updates are off.');
              } catch (e) {
                setToast(errMsg(e));
              } finally {
                setTimeout(() => setToast(null), 3000);
              }
            }}
          />
        </Card>
      </div>

      <Card className="mt-6">
        <CardHead title="Public API" note="For the 180news site and partners" />
        <ul className="divide-y divide-line text-sm">
          {[
            ['Everything for the front page', '/api/public'],
            ['Published stories', '/api/public?resource=articles'],
            ['One story by id', '/api/public?resource=article&id=1'],
            ['Count a read', '/api/public?resource=view&id=1'],
            ['Categories', '/api/public?resource=sections'],
            ['Authors', '/api/public?resource=authors'],
            ['Comments on a story', '/api/public?resource=comments&id=1'],
            ['Adverts', '/api/public?resource=ads'],
            ['Settings', '/api/public?resource=settings'],
            ['Config', '/api/public?resource=config'],
          ].map(([label, path]) => (
            <li key={path} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:justify-between">
              <span className="font-medium text-ink">{label}</span>
              <code className="text-navy">{path}</code>
            </li>
          ))}
        </ul>
      </Card>
      {toast && <Toast message={toast} />}
    </>
  );
}
