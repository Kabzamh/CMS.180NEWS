import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Input, TextArea, Toggle, Spinner, ErrorBox, Toast, Empty } from '../components/ui';
import type { Author } from '../lib/types';

const blank = (): Partial<Author> => ({ name: '', title: '', bio: '', email: '', photo_url: null, active: true });

export default function AuthorsPage() {
  const list = useApi<{ authors: Author[] }>(() => api('/api/team?resource=authors'), []);
  const [form, setForm] = useState<Partial<Author>>(blank());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Authors · 180news Newsroom CMS';
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api('/api/team?resource=authors', {
        method: form.id ? 'PUT' : 'POST',
        body: form.id ? { id: form.id, ...form } : form,
      });
      setToast(form.id ? 'Profile saved.' : `${form.name} added to the byline list.`);
      setForm(blank());
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const remove = async (a: Author) => {
    setBusy(true);
    try {
      await api('/api/team?resource=authors', { method: 'DELETE', body: { id: a.id } });
      setToast(`Profile for ${a.name} removed.`);
      if (form.id === a.id) setForm(blank());
      await list.reload(true);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const authors = list.data?.authors ?? [];

  return (
    <>
      <PageHeader eyebrow="Library" title="Authors" description="Staff byline profiles with contact email for the newsroom and the public site." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="text-lg font-extrabold">{form.id ? 'Edit profile' : 'Add author'}</h2>
          <Input label="Name" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Title" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input
            label="Staff email"
            type="email"
            value={form.email || ''}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            hint="Used for byline contact and tip-offs. Shown as a mailto link on the profile."
          />
          <TextArea label="Bio" rows={4} value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          <Input label="Photo URL" value={form.photo_url || ''} onChange={(e) => setForm({ ...form, photo_url: e.target.value || null })} />
          <Toggle label="Active on the site" checked={form.active !== false} onChange={(v) => setForm({ ...form, active: v })} />
          <div className="flex gap-2">
            <Button loading={busy} onClick={save}>{form.id ? 'Save' : 'Add'}</Button>
            {form.id && <Button variant="outline" onClick={() => setForm(blank())}>Cancel</Button>}
          </div>
        </Card>
        <Card>
          {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={() => list.reload()} /> : !authors.length ? (
            <Empty title="No author profiles yet" />
          ) : (
            <ul className="divide-y divide-line">
              {authors.map((a) => (
                <li key={a.id} className="flex flex-wrap gap-3 px-5 py-4">
                  {a.photo_url ? (
                    <img src={a.photo_url} alt="" className="h-12 w-12 object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center bg-navy-tint font-bold text-navy">
                      {a.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-ink">{a.name}</p>
                    <p className="text-sm text-muted">{a.title || '—'} · {a.stories || 0} stories</p>
                    {a.email ? (
                      <a href={`mailto:${a.email}`} className="mt-1 inline-block text-sm font-bold text-navy hover:underline">
                        {a.email}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm text-off">No email on profile</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {a.email && (
                      <a href={`mailto:${a.email}?subject=${encodeURIComponent('180news newsroom')}`}>
                        <Button size="sm" variant="navy">Email</Button>
                      </a>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setForm(a)}>Edit</Button>
                    <Button size="sm" variant="danger" loading={busy} onClick={() => remove(a)}>Remove</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {toast && <Toast message={toast} />}
    </>
  );
}
