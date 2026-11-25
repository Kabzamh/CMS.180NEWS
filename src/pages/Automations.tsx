import { useEffect, useState } from 'react';
import {
  Workflow, Bell, Megaphone, Share2, Webhook, Plus, Pencil, Trash2, Play,
  Send, CalendarClock, Zap, MessageSquare, History,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api, errMsg } from '../lib/api';
import { PageHeader, Card, CardHead, Button, Input, Select, Toggle, Spinner, ErrorBox, Toast, Empty, Badge, fmtDate } from '../components/ui';
import type { AutomationAction, AutomationEvent, AutomationRow, AutomationRunRow } from '../lib/types';

const EVENT_META: Record<AutomationEvent, { label: string; icon: typeof Send; hint: string }> = {
  article_published: { label: 'A story is published', icon: Send, hint: 'Fires the moment a draft goes live on the news app.' },
  article_scheduled: { label: 'A story is scheduled', icon: CalendarClock, hint: 'Fires when a story is set to publish later.' },
  breaking_set: { label: 'A story becomes breaking', icon: Zap, hint: 'Fires when a story is promoted to the main headline.' },
  comment_received: { label: 'A reader leaves a comment', icon: MessageSquare, hint: 'Fires when a new comment comes in on any story.' },
};

const ACTION_META: Record<AutomationAction, { label: string; icon: typeof Bell; hint: string }> = {
  notify_team: { label: 'Notify the newsroom team', icon: Bell, hint: 'Queues an in-desk notification for everyone active.' },
  site_banner: { label: 'Show a site notice banner', icon: Megaphone, hint: 'Turns on the reader-facing banner with a message you choose.' },
  social_reminder: { label: 'Queue a social share reminder', icon: Share2, hint: 'Adds a reminder to post the story to Facebook & WhatsApp.' },
  webhook: { label: 'Call a webhook', icon: Webhook, hint: 'Simulates sending the event to an external URL.' },
};

const emptyForm = () => ({
  name: '',
  event: 'article_published' as AutomationEvent,
  action: 'notify_team' as AutomationAction,
  message: 'BREAKING: {headline}',
  webhook_url: '',
  enabled: true,
});

