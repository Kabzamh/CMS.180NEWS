import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ExternalLink, Eye, EyeOff, PenLine, Save, Send, Trash2, Undo2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useMember } from '../contexts/AuthContext';
import { useLoad } from '../hooks/useLoad';
import { canEdit, type Article, type ArticleClip, type ArticleStatus, type Placement, type AuthorsResponse, type Section, type Settings, type TagCount } from '../lib/types';
import { fmtDateTime, fromLocalInput, siteStoryPath, timeAgo, toLocalInput, wordCount } from '../lib/format';
import { ArticlePreview } from '../components/ArticlePreview';
import { ClipsEditor } from '../components/ClipsEditor';
import { ImagePicker } from '../components/ImagePicker';
import { TagInput } from '../components/TagInput';
import {
  Button,
  Card,
  CardHead,
  ConfirmDialog,
  ErrorState,
  PageHeader,
  SelectInput,
  Spinner,
  StatusBadge,
  TextArea,
  TextInput,
  cx,
  useToast,
} from '../components/ui';

interface Form {
  headline: string;
  summary: string;
  body: string;
  section: string;
  tags: string[];
  image_url: string | null;
  image_caption: string;
  image_credit: string;
  author_name: string;
  placement: Placement;
  when: 'now' | 'later';
  publish_local: string;
  media: ArticleClip[];
}

const blank = (author: string): Form => ({
  headline: '',
  summary: '',
  body: '',
  section: '',
  tags: [],
  image_url: null,
  image_caption: '',
  image_credit: '',
  author_name: author,
  placement: 'none',
  when: 'now',
  publish_local: '',
  media: [],
});

const fromArticle = (a: Article): Form => ({
  headline: a.headline,
  summary: a.summary ?? '',
  body: a.body ?? '',
  section: a.section ?? '',
  tags: Array.isArray(a.tags) ? a.tags : [],
  image_url: a.image_url,
  image_caption: a.image_caption ?? '',
  image_credit: a.image_credit ?? '',
  author_name: a.author_name ?? '',
  placement: a.placement,
  when: a.status === 'scheduled' ? 'later' : 'now',
  publish_local: a.status === 'scheduled' ? toLocalInput(a.publish_at) : '',
  media: a.media ?? [],
});

interface Action {
  label: string;
  /** Shorter wording for the narrow action bar on phones. */
  short?: string;
  status: ArticleStatus;
  icon: ReactNode;
}

const ICON = 'h-[18px] w-[18px]';

function actionsFor(current: ArticleStatus | null, editor: boolean, when: 'now' | 'later'): { primary: Action; secondary: Action[] } {
  const publish: Action =
    when === 'later'
      ? { label: current === 'scheduled' ? 'Save schedule' : 'Schedule', status: 'scheduled', icon: <CalendarClock className={ICON} aria-hidden="true" /> }
      : { label: current === 'hidden' ? 'Publish again' : 'Publish now', status: 'published', icon: <Send className={ICON} aria-hidden="true" /> };
  const saveDraft: Action = { label: 'Save draft', status: 'draft', icon: <Save className={ICON} aria-hidden="true" /> };
  const backToDraft: Action = { label: 'Move back to draft', short: 'To draft', status: 'draft', icon: <Undo2 className={ICON} aria-hidden="true" /> };
  const keep = (status: ArticleStatus): Action => ({ label: 'Save changes', status, icon: <Save className={ICON} aria-hidden="true" /> });

  if (!editor) {
    if (current === 'review') return { primary: keep('review'), secondary: [backToDraft] };
    return { primary: { label: 'Submit for review', short: 'Send for review', status: 'review', icon: <Send className={ICON} aria-hidden="true" /> }, secondary: [saveDraft] };
  }
  switch (current) {
    case 'review':
      return { primary: publish, secondary: [keep('review'), backToDraft] };
    case 'scheduled':
      return { primary: publish, secondary: [{ ...backToDraft, label: 'Unschedule', short: 'Unschedule' }] };
    case 'published':
      return {
        primary: { label: 'Update story', status: 'published', icon: <Save className={ICON} aria-hidden="true" /> },
        secondary: [{ label: 'Hide from the site', short: 'Hide', status: 'hidden', icon: <EyeOff className={ICON} aria-hidden="true" /> }],
      };
    case 'hidden':
      return { primary: publish, secondary: [keep('hidden')] };
    default:
      return { primary: publish, secondary: [saveDraft] };
  }
}

