import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, CardHead, Button, Input, TextArea, Toggle, Select, Spinner, ErrorBox, Toast } from '../components/ui';

function SettingBlock({
  title,
  note,
  settingKey,
  saved,
  onSaved,
  children,
}: {
  title: string;
  note?: string;
  settingKey: string;
  saved: any;
  onSaved: (all: any) => void;
  children: (draft: any, setDraft: (p: any) => void, fields: any, saving: boolean) => import('react').ReactNode;
}) {
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setDraft(saved), [saved]);

  const save = async () => {
    setSaving(true);
    setFields({});
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
        description="The connection to the 180news site, the elections update and how readers reach the newsroom."
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

        <SettingBlock title="Contact details" note="Shown in the site footer and on the About page" settingKey="contact" saved={s.contact} onSaved={settings.setData}>
          {(d, setD, f, saving) => (
            <>
              <Input label="Newsroom email" type="email" disabled={saving} value={d.email || ''} onChange={(e) => setD({ email: e.target.value })} error={f.email} />
              <Input label="Contact number" type="tel" disabled={saving} value={d.phone || ''} onChange={(e) => setD({ phone: e.target.value })} error={f.phone} />
              <Input label="Advertising number" optional type="tel" disabled={saving} value={d.ads_phone || ''} onChange={(e) => setD({ ads_phone: e.target.value })} hint="For businesses that want to book an advert." />
            </>
          )}
        </SettingBlock>

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
