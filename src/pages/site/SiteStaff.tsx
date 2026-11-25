import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, User } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { api, errMsg } from '../../lib/api';
import { Spinner, ErrorBox, Button, Input, TextArea, Toast } from '../../components/ui';

interface Directory {
  newsroom: { email?: string; phone?: string; ads_phone?: string };
  profiles?: Array<{ id: number; name: string; title: string; bio: string; email: string; phone?: string; role?: string; photo_url: string | null }>;
  authors: Array<{ id: number; name: string; title: string; bio: string; email: string; photo_url: string | null }>;
  team: Array<{ id: number; name: string; email: string; role: string }>;
}

export default function SiteStaff() {
  const { data, loading, error, reload } = useApi<Directory>(() => api('/api/public?resource=directory'), []);
  const [toEmail, setToEmail] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Staff directory | 180news';
  }, []);

  useEffect(() => {
    if (data?.newsroom?.email && !toEmail) setToEmail(data.newsroom.email);
  }, [data, toEmail]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await api('/api/public?resource=contact', {
        method: 'POST',
        body: { name, email, to_email: toEmail, subject, body },
      });
      setToast('Message delivered to the newsroom inbox.');
      setName('');
      setEmail('');
      setSubject('');
      setBody('');
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  if (loading && !data) return <div className="py-20"><Spinner label="Loading staff directory" /></div>;
  if (error && !data) return <div className="px-4 py-12"><ErrorBox message={error} onRetry={() => reload()} /></div>;
  if (!data) return null;

  const nr = data.newsroom || {};

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to="/site" className="text-sm font-bold text-navy hover:underline">← Front page</Link>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-ink md:text-4xl">Staff directory</h1>
      <p className="mt-2 max-w-2xl text-[17px] text-body">
        Everyone on the 180news desk — email and contact details. Write to a profile below; messages land in their staff mail inbox.
      </p>

      <section className="mt-8 border border-line bg-navy-deep p-5 text-white sm:p-6">
        <p className="text-[11px] font-black tracking-[0.12em] text-brand-bright uppercase">Newsroom contact</p>
        <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[15px]">
          {nr.email && (
            <a href={`mailto:${nr.email}`} className="inline-flex items-center gap-2 font-bold hover:underline">
              <Mail className="h-4 w-4" /> {nr.email}
            </a>
          )}
          {nr.phone && (
            <a href={`tel:${nr.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-2 font-bold hover:underline">
              <Phone className="h-4 w-4" /> {nr.phone}
            </a>
          )}
          {nr.ads_phone && (
            <span className="inline-flex items-center gap-2 text-white/80">
              <Phone className="h-4 w-4" /> Ads: {nr.ads_phone}
            </span>
          )}
        </div>
      </section>

      {(data.profiles?.length ?? 0) > 0 && (
        <section className="mt-10">
          <h2 className="border-b-2 border-ink pb-2 text-xl font-black text-ink">Staff profiles</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {data.profiles!.map((a) => (
              <li key={`p-${a.id}`} className="flex gap-4 border border-line bg-paper p-4">
                {a.photo_url ? (
                  <img src={a.photo_url} alt="" className="h-16 w-16 shrink-0 object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-navy-tint text-navy">
                    <User className="h-7 w-7" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-ink">{a.name}</p>
                  <p className="text-sm text-muted">{a.title || a.role || '—'}</p>
                  {a.bio && <p className="mt-1 line-clamp-2 text-sm text-body">{a.bio}</p>}
                  <div className="mt-2 flex flex-col gap-0.5">
                    {a.email && (
                      <a href={`mailto:${a.email}`} className="text-sm font-bold text-navy hover:underline">{a.email}</a>
                    )}
                    {a.phone && (
                      <a href={`tel:${a.phone.replace(/\s/g, '')}`} className="text-sm font-bold text-body hover:underline">{a.phone}</a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="border-b-2 border-ink pb-2 text-xl font-black text-ink">Byline authors</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {data.authors.map((a) => (
            <li key={a.id} className="flex gap-4 border border-line bg-paper p-4">
              {a.photo_url ? (
                <img src={a.photo_url} alt="" className="h-16 w-16 shrink-0 object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-navy-tint text-navy">
                  <User className="h-7 w-7" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-ink">{a.name}</p>
                {a.title && <p className="text-sm text-muted">{a.title}</p>}
                {a.bio && <p className="mt-1 line-clamp-2 text-sm text-body">{a.bio}</p>}
                {a.email && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`mailto:${a.email}`} className="text-sm font-bold text-navy hover:underline">{a.email}</a>
                    <button
                      type="button"
                      className="cursor-pointer text-sm font-bold text-brand hover:underline"
                      onClick={() => {
                        setToEmail(a.email);
                        setSubject(`Message for ${a.name}`);
                        document.getElementById('staff-contact')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      Write to {a.name.split(' ')[0]} →
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="border-b-2 border-ink pb-2 text-xl font-black text-ink">Desk team</h2>
        <ul className="mt-4 divide-y divide-line border border-line">
          {data.team.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="font-extrabold text-ink">{t.name}</p>
                <p className="text-sm capitalize text-muted">{t.role}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a href={`mailto:${t.email}`} className="text-sm font-bold text-navy hover:underline">{t.email}</a>
                <button
                  type="button"
                  className="cursor-pointer text-sm font-bold text-brand hover:underline"
                  onClick={() => {
                    setToEmail(t.email);
                    setSubject(`Message for ${t.name}`);
                    document.getElementById('staff-contact')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Email →
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="staff-contact" className="mt-12 border border-line bg-wash p-5 sm:p-6">
        <h2 className="text-xl font-black text-ink">Send a message</h2>
        <p className="mt-1 text-sm text-muted">Goes to the selected profile’s staff mail inbox on the desk.</p>
        <form onSubmit={send} className="mt-5 grid gap-3 sm:grid-cols-2" noValidate>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-bold text-ink">To</span>
            <select
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="h-11 w-full border border-line-strong bg-paper px-3 text-base outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
              required
            >
              <option value="">Choose…</option>
              {nr.email && <option value={nr.email}>Newsroom — {nr.email}</option>}
              {data.authors.filter((a) => a.email).map((a) => (
                <option key={`a-${a.id}`} value={a.email}>{a.name} — {a.email}</option>
              ))}
              {data.team.map((t) => (
                <option key={`t-${t.id}`} value={t.email}>{t.name} ({t.role}) — {t.email}</option>
              ))}
            </select>
          </label>
          <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="sm:col-span-2">
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div className="sm:col-span-2">
            <TextArea label="Message" rows={5} value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          {formError && <p className="sm:col-span-2 text-sm font-bold text-brand">{formError}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" loading={busy}>Send message</Button>
          </div>
        </form>
      </section>

      {toast && <Toast message={toast} />}
    </div>
  );
}
