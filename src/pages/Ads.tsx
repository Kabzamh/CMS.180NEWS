import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useLoad } from '../hooks/useLoad';
import type { AdSlot, Settings } from '../lib/types';
import { timeAgo } from '../lib/format';
import { ImagePicker } from '../components/ImagePicker';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pill, SelectInput, SkeletonRows, TextInput, Toggle, useToast } from '../components/ui';

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

function SlotCard({ slot, adsOn, onSaved }: { slot: AdSlot; adsOn: boolean; onSaved: (slot: AdSlot) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<SlotForm>(() => toForm(slot));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(slot));
  const positions = Array.isArray(slot.positions) ? slot.positions : [];
  const live = slot.enabled && Boolean(slot.image_url) && adsOn;

  const set = (patch: Partial<SlotForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
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
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-ink">{slot.slot_name}</h2>
          <p className="mt-0.5 text-[15px] text-muted">{slot.description}</p>
        </div>
        {live ? (
          <Pill className="bg-live-tint text-live-deep">Showing</Pill>
        ) : slot.enabled && slot.image_url ? (
          <Pill className="bg-warn-tint text-warn-deep">Adverts are off</Pill>
        ) : (
          <Pill className="bg-wash text-body ring-1 ring-line-strong ring-inset">Not showing</Pill>
        )}
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-2">
        <div>
          <ImagePicker
            label="Advert image"
            contain
            hint={slot.shape ?? 'JPG, PNG, WebP or GIF. It is resized to fit.'}
            value={form.image_url}
            error={errors.image_url}
            disabled={saving}
            onChange={(url, item) => set({ image_url: url, width: item?.width ?? null, height: item?.height ?? null, ...(url ? {} : { enabled: false }) })}
          />
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
            <Button variant="outline" disabled={saving} onClick={() => { setForm(toForm(slot)); setErrors({}); }}>
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

  return (
    <>
      <PageHeader eyebrow="Site" title="Ads control" description="One advert for each position on the site. Upload the image, add the link and switch the slot on." />

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
            slots.data.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                adsOn={adsOn}
                onSaved={(saved) => slots.setData((slots.data ?? []).map((s) => (s.id === saved.id ? saved : s)))}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}
