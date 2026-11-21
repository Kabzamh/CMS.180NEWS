import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleCheck, Copy, Megaphone, Sparkles, TriangleAlert } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useLoad } from '../hooks/useLoad';
import type { AdSize, AdSlot, Settings } from '../lib/types';
import { timeAgo } from '../lib/format';
import { createHouseAd } from '../lib/houseAd';
import { ImagePicker } from '../components/ImagePicker';
import { Button, Card, CardHead, EmptyState, ErrorState, PageHeader, Pill, SelectInput, SkeletonRows, TextInput, Toggle, cx, useToast } from '../components/ui';

interface SlotForm {
  advertiser: string;
  link_url: string;
  image_url: string | null;
  position: string;
  enabled: boolean;
  width: number | null;
  height: number | null;
}

const toForm = (slot: AdSlot): SlotForm => ({
  advertiser: slot.advertiser ?? '',
  link_url: slot.link_url ?? '',
  image_url: slot.image_url,
  position: slot.position,
  enabled: slot.enabled,
  width: slot.width,
  height: slot.height,
});

const px = (size: { w: number; h: number }) => `${size.w} × ${size.h}`;

function StatusPill({ slot, adsOn }: { slot: AdSlot; adsOn: boolean }) {
  if (slot.enabled && slot.image_url && adsOn) return <Pill className="bg-live-tint text-live-deep">Showing</Pill>;
  if (slot.enabled && slot.image_url) return <Pill className="bg-warn-tint text-warn-deep">Adverts are off</Pill>;
  return <Pill className="bg-wash text-body ring-1 ring-line-strong ring-inset">Not showing</Pill>;
}

/** How an uploaded image compares with the size the position is built for. */
function fitNote(size: AdSize | null, w: number | null, h: number | null): { ok: boolean; text: string } | null {
  if (!size || !w || !h) return null;
  const mine = `Your image is ${px({ w, h })}.`;
  const shape = w / h / (size.w / size.h);
  const sameShape = shape > 0.92 && shape < 1.09;
  if (sameShape && w >= size.w) return { ok: true, text: `${mine} It fits this position.` };
  if (sameShape) return { ok: false, text: `${mine} It is the right shape but smaller than ${px(size)}, so it is shown smaller than the space.` };
  if (size.flexible) return { ok: true, text: `${mine} This position takes any shape, so it will show. ${px(size)} fills the space best.` };
  return { ok: false, text: `${mine} That is a different shape from ${px(size)}, so it is shrunk to fit inside the space and may be hard to read.` };
}

/** The empty position, drawn in its own proportions with the size it needs. */
function SizeFrame({ size }: { size: AdSize }) {
  const tall = size.h / size.w > 0.6;
  return (
    <div className="flex justify-center border border-dashed border-line-strong bg-wash p-3">
      <div
        className={cx('flex w-full items-center justify-center border border-line-strong bg-paper', tall ? 'flex-col gap-2' : 'gap-3')}
        style={{ aspectRatio: `${size.w} / ${size.h}`, maxWidth: Math.min(size.w, Math.round((220 * size.w) / size.h)) }}
      >
        <img src="/logo.png" alt="" className={cx('w-auto', tall ? 'max-h-10 max-w-[70%]' : 'h-[58%] max-h-11')} />
        <span className="text-[13px] leading-none font-black whitespace-nowrap text-navy tabular-nums">{px(size)}</span>
      </div>
    </div>
  );
}