const SAVED_MESSAGE: Record<ArticleStatus, string> = {
  draft: 'Draft saved.',
  review: 'Saved. It is with the editors for review.',
  scheduled: 'Scheduled.',
  published: 'Published. It is live on the site feed.',
  hidden: 'Saved. It is hidden from the site.',
};

const PLACEMENTS: { value: Placement; title: string; text: string }[] = [
  { value: 'none', title: 'Not on the front page', text: 'It appears in its section, in Latest and in search.' },
  { value: 'main', title: 'Main headline', text: 'Leads the front page, in place of the current main headline.' },
  { value: 'headline', title: 'Headline news', text: 'One of the stories beside the main headline, newest first.' },
];

export default function ArticleEditor() {
  const { id } = useParams();
  const isNew = !id;
  const member = useMember();
  const editor = canEdit(member);
  const navigate = useNavigate();
  const toast = useToast();

  const sections = useLoad(() => api<Section[]>('/api/sections'), []);
  const tagList = useLoad(() => api<TagCount[]>('/api/tags'), []);
  const authorList = useLoad(() => api<AuthorsResponse>('/api/team?resource=authors'), []);
  const siteSettings = useLoad(() => api<Settings>('/api/settings'), []);

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => blank(member.name));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<ArticleStatus | null>(null);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [clipBusy, setClipBusy] = useState(false);

  useEffect(() => {
    document.title = `${isNew ? 'New article' : 'Edit article'} · 180news Newsroom CMS`;
  }, [isNew]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api<Article>(`/api/articles?id=${encodeURIComponent(id)}`)
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
        setForm(fromArticle(a));
        setDirty(false);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    const keys = Object.keys(patch).map((k) => (k === 'publish_local' || k === 'when' ? 'publish_at' : k));
    if (keys.some((k) => errors[k])) {
      setErrors((prev) => {
        const next = { ...prev };
        for (const k of keys) delete next[k];
        return next;
      });
    }
  };

  if (loading) return <Spinner label="Opening the story" />;
  if (loadError) {
    return (
      <>
        <PageHeader eyebrow="Articles" title="Edit article" />
        <ErrorState message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
        <Link to="/articles" className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-bold text-navy hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to all articles
        </Link>
      </>
    );
  }

  const current = article?.status ?? null;
  const own = !article || article.author_id === member.id;
  const locked = !editor && Boolean(article) && (!own || (current !== 'draft' && current !== 'review'));
  const canDelete = Boolean(article) && (editor || (own && current === 'draft'));
  const { primary, secondary } = actionsFor(current, editor, form.when);
  const sectionLabel = sections.data?.find((s) => s.slug === form.section)?.label ?? '';
  const disabled = locked || saving !== null;
  const words = wordCount(form.body);

  const validate = (next: ArticleStatus) => {
    const found: Record<string, string> = {};
    if (form.headline.trim().length < 4) found.headline = 'Give the story a headline (at least 4 characters).';
    if (next !== 'draft') {
      if (!form.section) found.section = 'Choose a category.';
      if (form.body.trim().length < 20) found.body = 'Write the story before it goes any further (at least 20 characters).';
      else if (form.body.trim().length > 20000) found.body = `The site shows up to 20 000 characters. Shorten the story by ${form.body.trim().length - 20000}.`;
    }
    if (next === 'scheduled') {
      if (!form.publish_local) found.publish_at = 'Choose a date and time.';
      else if (new Date(form.publish_local).getTime() <= Date.now() + 60000) found.publish_at = 'Choose a time in the future, or publish straight away.';
    }
    return found;
  };

  const showErrors = (found: Record<string, string>) => {
    setErrors(found);
    setView('write');
    const first = ['headline', 'summary', 'body', 'media', 'publish_at', 'section', 'tags'].find((k) => found[k]);
    if (first) setTimeout(() => document.getElementById(`f-${first}`)?.focus(), 60);
  };

  const save = async (next: ArticleStatus) => {
    if (clipBusy) {
      toast('Wait for the upload to finish, or cancel it, before saving.', 'error');
      return;
    }
    const found = validate(next);
    if (Object.keys(found).length) {
      showErrors(found);
      toast('Check the highlighted fields.', 'error');
      return;
    }
    setSaving(next);
    try {
      const payload = {
        headline: form.headline,
        summary: form.summary,
        body: form.body,
        section: form.section,
        tags: form.tags,
        image_url: form.image_url ?? '',
        image_caption: form.image_caption,
        image_credit: form.image_credit,
        author_name: form.author_name,
        placement: form.placement,
        media: form.media,
        status: next,
        publish_at: next === 'scheduled' ? fromLocalInput(form.publish_local) : null,
      };
      const saved = await api<Article>('/api/articles', {
        method: article ? 'PUT' : 'POST',
        body: article ? { id: article.id, ...payload } : payload,
      });
      setArticle(saved);
      setForm(fromArticle(saved));
      setDirty(false);
      setErrors({});
      toast(saved.status === 'scheduled' ? `Scheduled for ${fmtDateTime(saved.publish_at)}.` : SAVED_MESSAGE[saved.status]);
      if (!article) navigate(`/articles/${saved.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields) showErrors(err.fields);
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(null);
    }
  };

  const remove = async () => {
    if (!article) return;
    setDeleting(true);
    try {
      await api('/api/articles', { method: 'DELETE', body: { id: article.id } });
      setDirty(false);
      toast('Story deleted.');
      navigate('/articles', { replace: true });
    } catch (err) {
      toast(errorMessage(err), 'error');
      setDeleting(false);
    }
  };

  const actionButtons = (stacked: boolean) => (
    <>
      <Button
        variant="primary"
        className={stacked ? 'w-full' : 'min-w-0 flex-1 px-3'}
        loading={saving === primary.status}
        disabled={disabled || clipBusy}
        onClick={() => save(primary.status)}
        icon={stacked ? primary.icon : undefined}
      >
        {stacked ? primary.label : primary.short ?? primary.label}
      </Button>
      {(stacked ? secondary : secondary.slice(0, 1)).map((action) => (
        <Button
          key={action.label}
          variant="outline"
          className={stacked ? 'w-full' : 'min-w-0 flex-1 px-3'}
          loading={saving === action.status}
          disabled={disabled || clipBusy}
          onClick={() => save(action.status)}
          icon={stacked ? action.icon : undefined}
        >
          {stacked ? action.label : action.short ?? action.label}
        </Button>
      ))}
    </>
  );

  return (
    <div className={locked ? '' : 'pb-24 lg:pb-0'}>
      <Link to="/articles" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-bold text-navy hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All articles
      </Link>

      <PageHeader
        eyebrow="Articles"
        title={isNew ? 'New article' : locked ? 'Read article' : 'Edit article'}
        description={
          article
            ? `Last saved ${timeAgo(article.updated_at)}${article.updated_by ? ` by ${article.updated_by}` : ''}.${dirty ? ' You have changes that are not saved yet.' : ''}`
            : 'It is saved to the newsroom for the whole team, not to this device.'
        }
        actions={
          <div role="group" aria-label="View" className="flex border border-line-strong bg-paper">
            {(
              [
                { key: 'write', label: 'Write', icon: PenLine },
                { key: 'preview', label: 'Preview', icon: Eye },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={cx(
                  'inline-flex h-10 cursor-pointer items-center gap-2 px-4 text-[15px] font-bold whitespace-nowrap transition-colors',
                  view === key ? 'bg-ink text-white' : 'text-body hover:bg-wash',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        }
      />

      {locked && (
        <div role="status" className="mb-5 border-l-4 border-warn bg-warn-tint px-4 py-3 text-[15px] font-semibold text-ink">
          {own ? 'This story is with the editors now, so it can no longer be changed here.' : 'This is another writer’s story. You can read it, but only they and the editors can change it.'}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {view === 'preview' ? (
            <ArticlePreview
              headline={form.headline}
              summary={form.summary}
              body={form.body}
              sectionLabel={sectionLabel}
              author={form.author_name}
              date={article?.status === 'published' ? article.publish_at : form.when === 'later' && form.publish_local ? fromLocalInput(form.publish_local) : new Date().toISOString()}
              imageUrl={form.image_url}
              imageCaption={form.image_caption}
              imageCredit={form.image_credit}
              tags={form.tags}
              clips={form.media}
            />
          ) : (
            <>
            <Card className="space-y-5 p-5 sm:p-6">
              <TextArea
                id="f-headline"
                label="Headline"
                rows={2}
                maxLength={140}
                disabled={disabled}
                value={form.headline}
                onChange={(e) => update({ headline: e.target.value.replace(/\n/g, ' ') })}
                error={errors.headline}
                hint={`${form.headline.length} of 140 characters. Short and specific reads best on a phone.`}
                placeholder="What happened, in one line"
                className="resize-none text-[22px] leading-tight font-extrabold tracking-tight sm:text-[26px]"
              />
              <TextArea
                id="f-summary"
                label="Summary"
                optional
                rows={2}
                maxLength={300}
                disabled={disabled}
                value={form.summary}
                onChange={(e) => update({ summary: e.target.value })}
                error={errors.summary}
                hint="One or two sentences shown under the headline and in lists."
                className="resize-y"
              />
              <TextArea
                id="f-body"
                label="Article"
                rows={18}
                disabled={disabled}
                value={form.body}
                onChange={(e) => update({ body: e.target.value })}
                error={errors.body}
                hint={`${words} ${words === 1 ? 'word' : 'words'}, about ${Math.max(1, Math.round(words / 220))} min to read. Leave a blank line between paragraphs. Start a line with ## for a subheading or > for a quote.`}
                className="min-h-[360px] resize-y text-[16.5px] leading-[1.65]"
              />
            </Card>
            <div id="f-media" tabIndex={-1} className="mt-6 scroll-mt-20 focus:outline-none">
              <ClipsEditor value={form.media} onChange={(media) => update({ media })} disabled={locked || saving !== null} error={errors.media} onBusyChange={setClipBusy} />
            </div>
            </>
          )}
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHead title="Publishing" />
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2 text-[15px]">
                {current ? <StatusBadge status={current} /> : <span className="inline-flex h-6 items-center bg-wash px-2 text-[12px] font-extrabold tracking-[0.04em] text-body uppercase ring-1 ring-line-strong ring-inset">Not saved yet</span>}
                {current === 'published' && article?.publish_at && <span className="text-muted">since {fmtDateTime(article.publish_at)}</span>}
                {current === 'scheduled' && article?.publish_at && <span className="text-muted">for {fmtDateTime(article.publish_at)}</span>}
              </div>

              {current === 'published' && article && siteSettings.data?.site_link.sites[0] && (
                <a
                  href={`${siteSettings.data.site_link.sites[0].origin}${siteStoryPath(article.id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[15px] font-bold text-navy hover:underline"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  See it on the site
                </a>
              )}

              {editor && current !== 'published' && (
                <fieldset disabled={disabled}>
                  <legend className="mb-2 text-sm font-bold text-ink">When to publish</legend>
                  <div className="space-y-2">
                    {(
                      [
                        { value: 'now', label: 'Straight away' },
                        { value: 'later', label: 'At a set date and time' },
                      ] as const
                    ).map((option) => (
                      <label
                        key={option.value}
                        className={cx(
                          'flex cursor-pointer items-center gap-3 border px-3.5 py-2.5 text-[15px] font-semibold',
                          form.when === option.value ? 'border-navy bg-navy-tint text-ink' : 'border-line-strong text-body hover:border-ink',
                        )}
                      >
                        <input
                          type="radio"
                          name="when"
                          className="h-4 w-4 accent-navy"
                          checked={form.when === option.value}
                          onChange={() => update({ when: option.value })}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  {form.when === 'later' && (
                    <TextInput
                      id="f-publish_at"
                      wrapClass="mt-3"
                      label="Date and time"
                      type="datetime-local"
                      min={toLocalInput(new Date().toISOString())}
                      value={form.publish_local}
                      onChange={(e) => update({ publish_local: e.target.value })}
                      error={errors.publish_at}
                      hint="In your own time zone. It goes live on its own."
                    />
                  )}
                </fieldset>
              )}

              {!editor && !locked && (
                <p className="text-sm leading-snug text-muted">Submit the story when it is ready. An editor reads it and publishes or schedules it.</p>
              )}

              {!locked && <div className="hidden flex-col gap-2 lg:flex">{actionButtons(true)}</div>}
            </div>
          </Card>

          <Card>
            <CardHead title="Category and front page" />
            <div className="space-y-4 p-5">
              <SelectInput
                id="f-section"
                label="Category"
                disabled={disabled || sections.loading}
                value={form.section}
                onChange={(e) => update({ section: e.target.value })}
                error={errors.section ?? (sections.error ? 'The categories could not be loaded. Reload the page.' : undefined)}
              >
                <option value="">{sections.loading ? 'Loading categories…' : 'Choose a category'}</option>
                {(sections.data ?? []).map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                    {s.enabled ? '' : ' (switched off)'}
                  </option>
                ))}
              </SelectInput>

              {editor ? (
                <fieldset disabled={disabled}>
                  <legend className="mb-2 text-sm font-bold text-ink">Where it appears on the front page</legend>
                  <div className="space-y-2">
                    {PLACEMENTS.map((option) => (
                      <label
                        key={option.value}
                        className={cx(
                          'flex cursor-pointer items-start gap-3 border px-3.5 py-2.5',
                          form.placement === option.value ? 'border-navy bg-navy-tint' : 'border-line-strong hover:border-ink',
                        )}
                      >
                        <input
                          type="radio"
                          name="placement"
                          className="mt-1 h-4 w-4 shrink-0 accent-navy"
                          checked={form.placement === option.value}
                          onChange={() => update({ placement: option.value })}
                        />
                        <span>
                          <span className="block text-[15px] font-bold text-ink">{option.title}</span>
                          <span className="block text-[13.5px] leading-snug text-muted">{option.text}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <p className="text-sm leading-snug text-muted">Editors decide whether a story leads the front page.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Picture" />
            <div className="space-y-4 p-5">
              <ImagePicker
                label="Main picture"
                hint="JPG, PNG or WebP. It is resized to fit."
                value={form.image_url}
                disabled={disabled}
                error={errors.image_url}
                onChange={(url) => update({ image_url: url })}
              />
              {form.image_url && (
                <>
                  <TextInput label="Caption" optional disabled={disabled} maxLength={240} value={form.image_caption} onChange={(e) => update({ image_caption: e.target.value })} />
                  <TextInput
                    label="Picture credit"
                    optional
                    disabled={disabled}
                    maxLength={120}
                    value={form.image_credit}
                    onChange={(e) => update({ image_credit: e.target.value })}
                    hint="The photographer or agency."
                  />
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Byline and tags" />
            <div className="space-y-4 p-5">
              <TextInput
                label="Byline"
                disabled={disabled}
                maxLength={60}
                value={form.author_name}
                onChange={(e) => update({ author_name: e.target.value })}
                list="byline-authors"
                hint="The name readers see on the story. Author profiles are suggested as you type."
              />
              <datalist id="byline-authors">
                {(authorList.data?.authors ?? []).map((a) => (
                  <option key={a.id} value={a.name} />
                ))}
              </datalist>
              <div id="f-tags" tabIndex={-1}>
                <TagInput value={form.tags} onChange={(tags) => update({ tags })} suggestions={(tagList.data ?? []).map((t) => t.tag)} error={errors.tags} disabled={disabled} />
              </div>
            </div>
          </Card>

          {canDelete && (
            <Button variant="danger" className="w-full" disabled={saving !== null} onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
              Delete this story
            </Button>
          )}
        </aside>
      </div>

      {!locked && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-line-strong bg-paper p-3 shadow-[0_-6px_18px_rgba(20,22,27,0.08)] lg:hidden">{actionButtons(false)}</div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this story for good?"
        confirmLabel="Delete for good"
        busy={deleting}
        onConfirm={remove}
        onClose={() => !deleting && setConfirmDelete(false)}
      >
        <p>
          <span className="font-bold text-ink">{article?.headline}</span> will be removed from the newsroom and from the site. This cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}
