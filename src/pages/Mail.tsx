import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Mail as MailIcon, Send, Inbox, PenLine } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, ApiError, errMsg } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import {
  PageHeader, Card, Button, Input, TextArea, Select, Badge, Spinner, ErrorBox, Toast, Empty, fmtDate,
} from '../components/ui';

interface MailMsg {
  id: number;
  from_name: string;
  from_email: string;
  to_name: string;
  to_email: string;
  subject: string;
  body: string;
  read: boolean;
  created_at: string;
}

interface Directory {
  authors: Array<{ id: number; name: string; email: string; title: string }>;
  team: Array<{ id: number; name: string; email: string; role: string }>;
}

export default function MailPage() {
  const { member } = useAuth();
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');
  const list = useApi<{ items: MailMsg[] }>(() => api(`/api/mail?box=${box}`), [box]);
  const directory = useApi<Directory>(() => api('/api/mail?resource=directory'), []);
  const [compose, setCompose] = useState(false);
  const [selected, setSelected] = useState<MailMsg | null>(null);
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Mail · 180news Newsroom CMS';
  }, []);

  const recipients = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of directory.data?.team || []) {
      if (t.email) map.set(t.email.toLowerCase(), `${t.name} (${t.role})`);
    }
    for (const a of directory.data?.authors || []) {
      if (a.email && !map.has(a.email.toLowerCase())) map.set(a.email.toLowerCase(), `${a.name}${a.title ? ` · ${a.title}` : ''}`);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [directory.data]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      await api('/api/mail', {
        method: 'POST',
        body: { to_email: toEmail, subject, body },
      });
      setToast('Message sent to their desk inbox.');
      setCompose(false);
      setToEmail('');
      setSubject('');
      setBody('');
      setBox('sent');
      window.dispatchEvent(new Event('mail-changed'));
      await list.reload(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      setToast(errMsg(err));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const openMsg = async (m: MailMsg) => {
    setSelected(m);
    if (!m.read && box === 'inbox') {
      try {
        await api('/api/mail', { method: 'PUT', body: { id: m.id, read: true } });
        window.dispatchEvent(new Event('mail-changed'));
        await list.reload(true);
      } catch (_) {}
    }
  };

  const reply = () => {
    if (!selected) return;
    setToEmail(box === 'inbox' ? selected.from_email : selected.to_email);
    setSubject(selected.subject.startsWith('Re:') ? selected.subject : `Re: ${selected.subject}`);
    setBody(`\n\n—\nOn ${fmtDate(selected.created_at)}, ${selected.from_name} wrote:\n${selected.body}`);
    setCompose(true);
    setSelected(null);
  };

  const items = list.data?.items || [];

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Staff mail"
        description={`Send and receive messages on your profile (${member?.email}). Recipients get the mail in their desk inbox.`}
        actions={
          <Button icon={<PenLine className="h-4 w-4" />} onClick={() => { setCompose(true); setSelected(null); }}>
            Compose
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button size="sm" variant={box === 'inbox' ? 'navy' : 'outline'} icon={<Inbox className="h-4 w-4" />} onClick={() => setBox('inbox')}>
          Inbox
        </Button>
        <Button size="sm" variant={box === 'sent' ? 'navy' : 'outline'} icon={<Send className="h-4 w-4" />} onClick={() => setBox('sent')}>
          Sent
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          {list.loading ? (
            <Spinner label="Loading mail" />
          ) : list.error ? (
            <ErrorBox message={list.error} onRetry={() => list.reload()} />
          ) : items.length === 0 ? (
            <Empty icon={<MailIcon className="h-8 w-8" />} title={box === 'inbox' ? 'Inbox is empty' : 'No sent mail yet'} />
          ) : (
            <ul className="divide-y divide-line">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openMsg(m)}
                    className={`flex w-full cursor-pointer flex-col gap-1 px-5 py-3.5 text-left hover:bg-wash ${!m.read && box === 'inbox' ? 'bg-navy-tint/30' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {!m.read && box === 'inbox' && <Badge tone="navy">new</Badge>}
                      <span className="text-sm font-bold text-muted">
                        {box === 'inbox' ? m.from_name || m.from_email : m.to_name || m.to_email}
                      </span>
                      <span className="text-xs text-off">{fmtDate(m.created_at)}</span>
                    </div>
                    <span className="font-extrabold text-ink">{m.subject}</span>
                    <span className="line-clamp-1 text-sm text-muted">{m.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {compose && (
            <Card className="p-5">
              <h2 className="mb-4 text-lg font-extrabold">New message</h2>
              <form onSubmit={send} className="space-y-3" noValidate>
                <Select label="To" value={toEmail} onChange={(e) => setToEmail(e.target.value)} error={fields.to_email}>
                  <option value="">Choose a staff profile…</option>
                  {recipients.map(([email, label]) => (
                    <option key={email} value={email}>
                      {label} — {email}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Or type email"
                  type="email"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="colleague@180news.co.za"
                />
                <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} error={fields.subject} />
                <TextArea label="Message" rows={8} value={body} onChange={(e) => setBody(e.target.value)} error={fields.body} />
                <div className="flex gap-2">
                  <Button type="submit" loading={busy} icon={<Send className="h-4 w-4" />}>Send</Button>
                  <Button type="button" variant="outline" onClick={() => setCompose(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          {selected && !compose && (
            <Card className="p-5">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge tone="navy">{box}</Badge>
                <span className="text-sm text-muted">{fmtDate(selected.created_at)}</span>
              </div>
              <h2 className="text-xl font-extrabold text-ink">{selected.subject}</h2>
              <p className="mt-2 text-sm text-muted">
                From{' '}
                <a className="font-bold text-navy hover:underline" href={`mailto:${selected.from_email}`}>
                  {selected.from_name} &lt;{selected.from_email}&gt;
                </a>
              </p>
              <p className="text-sm text-muted">
                To{' '}
                <a className="font-bold text-navy hover:underline" href={`mailto:${selected.to_email}`}>
                  {selected.to_name || selected.to_email} &lt;{selected.to_email}&gt;
                </a>
              </p>
              <div className="mt-5 whitespace-pre-wrap text-[16px] leading-relaxed text-body">{selected.body}</div>
              <div className="mt-5 flex gap-2">
                <Button onClick={reply}>Reply</Button>
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              </div>
            </Card>
          )}

          {!compose && !selected && (
            <Card className="p-5">
              <h2 className="text-lg font-extrabold">Staff directory</h2>
              <p className="mt-1 text-sm text-muted">Pick someone to message from the list, or open the public directory on the news app.</p>
              <ul className="mt-4 divide-y divide-line border border-line">
                {recipients.slice(0, 12).map(([email, label]) => (
                  <li key={email} className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink">{label}</p>
                      <a href={`mailto:${email}`} className="text-sm font-bold text-navy hover:underline">{email}</a>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setToEmail(email);
                        setCompose(true);
                      }}
                    >
                      Mail
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {toast && <Toast message={toast} />}
    </>
  );
}
