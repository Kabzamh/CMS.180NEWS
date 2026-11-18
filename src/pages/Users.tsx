import { FormEvent, useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, ApiError, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Input, Select, Spinner, ErrorBox, Toast, Badge, Empty } from '../components/ui';
import type { TeamMember } from '../lib/types';

export default function UsersPage() {
  const list = useApi<TeamMember[]>(() => api('/api/team'), []);
  const [form, setForm] = useState({ name: '', email: '', role: 'writer', password: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [newPass, setNewPass] = useState('');

  useEffect(() => {
    document.title = 'Users and roles · 180news Newsroom CMS';
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (form.name.trim().length < 2) f.name = 'Enter their name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) f.email = 'Enter their email address.';
    if (form.password.length < 8) f.password = 'Use at least 8 characters.';
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    try {
      const row = await api<TeamMember & { password: string }>('/api/team', {
        method: 'POST',
        body: { ...form, name: form.name.trim(), email: form.email.trim() },
      });
      setCreated({ name: row.name, email: row.email, password: form.password });
      setForm({ name: '', email: '', role: 'writer', password: '' });
      setToast(`${row.name} has been added to the team.`);
      await list.reload(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setToast(errMsg(err));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const setRole = async (m: TeamMember, role: string) => {
    try {
      await api('/api/team', { method: 'PUT', body: { id: m.id, role } });
      setToast(`Role updated for ${m.name}.`);
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const remove = async (m: TeamMember) => {
    try {
      await api('/api/team', { method: 'DELETE', body: { id: m.id } });
      setToast(`${m.name} has been removed from the team.`);
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const resetPass = async () => {
    if (!resetId || newPass.length < 8) return;
    try {
      await api('/api/team', { method: 'PUT', body: { id: resetId, password: newPass } });
      const m = (list.data || []).find((x) => x.id === resetId);
      setCreated({ name: m?.name || '', email: m?.email || '', password: newPass });
      setToast(`New password set for ${m?.name}.`);
      setResetId(null);
      setNewPass('');
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <>
      <PageHeader eyebrow="People" title="Users and roles" description="Who can sign in to the newsroom desk." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-extrabold">Add someone</h2>
          <form onSubmit={add} className="space-y-3" noValidate>
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={fields.name} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={fields.email} />
            <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="writer">Writer</option>
              <option value="editor">Editor</option>
              <option value="owner">Owner</option>
            </Select>
            <Input label="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={fields.password} hint="At least 8 characters." />
            <Button type="submit" loading={busy}>Add to team</Button>
          </form>
          <p className="mt-4 text-sm text-muted">
            Writers draft stories. Editors publish, schedule and manage the site. Owners manage the team.
          </p>
        </Card>

        <Card>
          {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> : !(list.data || []).length ? (
            <Empty title="No team members" />
          ) : (
            <ul className="divide-y divide-line">
              {(list.data || []).map((m) => (
                <li key={m.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-extrabold text-ink">{m.name}</p>
                    <Badge tone="navy">{m.role}</Badge>
                    {!m.active && <Badge tone="hidden">inactive</Badge>}
                  </div>
                  <p className="text-sm text-muted">{m.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Select
                      value={m.role}
                      onChange={(e) => setRole(m, e.target.value)}
                      className="h-9 w-auto text-sm"
                    >
                      <option value="writer">writer</option>
                      <option value="editor">editor</option>
                      <option value="owner">owner</option>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => { setResetId(m.id); setNewPass(''); }}>Reset password</Button>
                    <Button size="sm" variant="danger" onClick={() => remove(m)}>Remove</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {created && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="w-full max-w-md border border-line bg-paper p-6">
            <h3 className="text-lg font-extrabold">Share these details once</h3>
            <p className="mt-2 text-sm text-muted">They can set their own password under Your account. The password is not shown again.</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="text-muted">Name</dt><dd className="font-bold">{created.name}</dd></div>
              <div><dt className="text-muted">Email</dt><dd className="font-bold break-all">{created.email}</dd></div>
              <div><dt className="text-muted">Password</dt><dd className="font-mono font-bold">{created.password}</dd></div>
            </dl>
            <Button className="mt-5" onClick={() => setCreated(null)}>Done</Button>
          </div>
        </div>
      )}

      {resetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="w-full max-w-md space-y-4 border border-line bg-paper p-6">
            <h3 className="text-lg font-extrabold">New password</h3>
            <Input label="New password" value={newPass} onChange={(e) => setNewPass(e.target.value)} hint="At least 8 characters." />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setResetId(null)}>Cancel</Button>
              <Button onClick={resetPass}>Save new password</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}
