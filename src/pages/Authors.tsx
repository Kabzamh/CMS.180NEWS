import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, UserPen } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useLoad } from '../hooks/useLoad';
import type { AuthorProfile, AuthorsResponse } from '../lib/types';
import { initials } from '../lib/format';
import { ImagePicker } from '../components/ImagePicker';
import { Button, Card, CardHead, ConfirmDialog, ErrorState, IconButton, PageHeader, Pill, SkeletonRows, TextArea, TextInput, Toggle, useToast } from '../components/ui';

interface Form {
  id: number | null;
  name: string;
  title: string;
  bio: string;
  email: string;
  photo_url: string | null;
  active: boolean;
}

const BLANK: Form = { id: null, name: '', title: '', bio: '', email: '', photo_url: null, active: true };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const stories = (n: number) => `${n} ${n === 1 ? 'story' : 'stories'}`;

export default function Authors() {
  const toast = useToast();
  const list = useLoad(() => api<AuthorsResponse>('/api/team?resource=authors'), []);
  const formRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<Form>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<AuthorProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    document.title = 'Authors · 180news Newsroom CMS';
  }, []);

  const open = (next: Form) => {
    setForm(next);
    setErrors({});
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => document.getElementById('author-name')?.focus({ preventScroll: true }), 250);
  };

  const set = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (form.name.trim().length < 2) found.name = 'Enter the name as it should appear on stories.';
    if (form.email.trim() && !EMAIL.test(form.email.trim())) found.email = 'Enter a valid email address, for example thandi@180news.co.za.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const body = { name: form.name, title: form.title, bio: form.bio, email: form.email, photo_url: form.photo_url ?? '', active: form.active };
      const saved = await api<AuthorProfile & { renamed?: number }>('/api/team?resource=authors', {
        method: form.id ? 'PUT' : 'POST',
        body: form.id ? { id: form.id, ...body } : body,
      });
      toast(saved.renamed ? `Profile saved. The byline was updated on ${stories(saved.renamed)}.` : form.id ? 'Profile saved.' : `${saved.name} added to the authors.`);
      setForm(BLANK);
      await list.reload(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api('/api/team?resource=authors', { method: 'DELETE', body: { id: toDelete.id } });
      toast(`Profile for ${toDelete.name} removed.`);
      if (form.id === toDelete.id) setForm(BLANK);
      setToDelete(null);
      await list.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const authors = list.data?.authors ?? [];
  const unlinked = list.data?.unlinked ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Organise"
        title="Authors"
        description="The people whose names appear on stories. A profile adds a title, a short bio and a photo to their byline."
      />

      {list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={() => list.reload()} />
      ) : !list.data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-6">
            <Card>
              <CardHead title="Author profiles" note={authors.length ? `${authors.length} ${authors.length === 1 ? 'profile' : 'profiles'}` : undefined} />
              {authors.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <UserPen className="mx-auto h-8 w-8 text-navy" aria-hidden="true" />
                  <p className="mt-2 text-lg font-extrabold text-ink">No author profiles yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-[15px] leading-snug text-muted">
                    {unlinked.length ? 'Start with a byline that is already on your stories, listed below.' : 'Add the first one with the form on this page.'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {authors.map((author) => (
                    <li key={author.id} className="flex items-start gap-3.5 p-4 sm:p-5">
                      {author.photo_url ? (
                        <img src={author.photo_url} alt="" className="h-14 w-14 shrink-0 bg-wash object-cover" />
                      ) : (
                        <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center bg-navy text-base font-black text-white">
                          {initials(author.name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-[17px] font-extrabold text-ink">{author.name}</p>
                          {!author.active && <Pill className="bg-wash text-body ring-1 ring-line-strong ring-inset">Not shown on the site</Pill>}
                        </div>
                        {author.title && <p className="text-[15px] font-semibold text-body">{author.title}</p>}
                        {author.bio && <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted">{author.bio}</p>}
                        <p className="mt-1.5 text-[13.5px] text-muted">
                          <span className="font-bold text-ink">{stories(author.stories)}</span> · {author.published} published
                          {author.email && <span className="break-all"> · {author.email}</span>}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <IconButton
                          label={`Edit the profile for ${author.name}`}
                          onClick={() => open({ id: author.id, name: author.name, title: author.title ?? '', bio: author.bio ?? '', email: author.email ?? '', photo_url: author.photo_url, active: author.active })}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        <IconButton label={`Remove the profile for ${author.name}`} tone="danger" onClick={() => setToDelete(author)}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {unlinked.length > 0 && (
              <Card>
                <CardHead title="Bylines without a profile" note="Names already used on stories" />
                <ul className="divide-y divide-line">
                  {unlinked.map((byline) => (
                    <li key={byline.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-[15.5px] font-bold break-words text-ink">{byline.name}</p>
                        <p className="text-[13.5px] text-muted">On {stories(byline.stories)}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => open({ ...BLANK, name: byline.name })} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>
                        Create profile
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div ref={formRef} className="scroll-mt-20 lg:sticky lg:top-20">
            <Card>
              <CardHead title={form.id ? 'Edit author' : 'Add an author'} />
              <form onSubmit={save} noValidate className="space-y-4 p-5">
                <TextInput
                  id="author-name"
                  label="Name"
                  maxLength={80}
                  autoComplete="off"
                  disabled={saving}
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  error={errors.name}
                  hint={form.id ? 'Changing the name also changes the byline on their stories.' : 'Exactly as it should appear on stories.'}
                />
                <TextInput label="Title" optional maxLength={80} autoComplete="off" disabled={saving} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="For example, Political reporter" />
                <TextArea
                  label="Short bio"
                  optional
                  rows={4}
                  maxLength={600}
                  disabled={saving}
                  value={form.bio}
                  onChange={(e) => set({ bio: e.target.value })}
                  hint={`${form.bio.length} of 600 characters.`}
                  className="resize-y"
                />
                <TextInput
                  label="Contact email"
                  optional
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  disabled={saving}
                  value={form.email}
                  onChange={(e) => set({ email: e.target.value })}
                  error={errors.email}
                  hint="Shown to readers with the profile."
                />
                <ImagePicker label="Photo" contain hint="A square head-and-shoulders photo works best." value={form.photo_url} disabled={saving} error={errors.photo_url} onChange={(url) => set({ photo_url: url })} />
                <div className="border-t border-line pt-4">
                  <Toggle label="Show this profile on the site" checked={form.active} disabled={saving} onChange={(active) => set({ active })} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" className="flex-1" loading={saving}>
                    {form.id ? 'Save profile' : 'Add author'}
                  </Button>
                  {(form.id || form.name) && (
                    <Button
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        setForm(BLANK);
                        setErrors({});
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Remove the profile for ${toDelete?.name ?? ''}?`}
        confirmLabel="Remove profile"
        cancelLabel="Keep"
        busy={deleting}
        onConfirm={remove}
        onClose={() => !deleting && setToDelete(null)}
      >
        Their title, bio and photo are removed. Their stories stay exactly as they are, with the same byline.
      </ConfirmDialog>
    </>
  );
}