export default function AutomationsPage() {
  const list = useApi<{ automations: AutomationRow[]; runs: AutomationRunRow[] }>(() => api('/api/automations'), []);
  const [openId, setOpenId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Automations · 180news Newsroom CMS';
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const automations = list.data?.automations || [];
  const runs = list.data?.runs || [];

  const openNew = () => {
    setForm(emptyForm());
    setFields({});
    setOpenId('new');
  };

  const openEdit = (a: AutomationRow) => {
    setForm({
      name: a.name,
      event: a.event,
      action: a.action,
      message: a.config.message || 'BREAKING: {headline}',
      webhook_url: a.config.webhook_url || '',
      enabled: a.enabled,
    });
    setFields({});
    setOpenId(a.id);
  };

  const close = () => setOpenId(null);

  const save = async () => {
    const f: Record<string, string> = {};
    if (form.name.trim().length < 3) f.name = 'Give the automation a short name.';
    setFields(f);
    if (Object.keys(f).length) return;

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        event: form.event,
        action: form.action,
        config: { message: form.message, webhook_url: form.webhook_url },
        enabled: form.enabled,
      };
      if (openId === 'new') {
        await api('/api/automations', { method: 'POST', body });
        flash('Automation created.');
      } else if (openId) {
        await api('/api/automations', { method: 'PUT', body: { id: openId, ...body } });
        flash('Automation saved.');
      }
      close();
      await list.reload(true);
    } catch (e) {
      flash(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a: AutomationRow) => {
    try {
      await api('/api/automations', { method: 'PUT', body: { id: a.id, enabled: !a.enabled } });
      await list.reload(true);
    } catch (e) {
      flash(errMsg(e));
    }
  };

  const runTest = async (a: AutomationRow) => {
    setBusyId(a.id);
    try {
      await api('/api/automations', { method: 'PUT', body: { id: a.id, action_type: 'run_test' } });
      flash(`Test run complete — see it in the activity log below.`);
      await list.reload(true);
    } catch (e) {
      flash(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!delId) return;
    try {
      await api('/api/automations', { method: 'DELETE', body: { id: delId } });
      flash('Automation deleted.');
      if (openId === delId) close();
      await list.reload(true);
    } catch (e) {
      flash(errMsg(e));
    } finally {
      setDelId(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Desk · Automations"
        title="Triggers"
        description="Set up “when this happens, do that” rules for the news app — publish a story, go breaking, or get a comment, and the desk reacts automatically."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openNew}>
            New trigger
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            {list.loading && !list.data ? (
              <Spinner label="Loading automations" />
            ) : list.error ? (
              <ErrorBox message={list.error} onRetry={() => list.reload()} />
            ) : automations.length === 0 ? (
              <Empty icon={<Workflow className="h-8 w-8" />} title="No triggers yet">
                Create one to connect a newsroom event to an automatic action.
              </Empty>
            ) : (
              <ul className="divide-y divide-line">
                {automations.map((a) => {
                  const EventIcon = EVENT_META[a.event].icon;
                  const ActionIcon = ACTION_META[a.action].icon;
                  return (
                    <li key={a.id} className="space-y-3 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-extrabold text-ink">{a.name}</p>
                            <Badge tone={a.enabled ? 'published' : 'wash'}>{a.enabled ? 'On' : 'Off'}</Badge>
                          </div>
                          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                            <EventIcon className="h-3.5 w-3.5 text-navy" /> {EVENT_META[a.event].label}
                            <span className="text-off">→</span>
                            <ActionIcon className="h-3.5 w-3.5 text-brand" /> {ACTION_META[a.action].label}
                          </p>
                          <p className="mt-1 text-xs text-off">
                            {a.run_count > 0 ? `Ran ${a.run_count} time${a.run_count === 1 ? '' : 's'} · last ${fmtDate(a.last_run_at)}` : 'Never run yet'}
                          </p>
                        </div>
                        <Toggle label="" checked={a.enabled} onChange={() => toggle(a)} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" icon={<Play className="h-3.5 w-3.5" />} loading={busyId === a.id} onClick={() => runTest(a)}>
                          Test run
                        </Button>
                        <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(a)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDelId(a.id)}>
                          Delete
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHead title="Activity log" note="What each trigger actually did, most recent first" />
            {runs.length === 0 ? (
              <p className="px-5 py-6 text-[15px] text-muted">Nothing has fired yet. Publish a story or use “Test run” above.</p>
            ) : (
              <ul className="divide-y divide-line">
                {runs.map((r) => {
                  const ActionIcon = ACTION_META[r.action].icon;
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-tint text-navy">
                        <ActionIcon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-ink">{r.automation_name}</p>
                        <p className="text-sm text-muted">{r.detail}</p>
                        <p className="mt-0.5 text-xs text-off">
                          Triggered by “{r.trigger_label}” · {fmtDate(r.created_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {openId !== null && (
          <Card className="h-fit p-5 lg:sticky lg:top-6">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-5 w-5 text-navy" />
              <h2 className="text-lg font-extrabold">{openId === 'new' ? 'New trigger' : 'Edit trigger'}</h2>
            </div>
            <div className="space-y-3">
              <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={fields.name} placeholder="e.g. Notify team on publish" />
              <Select label="When this happens" value={form.event} onChange={(e) => setForm((f) => ({ ...f, event: e.target.value as AutomationEvent }))}>
                {(Object.keys(EVENT_META) as AutomationEvent[]).map((ev) => (
                  <option key={ev} value={ev}>{EVENT_META[ev].label}</option>
                ))}
              </Select>
              <p className="-mt-2 text-xs text-muted">{EVENT_META[form.event].hint}</p>

              <Select label="Do this" value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as AutomationAction }))}>
                {(Object.keys(ACTION_META) as AutomationAction[]).map((ac) => (
                  <option key={ac} value={ac}>{ACTION_META[ac].label}</option>
                ))}
              </Select>
              <p className="-mt-2 text-xs text-muted">{ACTION_META[form.action].hint}</p>

              {form.action === 'site_banner' && (
                <Input
                  label="Banner message"
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  hint="Use {headline} to insert the story's headline."
                />
              )}
              {form.action === 'webhook' && (
                <Input
                  label="Webhook URL"
                  value={form.webhook_url}
                  onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
                  placeholder="https://example.com/hooks/180news"
                  hint="Calls are simulated in this demo and logged in the activity log."
                />
              )}

              <Toggle label="Trigger is on" checked={form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
            </div>
            <div className="mt-4 flex gap-2">
              <Button loading={saving} onClick={save}>Save</Button>
              <Button variant="outline" onClick={close}>Cancel</Button>
            </div>
          </Card>
        )}
      </div>

      {delId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-line bg-paper p-6">
            <h3 className="text-lg font-extrabold">Delete this trigger?</h3>
            <p className="mt-2 text-sm text-muted">It will stop running immediately. This cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDelId(null)}>Cancel</Button>
              <Button variant="danger" onClick={remove}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} />}
    </>
  );
}
