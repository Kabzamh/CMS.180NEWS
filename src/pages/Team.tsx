import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useMember } from '../contexts/AuthContext';
import { useLoad } from '../hooks/useLoad';
import type { Member, Role } from '../lib/types';
import { ROLE_BLURB, ROLE_LABEL, initials, timeAgo } from '../lib/format';
import { Button, Card, CardHead, ConfirmDialog, Dialog, ErrorState, PageHeader, Pill, SelectInput, SkeletonRows, TextInput, cx, useToast } from '../components/ui';

const ROLES: Role[] = ['writer', 'editor', 'owner'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function makePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
}

export default function Team() {
  const me = useMember();
  const toast = useToast();
  const team = useLoad(() => api<Member[]>('/api/team'), []);

  const [form, setForm] = useState({ name: '', email: '', role: 'writer' as Role, password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<{ name: string; email: string; password: string } | null>(null);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [resetting, setResetting] = useState<Member | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | undefined>();
  const [resetBusy, setResetBusy] = useState(false);
  const [toRemove, setToRemove] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    document.title = 'Users and roles · 180news Newsroom CMS';
  }, []);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (form.name.trim().length < 2) found.name = 'Enter their name.';
    if (!form.email.trim()) found.email = 'Enter their email address.';
    else if (!EMAIL.test(form.email.trim())) found.email = 'Enter a valid email address, for example thandi@180news.co.za.';
    if (form.password.length < 8) found.password = 'Use at least 8 characters.';
    setErrors(found);
    if (Object.keys(found).length) return;

    setAdding(true);
    try {
      const created = await api<Member>('/api/team', { method: 'POST', body: { ...form, name: form.name.trim(), email: form.email.trim() } });
      setAdded({ name: created.name, email: created.email, password: form.password });
      setForm({ name: '', email: '', role: 'writer', password: '' });
      toast(`${created.name} has been added to the team.`);
      await team.reload(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast(errorMessage(err), 'error');
    } finally {
      setAdding(false);
    }
  };

  const patch = async (member: Member, body: Record<string, unknown>, done: string) => {
    setBusyId(member.id);
    try {
      await api('/api/team', { method: 'PUT', body: { id: member.id, ...body } });
      toast(done);
      await team.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const saveReset = async () => {
    if (!resetting) return;
    if (newPassword.length < 8) return setResetError('Use at least 8 characters.');
    setResetBusy(true);
    try {
      await api('/api/team', { method: 'PUT', body: { id: resetting.id, password: newPassword } });
      setAdded({ name: resetting.name, email: resetting.email, password: newPassword });
      toast(`New password set for ${resetting.name}.`);
      setResetting(null);
    } catch (err) {
      setResetError(errorMessage(err));
    } finally {
      setResetBusy(false);
    }
  };

  const remove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await api('/api/team', { method: 'DELETE', body: { id: toRemove.id } });
      toast(`${toRemove.name} has been removed from the team.`);
      setToRemove(null);
      await team.reload(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="People" title="Users and roles" description="Who can sign in to the newsroom and what each person is allowed to do." />

      {added && (
        <div role="status" className="mb-6 border border-live-deep/40 border-l-4 border-l-live-deep bg-live-tint p-5">
          <p className="text-lg font-extrabold text-ink">Pass these sign-in details to {added.name}</p>
          <p className="mt-1 text-[15px] text-body">
            The newsroom does not send emails, so share them privately. They can set their own password under Your account. The password is not shown again.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[15px]">
            <dt className="text-muted">Email</dt>
            <dd className="font-bold break-all text-ink">{added.email}</dd>
            <dt className="text-muted">Password</dt>
            <dd className="font-mono font-bold break-all text-ink">{added.password}</dd>
          </dl>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setAdded(null)}>
            I have noted them
          </Button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHead title="People with access" note={team.data ? `${team.data.length} ${team.data.length === 1 ? 'person' : 'people'}` : undefined} />
          {team.error && !team.data ? (
            <div className="p-5">
              <ErrorState message={team.error} onRetry={() => team.reload()} />
            </div>
          ) : !team.data ? (
            <div className="p-5">
              <SkeletonRows rows={3} />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {team.data.map((member) => {
                const self = member.id === me.id;
                const busy = busyId === member.id;
                return (
                  <li key={member.id} className="p-4 sm:p-5">
                    <div className="flex items-start gap-3.5">
                      <span aria-hidden="true" className={cx('flex h-11 w-11 shrink-0 items-center justify-center text-sm font-black', member.active ? 'bg-navy text-white' : 'bg-wash text-muted')}>
                        {initials(member.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="text-[17px] font-extrabold text-ink">{member.name}</p>
                          {self && <Pill className="bg-navy-tint text-navy">You</Pill>}
                          {!member.active && <Pill className="bg-brand-tint text-brand">Access off</Pill>}
                        </div>
                        <p className="text-[15px] break-all text-body">{member.email}</p>
                        <p className="mt-0.5 text-[13.5px] text-muted">{member.last_seen_at ? `Last signed in ${timeAgo(member.last_seen_at)}` : 'Has not signed in yet'}</p>
                      </div>
                    </div>

                    <div className="mt-3.5 flex flex-wrap items-center gap-2 sm:pl-[58px]">
                      <label className="sr-only" htmlFor={`role-${member.id}`}>
                        Role for {member.name}
                      </label>
                      <select
                        id={`role-${member.id}`}
                        value={member.role}
                        disabled={busy}
                        onChange={(e) => patch(member, { role: e.target.value }, `${member.name} is now ${ROLE_LABEL[e.target.value as Role].toLowerCase()}.`)}
                        className="h-9 cursor-pointer border border-line-strong bg-paper px-2.5 text-sm font-bold text-ink focus:border-navy focus:ring-2 focus:ring-navy/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setResetting(member);
                          setNewPassword(makePassword());
                          setResetError(undefined);
                        }}
                        icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
                      >
                        Reset password
                      </Button>
                      {!self && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            loading={busy}
                            onClick={() => patch(member, { active: !member.active }, member.active ? `${member.name} can no longer sign in.` : `${member.name} can sign in again.`)}
                          >
                            {member.active ? 'Switch off access' : 'Restore access'}
                          </Button>
                          <Button variant="danger" size="sm" disabled={busy} onClick={() => setToRemove(member)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
                            Remove
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHead title="Add a user" />
            <form onSubmit={invite} noValidate className="space-y-4 p-5">
              <TextInput label="Name" autoComplete="off" maxLength={80} disabled={adding} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
              <TextInput
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="off"
                disabled={adding}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                error={errors.email}
                hint="What they sign in with. A Google account with this address works too."
              />
              <SelectInput label="Role" disabled={adding} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} error={errors.role} hint={ROLE_BLURB[form.role]}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </SelectInput>
              <div>
                <TextInput
                  label="Temporary password"
                  autoComplete="off"
                  disabled={adding}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  error={errors.password}
                  hint="At least 8 characters. You pass it on to them yourself."
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1.5 -ml-2"
                  disabled={adding}
                  onClick={() => {
                    setForm({ ...form, password: makePassword() });
                    setErrors(({ password: _drop, ...rest }) => rest);
                  }}
                  icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                >
                  Make one for me
                </Button>
              </div>
              <Button type="submit" className="w-full" loading={adding} icon={<UserPlus className="h-[18px] w-[18px]" aria-hidden="true" />}>
                Add user
              </Button>
            </form>
          </Card>

          <Card>
            <CardHead title="What each role can do" />
            <dl className="divide-y divide-line">
              {(['owner', 'editor', 'writer'] as Role[]).map((role) => (
                <div key={role} className="px-5 py-3">
                  <dt className="text-[15px] font-extrabold text-ink">{ROLE_LABEL[role]}</dt>
                  <dd className="text-sm leading-snug text-muted">{ROLE_BLURB[role]}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>

      <Dialog
        open={Boolean(resetting)}
        onClose={() => !resetBusy && setResetting(null)}
        title={`New password for ${resetting?.name ?? ''}`}
        footer={
          <>
            <Button variant="outline" disabled={resetBusy} onClick={() => setResetting(null)}>
              Cancel
            </Button>
            <Button loading={resetBusy} onClick={saveReset}>
              Save new password
            </Button>
          </>
        }
      >
        <p className="mb-4 text-[15.5px] leading-relaxed text-body">Their current password stops working straight away. You pass the new one on to them yourself.</p>
        <TextInput
          label="New password"
          autoComplete="off"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setResetError(undefined);
          }}
          error={resetError}
          hint="At least 8 characters."
        />
      </Dialog>

      <ConfirmDialog
        open={Boolean(toRemove)}
        title={`Remove ${toRemove?.name ?? ''} from the team?`}
        confirmLabel="Remove from the team"
        cancelLabel="Keep"
        busy={removing}
        onConfirm={remove}
        onClose={() => !removing && setToRemove(null)}
      >
        They will no longer be able to sign in. Stories they wrote stay in the newsroom with their byline. To stop access for a while instead, use Switch off access.
      </ConfirmDialog>
    </>
  );
}
