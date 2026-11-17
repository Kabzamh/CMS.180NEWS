import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useLoad } from '../hooks/useLoad';
import type { Section, TagCount } from '../lib/types';
import { Button, Card, CardHead, ConfirmDialog, ErrorState, IconButton, PageHeader, Spinner, Switch, TextInput, cx, inputClass, useToast } from '../components/ui';

function SectionsPanel({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const sections = useLoad(() => api<Section[]>('/api/sections'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [adding, setAdding] = useState('');
  const [addError, setAddError] = useState<string | undefined>();
  const [toDelete, setToDelete] = useState<Section | null>(null);

  const run = async (key: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await work();
      if (done) toast(done);
      await sections.reload(true);
      onChanged();
      return true;
    } catch (err) {
      toast(errorMessage(err), 'error');
      return err;
    } finally {
      setBusy(null);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const list = sections.data ?? [];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const reordered = ids.map((id) => list.find((s) => s.id === id)!);
    sections.setData(reordered);
    run(`move-${list[index].id}`, () => api('/api/sections', { method: 'PUT', body: { action: 'reorder', ids } }));
  };

  const saveName = async (section: Section) => {
    const label = name.trim();
    if (label.length < 2) return setNameError('Give the category a name (at least 2 characters).');
    const result = await run(`rename-${section.id}`, () => api('/api/sections', { method: 'PUT', body: { id: section.id, label } }), 'Category renamed.');
    if (result === true) setRenaming(null);
    else if (result instanceof ApiError && result.fields?.label) setNameError(result.fields.label);
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const label = adding.trim();
    if (label.length < 2) return setAddError('Give the category a name (at least 2 characters).');
    setAddError(undefined);
    const result = await run('add', () => api('/api/sections', { method: 'POST', body: { label } }), `${label} added.`);
    if (result === true) setAdding('');
    else if (result instanceof ApiError && result.fields?.label) setAddError(result.fields.label);
  };

  const remove = async () => {
    if (!toDelete) return;
    await run(`delete-${toDelete.id}`, () => api('/api/sections', { method: 'DELETE', body: { id: toDelete.id } }), `${toDelete.label} removed.`);
    setToDelete(null);
  };

  const list = sections.data ?? [];

  return (
    <Card>
      <CardHead title="All categories" note="The order here is the order in the site menu" />
      {sections.error && !sections.data ? (
        <div className="p-5">
          <ErrorState message={sections.error} onRetry={() => sections.reload()} />
        </div>
      ) : sections.loading && !sections.data ? (
        <Spinner label="Loading categories" />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {list.map((section, index) => (
              <li key={section.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="flex shrink-0 flex-col gap-1">
                  <IconButton label={`Move ${section.label} up`} disabled={index === 0 || busy !== null} onClick={() => move(index, -1)} className="h-7 w-8">
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Move ${section.label} down`} disabled={index === list.length - 1 || busy !== null} onClick={() => move(index, 1)} className="h-7 w-8">
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </div>

                {renaming === section.id ? (
                  <form
                    className="min-w-0 flex-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveName(section);
                    }}
                  >
                    <label htmlFor={`rename-${section.id}`} className="sr-only">
                      New name for {section.label}
                    </label>
                    <input
                      id={`rename-${section.id}`}
                      autoFocus
                      maxLength={40}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setNameError(undefined);
                      }}
                      aria-invalid={nameError ? true : undefined}
                      className={cx(inputClass, 'h-10', nameError && 'border-brand')}
                    />
                    {nameError && (
                      <p role="alert" className="mt-1.5 text-[13.5px] font-bold text-brand">
                        {nameError}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="submit" size="sm" variant="navy" loading={busy === `rename-${section.id}`}>
                        Save name
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRenaming(null)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className={cx('truncate text-[16px] font-extrabold', section.enabled ? 'text-ink' : 'text-muted')}>{section.label}</p>
                      <p className="text-[13.5px] text-muted">
                        <Link to={`/articles?section=${section.slug}`} className="font-semibold text-navy hover:underline">
                          {section.count} {section.count === 1 ? 'story' : 'stories'}
                        </Link>
                        {!section.enabled && ' · hidden from the site'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        label={`Show ${section.label} on the site`}
                        checked={section.enabled}
                        disabled={busy !== null}
                        onChange={(enabled) =>
                          run(
                            `toggle-${section.id}`,
                            () => api('/api/sections', { method: 'PUT', body: { id: section.id, enabled } }),
                            enabled ? `${section.label} is back on the site.` : `${section.label} is switched off. Its stories are hidden from the site.`,
                          )
                        }
                      />
                      <IconButton
                        label={`Rename ${section.label}`}
                        disabled={busy !== null}
                        onClick={() => {
                          setRenaming(section.id);
                          setName(section.label);
                          setNameError(undefined);
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={section.count > 0 ? `${section.label} has stories, so it cannot be removed. Switch it off instead.` : `Remove ${section.label}`}
                        tone="danger"
                        disabled={busy !== null || section.count > 0}
                        onClick={() => setToDelete(section)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          <form onSubmit={add} noValidate className="border-t border-line bg-wash p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <TextInput
                wrapClass="min-w-0 flex-1"
                label="Add a category"
                placeholder="For example, Education"
                maxLength={40}
                value={adding}
                onChange={(e) => {
                  setAdding(e.target.value);
                  setAddError(undefined);
                }}
                error={addError}
              />
              <Button type="submit" variant="navy" className="sm:mt-[26px]" loading={busy === 'add'} icon={<Plus className="h-[18px] w-[18px]" aria-hidden="true" />}>
                Add category
              </Button>
            </div>
          </form>
        </>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Remove the ${toDelete?.label ?? ''} category?`}
        confirmLabel="Remove category"
        busy={busy !== null}
        onConfirm={remove}
        onClose={() => busy === null && setToDelete(null)}
      >
        It has no stories, so nothing else is lost. It will disappear from the site menu.
      </ConfirmDialog>
    </Card>
  );
}

function TagsPanel({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const tags = useLoad(() => api<TagCount[]>('/api/tags'), [refreshKey]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<TagCount | null>(null);

  const list = tags.data ?? [];
  const mergeTarget = renaming ? list.find((t) => t.tag.toLowerCase() === name.trim().toLowerCase() && t.tag.toLowerCase() !== renaming.toLowerCase()) : undefined;

  const saveName = async (from: string) => {
    const to = name.trim();
    if (!to) return setNameError('Type the new name for the tag.');
    if (to === from) return setRenaming(null);
    setBusy(true);
    try {
      await api('/api/tags', { method: 'PUT', body: { from, to } });
      toast(mergeTarget ? `Merged into “${mergeTarget.tag}”.` : 'Tag renamed on every story that uses it.');
      setRenaming(null);
      await tags.reload(true);
    } catch (err) {
      setNameError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api('/api/tags', { method: 'DELETE', body: { tag: toDelete.tag } });
      toast(`“${toDelete.tag}” removed from every story.`);
      setToDelete(null);
      await tags.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHead title="Tags" note="Rename a tag to match another one and the two are merged" />
      {tags.error && !tags.data ? (
        <div className="p-5">
          <ErrorState message={tags.error} onRetry={() => tags.reload()} />
        </div>
      ) : tags.loading && !tags.data ? (
        <Spinner label="Loading tags" />
      ) : list.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Tags className="mx-auto h-8 w-8 text-navy" aria-hidden="true" />
          <p className="mt-2 text-lg font-extrabold text-ink">No tags yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[15px] text-muted">Add up to five tags to an article and they will be listed here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((item) => (
            <li key={item.tag} className="px-4 py-3 sm:px-5">
              {renaming === item.tag ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveName(item.tag);
                  }}
                >
                  <label htmlFor={`tag-${item.tag}`} className="sr-only">
                    New name for the tag {item.tag}
                  </label>
                  <input
                    id={`tag-${item.tag}`}
                    autoFocus
                    maxLength={30}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameError(undefined);
                    }}
                    aria-invalid={nameError ? true : undefined}
                    className={cx(inputClass, 'h-10', nameError && 'border-brand')}
                  />
                  {nameError ? (
                    <p role="alert" className="mt-1.5 text-[13.5px] font-bold text-brand">
                      {nameError}
                    </p>
                  ) : mergeTarget ? (
                    <p className="mt-1.5 text-[13.5px] font-semibold text-warn-deep">
                      “{mergeTarget.tag}” already exists. Saving merges the two tags into one.
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="submit" size="sm" variant="navy" loading={busy}>
                      {mergeTarget ? 'Merge tags' : 'Save name'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setRenaming(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-extrabold text-ink">{item.tag}</p>
                    <p className="text-[13.5px] text-muted">
                      On {item.count} {item.count === 1 ? 'story' : 'stories'}
                    </p>
                  </div>
                  <IconButton
                    label={`Rename the tag ${item.tag}`}
                    disabled={busy}
                    onClick={() => {
                      setRenaming(item.tag);
                      setName(item.tag);
                      setNameError(undefined);
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Remove the tag ${item.tag}`} tone="danger" disabled={busy} onClick={() => setToDelete(item)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title={`Remove the tag “${toDelete?.tag ?? ''}”?`}
        confirmLabel="Remove tag"
        busy={busy}
        onConfirm={remove}
        onClose={() => !busy && setToDelete(null)}
      >
        It will be taken off {toDelete?.count} {toDelete?.count === 1 ? 'story' : 'stories'}. The stories themselves are not changed in any other way.
      </ConfirmDialog>
    </Card>
  );
}

export function Categories() {
  useEffect(() => {
    document.title = 'Categories · 180news Newsroom CMS';
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Organise"
        title="Categories"
        description="The sections of the site that stories are filed under. Switch them on or off, rename them and set their order in the menu."
      />
      <div className="max-w-3xl">
        <SectionsPanel onChanged={() => {}} />
      </div>
    </>
  );
}

export function TagsPage() {
  useEffect(() => {
    document.title = 'Tags · 180news Newsroom CMS';
  }, []);

  return (
    <>
      <PageHeader eyebrow="Organise" title="Tags" description="Tags group stories on the same subject across categories. Rename one, merge two that mean the same thing, or remove one from every story." />
      <div className="max-w-3xl">
        <TagsPanel refreshKey={0} />
      </div>
    </>
  );
}
