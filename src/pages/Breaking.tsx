import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Search, Star } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useLoad } from '../hooks/useLoad';
import type { Article, Placement, Settings as SettingsData } from '../lib/types';
import { timeAgo } from '../lib/format';
import { Group } from './Settings';
import { Button, Card, CardHead, ErrorState, PageHeader, Pill, SelectInput, SkeletonRows, TextArea, TextInput, Toggle, cx, inputClass, useToast } from '../components/ui';

function StoryRow({ story, children }: { story: Article; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        {story.image_url ? (
          <img src={story.image_url} alt="" loading="lazy" className="h-12 w-16 shrink-0 bg-wash object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-12 w-16 shrink-0 items-center justify-center bg-wash text-line-strong">
            <FileText className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0">
          <Link to={`/articles/${story.id}`} className="block text-[15.5px] leading-snug font-bold text-ink hover:text-brand">
            {story.headline}
          </Link>
          <p className="mt-0.5 text-sm text-muted">
            By {story.author_name} · published {timeAgo(story.publish_at)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
    </li>
  );
}

export default function Breaking() {
  const toast = useToast();
  const settings = useLoad(() => api<SettingsData>('/api/settings'), []);
  const stories = useLoad(() => api<{ items: Article[] }>('/api/articles?status=published'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    document.title = 'Breaking news · 180news Newsroom CMS';
  }, []);

  const place = async (story: Article, placement: Placement, done: string) => {
    setBusy(`${placement}-${story.id}`);
    try {
      await api('/api/articles', { method: 'PUT', body: { id: story.id, placement } });
      toast(done);
      await stories.reload(true);
    } catch (err) {
      const detail = err instanceof ApiError && err.fields ? Object.values(err.fields)[0] : null;
      toast(detail ?? errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  const byNewest = (a: Article, b: Article) => new Date(b.publish_at ?? 0).getTime() - new Date(a.publish_at ?? 0).getTime();
  const all = [...(stories.data?.items ?? [])].sort(byNewest);
  const lead = all.find((a) => a.placement === 'main') ?? null;
  const headlines = all.filter((a) => a.placement === 'headline');
  const term = search.trim().toLowerCase();
  const others = all.filter((a) => a.placement === 'none' && (!term || a.headline.toLowerCase().includes(term)));
  const otherCount = all.filter((a) => a.placement === 'none').length;

  return (
    <>
      <PageHeader
        eyebrow="Newsroom"
        title="Breaking news and headlines"
        description="What leads the site: the breaking line in the crawl, the notice across every page, the main headline and the headline news beside it."
      />

      <div className="space-y-6">
        {settings.error && !settings.data ? (
          <ErrorState message={settings.error} onRetry={() => settings.reload()} />
        ) : !settings.data ? (
          <SkeletonRows rows={2} />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Group
              title="Breaking line and crawl"
              note="The moving line of headlines across the top of the site"
              settingKey="crawl"
              saved={settings.data.crawl}
              onSaved={settings.setData}
              saveLabel="Save the crawl"
            >
              {(value, set, errors, saving) => (
                <>
                  <TextInput
                    label="Breaking line"
                    optional
                    maxLength={160}
                    disabled={saving}
                    value={value.message}
                    onChange={(e) => set({ message: e.target.value })}
                    error={errors.message}
                    placeholder="For example: Results expected at 18:00"
                    hint="Runs first in the crawl, ahead of the headlines. Leave it empty when nothing is breaking."
                  />
                  <Toggle label="Show the crawl" checked={value.enabled} disabled={saving} onChange={(enabled) => set({ enabled })} />
                  <SelectInput label="Speed" disabled={saving} value={value.speed} onChange={(e) => set({ speed: e.target.value as SettingsData['crawl']['speed'] })}>
                    <option value="slow">Slow</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Fast</option>
                  </SelectInput>
                </>
              )}
            </Group>

            <Group title="Site notice" note="A short message shown at the top of every page" settingKey="notice" saved={settings.data.notice} onSaved={settings.setData} saveLabel="Save the notice">
              {(value, set, errors, saving) => (
                <>
                  <Toggle label="Show the notice" checked={value.enabled} disabled={saving} onChange={(enabled) => set({ enabled })} />
                  <TextArea
                    label="Notice"
                    rows={4}
                    maxLength={240}
                    disabled={saving}
                    value={value.text}
                    onChange={(e) => set({ text: e.target.value })}
                    error={errors.text}
                    hint={`${value.text.length} of 240 characters.`}
                    className="resize-y"
                  />
                </>
              )}
            </Group>
          </div>
        )}

        {stories.error && !stories.data ? (
          <ErrorState message={stories.error} onRetry={() => stories.reload()} />
        ) : !stories.data ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            <Card className="border-t-4 border-t-brand">
              <CardHead title="Main headline" note="The one story that leads the front page" />
              {lead ? (
                <ul>
                  <StoryRow story={lead}>
                    <Button variant="outline" size="sm" loading={busy === `headline-${lead.id}`} disabled={busy !== null} onClick={() => place(lead, 'headline', 'Moved to the headline news. No story leads the front page now.')}>
                      Move to headline news
                    </Button>
                  </StoryRow>
                </ul>
              ) : (
                <p className="px-5 py-6 text-[15px] leading-snug text-muted">No story is set as the main headline. Choose one from the lists below with Make main headline.</p>
              )}
            </Card>

            <Card>
              <CardHead title="Headline news" note={`Shown beside the main headline, newest first · ${headlines.length} ${headlines.length === 1 ? 'story' : 'stories'}`} />
              {headlines.length === 0 ? (
                <p className="px-5 py-6 text-[15px] leading-snug text-muted">No stories are in the headline news. Add some from the published stories below.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {headlines.map((story) => (
                    <StoryRow key={story.id} story={story}>
                      <Button
                        variant="navy"
                        size="sm"
                        loading={busy === `main-${story.id}`}
                        disabled={busy !== null}
                        onClick={() => place(story, 'main', 'It now leads the front page. The previous main headline moved to the headline news.')}
                        icon={<Star className="h-4 w-4" aria-hidden="true" />}
                      >
                        Make main headline
                      </Button>
                      <Button variant="outline" size="sm" loading={busy === `none-${story.id}`} disabled={busy !== null} onClick={() => place(story, 'none', 'Taken off the front page headlines.')}>
                        Remove
                      </Button>
                    </StoryRow>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHead title="Other published stories" note="Promote a story to the front page" />
              {otherCount === 0 ? (
                <p className="px-5 py-6 text-[15px] leading-snug text-muted">Every published story is already on the front page headlines.</p>
              ) : (
                <>
                  <div className="border-b border-line p-4 sm:px-5">
                    <div className="relative max-w-md">
                      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-muted" aria-hidden="true" />
                      <input type="search" aria-label="Search published stories" placeholder="Search published stories" value={search} onChange={(e) => setSearch(e.target.value)} className={cx(inputClass, 'pl-10')} />
                    </div>
                  </div>
                  {others.length === 0 ? (
                    <p className="px-5 py-6 text-[15px] text-muted">No published stories match “{search.trim()}”.</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {others.slice(0, 30).map((story) => (
                        <StoryRow key={story.id} story={story}>
                          <Button
                            variant="navy"
                            size="sm"
                            loading={busy === `main-${story.id}`}
                            disabled={busy !== null}
                            onClick={() => place(story, 'main', 'It now leads the front page. The previous main headline moved to the headline news.')}
                            icon={<Star className="h-4 w-4" aria-hidden="true" />}
                          >
                            Make main headline
                          </Button>
                          <Button variant="outline" size="sm" loading={busy === `headline-${story.id}`} disabled={busy !== null} onClick={() => place(story, 'headline', 'Added to the headline news.')}>
                            Add to headline news
                          </Button>
                        </StoryRow>
                      ))}
                    </ul>
                  )}
                  {others.length > 30 && <p className="border-t border-line px-5 py-3 text-sm text-muted">Showing the 30 newest. Search to find an older story.</p>}
                </>
              )}
            </Card>
          </>
        )}

        <p className="text-sm text-muted">
          <Pill className="mr-2 bg-navy-tint text-navy">Tip</Pill>
          A scheduled story can also be set to lead the front page: open it and choose Main headline under Category and front page.
        </p>
      </div>
    </>
  );
}
