import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { api } from '../lib/api';
import { PageHeader, Card, CardHead, Spinner, ErrorBox, fmtNum, Badge } from '../components/ui';

const PERIODS = [7, 30, 90];

export default function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const days = PERIODS.includes(Number(params.get('days'))) ? Number(params.get('days')) : 7;
  const { data, loading, error, reload } = useApi<any>(
    () => api(`/api/dashboard?report=analytics&days=${days}&tz=${new Date().getTimezoneOffset()}`),
    [days]
  );

  useEffect(() => {
    document.title = 'Analytics · 180news Newsroom CMS';
  }, []);

  const m = data && data.days === days ? data : null;
  const maxStory = m?.topStories?.length ? Math.max(1, ...m.topStories.map((b: any) => b.reads)) : 1;
  const maxCat = m?.byCategory?.length ? Math.max(1, ...m.byCategory.map((b: any) => b.reads)) : 1;
  const maxPage = m?.topPages?.length ? Math.max(1, ...m.topPages.map((b: any) => b.hits)) : 1;
  const maxAd = m?.adPerformance?.length ? Math.max(1, ...m.adPerformance.map((b: any) => b.clicks)) : 1;

  return (
    <>
      <PageHeader
        eyebrow="Site"
        title="Analytics"
        description="Page visits, story reads, and per-click ad performance across the news app."
        actions={
          <div role="group" aria-label="Period" className="flex border border-line-strong bg-paper">
            {PERIODS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={days === b}
                onClick={() => setParams(b === 7 ? {} : { days: String(b) }, { replace: true })}
                className={`h-10 cursor-pointer px-4 text-[15px] font-bold whitespace-nowrap transition-colors ${
                  days === b ? 'bg-ink text-white' : 'text-body hover:bg-wash'
                }`}
              >
                {b} days
              </button>
            ))}
          </div>
        }
      />

      {loading && !m ? (
        <Spinner />
      ) : error && !m ? (
        <ErrorBox message={error} onRetry={() => reload()} />
      ) : m ? (
        <>
          <ul className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Page visits', value: m.totals.pageVisits ?? 0 },
              { label: 'Story reads', value: m.totals.reads },
              { label: 'Ad impressions', value: m.totals.adImpressions ?? 0 },
              { label: 'Ad clicks', value: m.totals.adClicks ?? 0 },
              { label: 'Ad spend (ZAR)', value: m.totals.adSpend ?? 0 },
              { label: 'Live stories', value: m.totals.stories },
            ].map((s) => (
              <li key={s.label} className="border border-line bg-paper p-4 shadow-sm sm:p-5">
                <p className="text-sm font-bold text-muted">{s.label}</p>
                <p className="mt-1 text-2xl font-extrabold text-ink tabular-nums sm:text-3xl">{fmtNum(s.value)}</p>
              </li>
            ))}
          </ul>

          <div className="mb-6 grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHead title="Ad performance (CPC)" note={`Impressions, clicks, CTR & spend · last ${days} days`} />
              {!m.adPerformance?.length ? (
                <p className="px-5 py-6 text-[15px] text-muted">No ad slots yet. Configure banners under Ads control.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {m.adPerformance.map((b: any) => (
                    <li key={b.id} className="flex gap-4 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-extrabold text-ink">{b.slot_name}</p>
                          <Badge tone="wash">{b.slot}</Badge>
                          <Badge tone="navy">{b.size}</Badge>
                        </div>
                        {b.advertiser && <p className="text-sm text-muted">{b.advertiser}</p>}
                        <p className="mt-1 text-xs text-muted">
                          {fmtNum(b.impressions ?? 0)} imps · CTR {b.ctr ?? 0}% · CPC R{b.cpc ?? 0}
                        </p>
                        <div className="mt-2 h-2 bg-wash">
                          <div className="h-2 bg-brand" style={{ width: `${(b.clicks / maxAd) * 100}%` }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-extrabold tabular-nums text-ink">{fmtNum(b.clicks)}</p>
                        <p className="text-xs font-bold text-muted uppercase">clicks</p>
                        <p className="mt-1 text-sm font-bold tabular-nums text-navy">R{fmtNum(b.spend ?? 0)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-line px-5 py-3">
                <Link to="/ads" className="text-sm font-bold text-navy hover:underline">
                  Manage ads & sizes →
                </Link>
              </div>
            </Card>

            <Card>
              <CardHead title="Page visits" note={`Top paths · last ${days} days`} />
              {!m.topPages?.length ? (
                <p className="px-5 py-6 text-[15px] text-muted">No page visits recorded yet. Open the news app to start tracking.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {m.topPages.map((b: any, i: number) => (
                    <li key={b.path} className="flex gap-4 px-5 py-3.5">
                      <span className="w-6 font-extrabold text-off">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-bold text-ink">{b.path}</p>
                        <div className="mt-2 h-2 bg-wash">
                          <div className="h-2 bg-navy" style={{ width: `${(b.hits / maxPage) * 100}%` }} />
                        </div>
                      </div>
                      <span className="font-extrabold tabular-nums text-ink">{fmtNum(b.hits)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHead title="Most read stories" note={`Top 10 by reads in the last ${days} days`} />
              {m.topStories.length === 0 ? (
                <p className="px-5 py-6 text-[15px] text-muted">No reads in this period yet.</p>
              ) : (
                <ol className="divide-y divide-line">
                  {m.topStories.map((b: any, i: number) => (
                    <li key={b.id} className="flex gap-4 px-5 py-3.5">
                      <span className="w-6 font-extrabold text-off">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <Link to={`/articles/${b.id}`} className="font-bold text-ink hover:text-brand">
                          {b.headline}
                        </Link>
                        <div className="mt-2 h-2 bg-wash">
                          <div className="h-2 bg-navy" style={{ width: `${(b.reads / maxStory) * 100}%` }} />
                        </div>
                      </div>
                      <span className="font-extrabold tabular-nums text-ink">{fmtNum(b.reads)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card>
              <CardHead title="Reads by category" />
              {m.byCategory.filter((b: any) => b.reads > 0).length === 0 ? (
                <p className="px-5 py-6 text-[15px] text-muted">No category traffic yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {m.byCategory
                    .filter((b: any) => b.reads > 0)
                    .map((b: any) => (
                      <li key={b.section} className="flex items-center gap-4 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold capitalize text-ink">{b.section.replace(/-/g, ' ')}</p>
                          <div className="mt-2 h-2 bg-wash">
                            <div className="h-2 bg-brand" style={{ width: `${(b.reads / maxCat) * 100}%` }} />
                          </div>
                        </div>
                        <span className="font-extrabold tabular-nums">{fmtNum(b.reads)}</span>
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
