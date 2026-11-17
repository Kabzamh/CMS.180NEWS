import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useLoad } from '../hooks/useLoad';
import type { Settings as SettingsData } from '../lib/types';
import { Button, Card, CardHead, ErrorState, PageHeader, SkeletonRows, TextArea, TextInput, Toggle, useToast } from '../components/ui';

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

export default function Settings() {
  const toast = useToast();
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
      <PageHeader eyebrow="Site" title="Settings" description="The elections update, how readers reach the newsroom, and the links the 180news site reads its content from." />

      {settings.error && !data ? (
        <ErrorState message={settings.error} onRetry={() => settings.reload()} />
      ) : !data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
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
            <CardHead title="Content feed for the 180news site" note="Links the site loads to show what is published here, and to send back reads and comments. They need no sign-in." />
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
    </>
  );
}
