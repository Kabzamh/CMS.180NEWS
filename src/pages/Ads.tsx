import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, Button, Input, Select, Toggle, Spinner, ErrorBox, Toast, Badge } from '../components/ui';
import { AD_SIZE_PRESETS, type AdSlot, type MediaAsset } from '../lib/types';

const SLOT_HINTS: Record<string, string> = {
  top: 'Above the section nav on every page',
  mid: 'Between lead story and category blocks on the front page',
  sidebar: 'Beside headline news on wide screens',
  inarticle: 'Inside long-form stories, after the first paragraphs',
  bottom: 'Above the site footer',
  mobile: 'Compact strip optimised for phones',
};

function sizeLabel(w?: number | null, h?: number | null) {
  if (!w || !h) return 'Fluid';
  const preset = AD_SIZE_PRESETS.find((p) => p.width === w && p.height === h);
  return preset ? `${preset.label} (${w}×${h})` : `${w}×${h}`;
}

export default function AdsPage() {
  const list = useApi<AdSlot[]>(() => api('/api/ads'), []);
  const settings = useApi<any>(() => api('/api/settings'), []);
  const media = useApi<MediaAsset[]>(() => api('/api/media'), []);
  const [forms, setForms] = useState<Record<number, Partial<AdSlot>>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [picker, setPicker] = useState<number | null>(null);

  useEffect(() => {
    document.title = 'Ads control · 180news Newsroom CMS';
  }, []);

  useEffect(() => {
    if (list.data) {
      const map: Record<number, Partial<AdSlot>> = {};
      for (const a of list.data) {
        map[a.id] = {
          advertiser: a.advertiser || '',
          link_url: a.link_url || '',
          image_url: a.image_url,
          position: a.position,
          enabled: a.enabled,
          width: a.width,
          height: a.height,
        };
      }
      setForms(map);
    }
  }, [list.data]);

  const adsOn = typeof settings.data?.ads_enabled === 'boolean'
    ? settings.data.ads_enabled
    : settings.data?.ads_enabled?.enabled !== false;

  const toggleAds = async (v: boolean) => {
    try {
      const next = await api('/api/settings', { method: 'PUT', body: { key: 'ads_enabled', value: v } });
      settings.setData(next);
      setToast(v ? 'Adverts are showing on the site.' : 'All adverts are switched off.');
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const patchForm = (id: number, p: Partial<AdSlot>) =>
    setForms((x) => ({ ...x, [id]: { ...x[id], ...p } }));

  const applySize = (id: number, presetId: string) => {
    const preset = AD_SIZE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    patchForm(id, {
      width: preset.width || null,
      height: preset.height || null,
      position: preset.id,
    });
  };

  const save = async (ad: AdSlot) => {
    setBusy(ad.id);
    try {
      const body = { id: ad.id, ...forms[ad.id] };
      const saved = await api<AdSlot>('/api/ads', { method: 'PUT', body });
      list.setData((list.data || []).map((x) => (x.id === saved.id ? saved : x)));
      setToast(`${ad.slot_name} saved · ${sizeLabel(saved.width, saved.height)}.`);
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setBusy(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const onUpload = async (ad: AdSlot, file: File) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    try {
      const row = await api<MediaAsset>('/api/media', {
        method: 'POST',
        body: { fileName: file.name, fileBase64: base64, contentType: file.type },
      });
      const f = forms[ad.id] || {};
      patchForm(ad.id, {
        image_url: row.url,
        width: f.width || row.width,
        height: f.height || row.height,
      });
      setToast('Creative uploaded.');
    } catch (e) {
      setToast(errMsg(e));
    } finally {
      setTimeout(() => setToast(null), 3000);
    }
  };

  const liveCount = (list.data || []).filter((a) => {
    const f = forms[a.id] || a;
    return f.enabled && f.image_url;
  }).length;

  return (
    <>
      <PageHeader
        eyebrow="Site"
        title="Ads control"
        description="Banner slots, IAB sizes and creatives for the 180news app. Turn slots on per position or kill all ads at once."
      />

      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Toggle
            label="Show adverts on the site"
            description="Master switch for every banner slot on the news app."
            checked={!!adsOn}
            onChange={toggleAds}
          />
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone={adsOn ? 'published' : 'hidden'}>{adsOn ? 'Ads live' : 'Ads off'}</Badge>
            <Badge tone="navy">{liveCount} slot{liveCount === 1 ? '' : 's'} ready</Badge>
          </div>
        </div>
      </Card>

      <Card className="mb-4 overflow-x-auto">
        <div className="border-b border-line px-5 py-3">
          <h2 className="font-extrabold text-ink">Size guide</h2>
          <p className="text-sm text-muted">Pick a preset on each slot — the news app renders to that width × height.</p>
        </div>
        <div className="flex gap-3 overflow-x-auto p-4">
          {AD_SIZE_PRESETS.map((p) => (
            <div key={p.id} className="min-w-[140px] border border-line bg-wash px-3 py-2">
              <p className="text-sm font-extrabold text-ink">{p.label}</p>
              <p className="font-mono text-xs text-navy">
                {p.width && p.height ? `${p.width}×${p.height}` : 'fluid'}
              </p>
              <p className="mt-1 text-[12px] text-muted">{p.hint}</p>
            </div>
          ))}
        </div>
      </Card>

      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={() => list.reload()} />
      ) : (
        <div className="space-y-4">
          {(list.data || []).map((ad) => {
            const f = forms[ad.id] || {};
            const presetId =
              AD_SIZE_PRESETS.find((p) => p.width === (f.width || 0) && p.height === (f.height || 0))?.id ||
              (f.position && AD_SIZE_PRESETS.some((p) => p.id === f.position) ? f.position : 'fluid');

            return (
              <Card key={ad.id}>
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-4">
                  <div>
                    <h2 className="text-xl font-extrabold text-ink">{ad.slot_name}</h2>
                    <p className="text-sm text-muted">
                      Slot <code className="text-ink">{ad.slot}</code>
                      {SLOT_HINTS[ad.slot] ? ` · ${SLOT_HINTS[ad.slot]}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={f.enabled && f.image_url ? 'published' : 'wash'}>
                      {f.enabled && f.image_url ? 'On site' : 'Off'}
                    </Badge>
                    <Badge tone="navy">{sizeLabel(f.width, f.height)}</Badge>
                  </div>
                </div>
                <div className="grid gap-4 p-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div
                      className="flex min-h-[120px] items-center justify-center border border-dashed border-line-strong bg-wash p-3"
                      style={
                        f.width && f.height
                          ? { aspectRatio: `${f.width} / ${f.height}`, maxHeight: 220 }
                          : { minHeight: 140 }
                      }
                    >
                      {f.image_url ? (
                        <img
                          src={f.image_url}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-sm text-muted">
                          Preview {f.width && f.height ? `${f.width}×${f.height}` : 'fluid'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <label className="inline-flex h-10 cursor-pointer items-center border border-line-strong px-3 text-sm font-bold hover:bg-wash">
                        Upload creative
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && onUpload(ad, e.target.files[0])}
                        />
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          media.reload();
                          setPicker(ad.id);
                        }}
                      >
                        Library
                      </Button>
                      {f.image_url && (
                        <Button size="sm" variant="ghost" onClick={() => patchForm(ad.id, { image_url: null })}>
                          Clear image
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Select
                      label="Banner size"
                      value={presetId}
                      onChange={(e) => applySize(ad.id, e.target.value)}
                    >
                      {AD_SIZE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                          {p.width && p.height ? ` — ${p.width}×${p.height}` : ' — fluid'}
                        </option>
                      ))}
                    </Select>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="Width (px)"
                        type="number"
                        min={0}
                        value={f.width ?? ''}
                        onChange={(e) =>
                          patchForm(ad.id, { width: e.target.value === '' ? null : Number(e.target.value) })
                        }
                        hint="0 = fluid"
                      />
                      <Input
                        label="Height (px)"
                        type="number"
                        min={0}
                        value={f.height ?? ''}
                        onChange={(e) =>
                          patchForm(ad.id, { height: e.target.value === '' ? null : Number(e.target.value) })
                        }
                      />
                    </div>
                    <Input
                      label="Advertiser"
                      value={f.advertiser || ''}
                      onChange={(e) => patchForm(ad.id, { advertiser: e.target.value })}
                    />
                    <Input
                      label="Click-through URL"
                      value={f.link_url || ''}
                      onChange={(e) => patchForm(ad.id, { link_url: e.target.value })}
                      placeholder="https://"
                    />
                    <Toggle
                      label="Show this slot"
                      description={
                        !adsOn
                          ? 'Master switch is off — enable site ads first.'
                          : f.image_url
                            ? 'Readers see this banner in its position.'
                            : 'Add a creative first.'
                      }
                      checked={!!f.enabled}
                      disabled={!f.image_url}
                      onChange={(v) => patchForm(ad.id, { enabled: v })}
                    />
                    <Button loading={busy === ad.id} onClick={() => save(ad)}>
                      Save {ad.slot_name}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto border border-line bg-paper p-4">
            <div className="mb-3 flex justify-between">
              <h3 className="font-extrabold">Choose creative</h3>
              <Button size="sm" variant="outline" onClick={() => setPicker(null)}>
                Close
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(media.data || [])
                .filter((m) => m.kind === 'image' || m.content_type?.startsWith('image/'))
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="cursor-pointer border hover:border-navy"
                    onClick={() => {
                      const f = forms[picker] || {};
                      patchForm(picker, {
                        image_url: m.url,
                        width: f.width || m.width,
                        height: f.height || m.height,
                      });
                      setPicker(null);
                    }}
                  >
                    <img src={m.url} alt="" className="aspect-video w-full object-cover" />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} />}
    </>
  );
}