function SlotCard({ slot, adsOn, onSaved }: { slot: AdSlot; adsOn: boolean; onSaved: (slot: AdSlot) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<SlotForm>(() => toForm(slot));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(slot));
  const positions = Array.isArray(slot.positions) ? slot.positions : [];
  const note = form.image_url ? fitNote(slot.size, form.width, form.height) : null;

  const set = (patch: Partial<SlotForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
  };

  const useHouseAdvert = async () => {
    if (!slot.size) return;
    setDrawing(true);
    try {
      const item = await createHouseAd(slot.size);
      set({ image_url: item.url, width: item.width, height: item.height, advertiser: form.advertiser || '180 News house advert' });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setDrawing(false);
    }
  };

  const save = async () => {
    const found: Record<string, string> = {};
    const link = form.link_url.trim();
    if (link && !/^https?:\/\/\S+\.\S+/i.test(link)) found.link_url = 'Enter a full web address that starts with https://';
    if (form.enabled && !form.image_url) found.image_url = 'Add the advert image before switching this slot on.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      const saved = await api<AdSlot>('/api/ads', { method: 'PUT', body: { id: slot.id, ...form, link_url: link } });
      onSaved(saved);
      setForm(toForm(saved));
      toast(`${slot.slot_name} advert saved.`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div id={`ad-${slot.slot}`} className="flex scroll-mt-20 flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-ink">{slot.slot_name}</h2>
          <p className="mt-0.5 text-[15px] text-muted">{slot.description}</p>
          {slot.size && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
              <span className="inline-flex h-6 items-center bg-navy px-2 text-[13px] font-extrabold whitespace-nowrap text-white tabular-nums">{px(slot.size)}</span>
              <span className="font-bold text-ink">{slot.size.format}</span>
              <span className="text-muted">pixels, width × height</span>
            </p>
          )}
        </div>
        <StatusPill slot={slot} adsOn={adsOn} />
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-2">
        <div className="min-w-0">
          <ImagePicker
            label="Advert image"
            contain
            hint={slot.shape ?? 'JPG, PNG, WebP or GIF. It is resized to fit.'}
            value={form.image_url}
            error={errors.image_url}
            disabled={saving || drawing}
            empty={slot.size ? <SizeFrame size={slot.size} /> : undefined}
            onChange={(url, item) => set({ image_url: url, width: item?.width ?? null, height: item?.height ?? null, ...(url ? {} : { enabled: false }) })}
          />
          {note && (
            <p className={cx('mt-2.5 flex items-start gap-2 text-[14px] leading-snug font-semibold', note.ok ? 'text-live-deep' : 'text-warn-deep')}>
              {note.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span>{note.text}</span>
            </p>
          )}
          {!form.image_url && slot.size && (
            <div className="mt-4 border-t border-line pt-3.5">
              <Button variant="outline" size="sm" loading={drawing} disabled={saving} onClick={useHouseAdvert} icon={<Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />}>
                {drawing ? 'Drawing the advert' : 'Use the 180 News house advert'}
              </Button>
              <p className="mt-1.5 text-[13.5px] leading-snug text-muted">An “Advertise with us” banner with the 180 News logo, drawn at {px(slot.size)}. It fills the position until the space is sold.</p>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <TextInput
            label="Advertiser"
            optional
            maxLength={80}
            disabled={saving}
            value={form.advertiser}
            onChange={(e) => set({ advertiser: e.target.value })}
            hint="For your own records, and read out to readers who cannot see the image."
          />
          <TextInput
            label="Link when the advert is tapped"
            optional
            type="url"
            inputMode="url"
            placeholder="https://"
            disabled={saving}
            value={form.link_url}
            onChange={(e) => set({ link_url: e.target.value })}
            error={errors.link_url}
          />
          {positions.length > 1 ? (
            <SelectInput label="Position" disabled={saving} value={form.position} onChange={(e) => set({ position: e.target.value })}>
              {positions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectInput>
          ) : (
            <div>
              <p className="mb-1 text-sm font-bold text-ink">Position</p>
              <p className="text-[15px] text-body">{positions[0]?.[1] ?? 'Fixed'}</p>
            </div>
          )}
          <div className="border-t border-line pt-4">
            <Toggle
              label="Show this slot"
              description={form.image_url ? 'Readers see the advert in this position.' : 'Add an image first.'}
              checked={form.enabled}
              disabled={saving || !form.image_url}
              onChange={(enabled) => set({ enabled })}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-wash px-5 py-3.5">
        <p className="text-sm text-muted">
          {dirty ? <span className="font-bold text-warn-deep">Changes not saved yet.</span> : slot.updated_at ? `Last saved ${timeAgo(slot.updated_at)}.` : 'Not set up yet.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {dirty && (
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => {
                setForm(toForm(slot));
                setErrors({});
              }}
            >
              Undo changes
            </Button>
          )}
          <Button loading={saving} disabled={!dirty} onClick={save}>
            Save advert
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Every position with its banner size, drawn to one scale, and a list to send to advertisers. */
function SizeGuide({ slots, adsOn }: { slots: AdSlot[]; adsOn: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const sized = slots.filter((slot) => slot.size);
  const scale = 96 / Math.max(1, ...sized.map((slot) => slot.size!.w));

  const copy = async () => {
    const text = [
      '180 News advert sizes',
      'In pixels, width × height.',
      '',
      ...sized.map((slot) => `${slot.slot_name}: ${px(slot.size!)} (${slot.size!.format.toLowerCase()})`),
      '',
      'Send a JPG, PNG, WebP or GIF, under 3 MB.',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast('Copying is blocked in this browser. The sizes are listed below to type out.', 'error');
    }
  };

  return (
    <Card>
      <CardHead
        title="Banner sizes"
        note="What to ask an advertiser for, position by position"
        action={
          <Button variant="outline" size="sm" onClick={copy} icon={copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}>
            {copied ? 'Copied' : 'Copy the size list'}
          </Button>
        }
      />
      <ul className="divide-y divide-line">
        {sized.map((slot) => (
          <li key={slot.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3">
            <span aria-hidden="true" className="hidden h-[62px] w-[100px] shrink-0 items-center justify-center sm:flex">
              <span className="block border-2 border-navy bg-navy-tint" style={{ width: Math.max(8, Math.round(slot.size!.w * scale)), height: Math.max(6, Math.round(slot.size!.h * scale)) }} />
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <button
                type="button"
                onClick={() => document.getElementById(`ad-${slot.slot}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="cursor-pointer text-left text-[16px] font-extrabold text-ink hover:text-brand"
              >
                {slot.slot_name}
              </button>
              <p className="text-sm leading-snug text-muted">
                {slot.size!.format}
                {slot.size!.flexible ? ', or any shape up to 280 pixels tall' : ''}
              </p>
            </div>
            <span className="text-[19px] leading-none font-black whitespace-nowrap text-ink tabular-nums">{px(slot.size!)}</span>
            <span className="flex w-full sm:w-[124px] sm:justify-end">
              <StatusPill slot={slot} adsOn={adsOn} />
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line bg-wash px-5 py-3 text-sm leading-snug text-muted">Sizes are in pixels, width × height. The outlines are drawn to one scale. JPG, PNG, WebP or GIF, under 3 MB.</p>
    </Card>
  );
}

export default function Ads() {
  const toast = useToast();
  const slots = useLoad(() => api<AdSlot[]>('/api/ads'), []);
  const settings = useLoad(() => api<Settings>('/api/settings'), []);
  const [savingGlobal, setSavingGlobal] = useState(false);

  useEffect(() => {
    document.title = 'Ads control · 180news Newsroom CMS';
  }, []);

  const adsOn = settings.data?.ads_enabled ?? true;

  const toggleAds = async (value: boolean) => {
    setSavingGlobal(true);
    try {
      const next = await api<Settings>('/api/settings', { method: 'PUT', body: { key: 'ads_enabled', value } });
      settings.setData(next);
      toast(value ? 'Adverts are showing on the site.' : 'All adverts are switched off.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSavingGlobal(false);
    }
  };

  const error = slots.error && !slots.data ? slots.error : settings.error && !settings.data ? settings.error : null;
  const sites = settings.data?.site_link?.sites ?? [];
  const behind = sites.filter((site) => site.outdated).map((site) => site.origin.replace(/^https:\/\//, ''));
  const newer = (slots.data ?? []).filter((slot) => slot.connector).map((slot) => slot.slot_name);

  return (
    <>
      <PageHeader eyebrow="Site" title="Ads control" description="One advert for each position on the site. Upload the image at the size shown, add the link and switch the slot on." />

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            slots.reload();
            settings.reload();
          }}
        />
      ) : !slots.data || !settings.data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-6">
          {sites.length === 0 ? (
            <p className="border border-l-4 border-line border-l-brand bg-paper px-4 py-3.5 text-[15px] leading-snug text-body">
              <span className="font-extrabold text-ink">The 180news site is not connected yet,</span> so adverts set up here do not reach it.{' '}
              <Link to="/settings" className="font-bold text-navy underline">
                Connect the site
              </Link>
            </p>
          ) : (
            behind.length > 0 &&
            newer.length > 0 && (
              <p className="border border-l-4 border-line border-l-warn bg-paper px-4 py-3.5 text-[15px] leading-snug text-body">
                <span className="font-extrabold text-ink">{behind.join(' and ')} is on an older site connector.</span> {newer.join(', ')} will not show there until the line on the site is replaced. The other
                positions work as before.{' '}
                <Link to="/settings" className="font-bold text-navy underline">
                  Get the new line
                </Link>
              </p>
            )
          )}

          <Card className="border-l-4 border-l-navy p-5">
            <Toggle
              label="Show adverts on the site"
              description="The master switch. Off hides every advert at once without changing the slots below."
              checked={adsOn}
              disabled={savingGlobal}
              onChange={toggleAds}
            />
          </Card>

          {slots.data.length === 0 ? (
            <EmptyState icon={<Megaphone className="h-8 w-8" aria-hidden="true" />} title="No advert slots are set up">
              The site has no advert positions defined yet.
            </EmptyState>
          ) : (
            <>
              <SizeGuide slots={slots.data} adsOn={adsOn} />
              {slots.data.map((slot) => (
                <SlotCard key={slot.id} slot={slot} adsOn={adsOn} onSaved={(saved) => slots.setData((slots.data ?? []).map((s) => (s.id === saved.id ? saved : s)))} />
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}
