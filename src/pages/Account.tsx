import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError, errMsg } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { PageHeader, Card, Button, Input, Toggle, Select, Toast, Spinner, ErrorBox } from '../components/ui';
import { Mail } from 'lucide-react';

interface Prefs {
  email: string;
  notify_publish: boolean;
  notify_review: boolean;
  notify_comments: boolean;
  notify_schedule: boolean;
  notify_team: boolean;
  digest: string;
}

export default function AccountPage() {
  const { member, refreshMember } = useAuth();
  const [name, setName] = useState(member?.name || '');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const prefsApi = useApi<Prefs>(() => api('/api/notifications?resource=prefs'), []);
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    document.title = 'Your account · 180news Newsroom CMS';
    setName(member?.name || '');
  }, [member]);

  useEffect(() => {
    if (prefsApi.data) setPrefs(prefsApi.data);
  }, [prefsApi.data]);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setFields({ name: 'Enter your name.' });
    setBusy(true);
    try {
      await api('/api/team', { method: 'PUT', body: { action: 'my_profile', name: name.trim() } });
      await refreshMember();
      setToast('Name saved.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setToast(errMsg(err));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const savePass = async (e: FormEvent) => {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (password.length < 8) f.password = 'Use at least 8 characters.';
    if (!again) f.again = 'Type the password again.';
    else if (again !== password) f.again = 'The two passwords do not match.';
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      await api('/api/team', { method: 'PUT', body: { action: 'my_password', password } });
      setPassword('');
      setAgain('');
      setToast('Password changed. Use the new one next time you sign in.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setToast(errMsg(err));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const savePrefs = async (e: FormEvent) => {
    e.preventDefault();
    if (!prefs) return;
    setBusy(true);
    try {
      const saved = await api<Prefs>('/api/notifications', { method: 'PUT', body: { action: 'prefs', ...prefs } });
      setPrefs(saved);
      setToast('Email notification preferences saved.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setToast(errMsg(err));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Your account"
        description="Your profile, password and email notifications from the newsroom desk."
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 text-lg font-extrabold">Profile</h2>
          <p className="mb-1 flex items-center gap-2 text-sm text-muted">
            <Mail className="h-4 w-4 text-navy" aria-hidden />
            <a href={`mailto:${member?.email}`} className="font-bold text-navy hover:underline">
              {member?.email}
            </a>
            <span>· {member?.role}</span>
          </p>
          <p className="mb-4 text-[13px] text-muted">Staff sign-in email. Notification mail can use a different address below.</p>
          <form onSubmit={saveName} className="space-y-3">
            <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} error={fields.name} />
            <Button type="submit" loading={busy}>Save name</Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-lg font-extrabold">Change your password</h2>
          <form onSubmit={savePass} className="space-y-3">
            <Input label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setFields({}); }} error={fields.password} hint="At least 8 characters." />
            <Input label="Type the password again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={fields.again} />
            <Button type="submit" loading={busy}>Save new password</Button>
          </form>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-1 text-lg font-extrabold">Email notifications</h2>
          <p className="mb-4 text-sm text-muted">
            Choose which desk events email you. Alerts are queued in Notifications (outbound SMTP can be connected later).
          </p>
          {prefsApi.loading && !prefs ? (
            <Spinner label="Loading preferences" />
          ) : prefsApi.error && !prefs ? (
            <ErrorBox message={prefsApi.error} onRetry={() => prefsApi.reload()} />
          ) : prefs ? (
            <form onSubmit={savePrefs} className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Notification email"
                  type="email"
                  value={prefs.email || ''}
                  onChange={(e) => setPrefs({ ...prefs, email: e.target.value })}
                  error={fields.email}
                  hint="Where publish, review and comment alerts are addressed."
                />
              </div>
              <Toggle
                label="Story published"
                description="When a story goes live on the news app."
                checked={!!prefs.notify_publish}
                onChange={(v) => setPrefs({ ...prefs, notify_publish: v })}
              />
              <Toggle
                label="Sent for review"
                description="When a writer submits a draft for editors."
                checked={!!prefs.notify_review}
                onChange={(v) => setPrefs({ ...prefs, notify_review: v })}
              />
              <Toggle
                label="Reader comments"
                description="New comments on published stories."
                checked={!!prefs.notify_comments}
                onChange={(v) => setPrefs({ ...prefs, notify_comments: v })}
              />
              <Toggle
                label="Scheduled stories"
                description="When a story is lined up to publish later."
                checked={!!prefs.notify_schedule}
                onChange={(v) => setPrefs({ ...prefs, notify_schedule: v })}
              />
              <Toggle
                label="Team changes"
                description="When users are added or roles change."
                checked={!!prefs.notify_team}
                onChange={(v) => setPrefs({ ...prefs, notify_team: v })}
              />
              <Select
                label="Delivery"
                value={prefs.digest || 'instant'}
                onChange={(e) => setPrefs({ ...prefs, digest: e.target.value })}
              >
                <option value="instant">Instant (as events happen)</option>
                <option value="daily">Daily digest</option>
                <option value="off">Pause all email</option>
              </Select>
              <div className="sm:col-span-2">
                <Button type="submit" loading={busy}>Save email preferences</Button>
              </div>
            </form>
          ) : null}
        </Card>
      </div>
      {toast && <Toast message={toast} />}
    </>
  );
}
