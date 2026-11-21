import { useEffect, useState, type FormEvent } from 'react';
import { LogOut } from 'lucide-react';
import { api, ApiError, errorMessage } from '../lib/api';
import { useAuth, useMember } from '../contexts/AuthContext';
import { ROLE_BLURB, ROLE_LABEL } from '../lib/format';
import { Button, Card, CardHead, PageHeader, TextInput, useToast } from '../components/ui';

export default function Account() {
  const member = useMember();
  const { refreshMember, signOut } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(member.name);
  const [nameError, setNameError] = useState<string | undefined>();
  const [savingName, setSavingName] = useState(false);

  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<{ password?: string; again?: string }>({});
  const [savingPassword, setSavingPassword] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    document.title = 'Your account · 180news Newsroom CMS';
  }, []);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setNameError('Enter your name.');
    setSavingName(true);
    try {
      await api('/api/team', { method: 'PUT', body: { action: 'my_profile', name: name.trim() } });
      await refreshMember();
      toast('Name saved.');
    } catch (err) {
      if (err instanceof ApiError && err.fields?.name) setNameError(err.fields.name);
      toast(errorMessage(err), 'error');
    } finally {
      setSavingName(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    const found: typeof passwordErrors = {};
    if (password.length < 8) found.password = 'Use at least 8 characters.';
    if (!again) found.again = 'Type the password again.';
    else if (again !== password) found.again = 'The two passwords do not match.';
    setPasswordErrors(found);
    if (Object.keys(found).length) return;

    setSavingPassword(true);
    try {
      await api('/api/team', { method: 'PUT', body: { action: 'my_password', password } });
      setPassword('');
      setAgain('');
      toast('Password changed. Use the new one next time you sign in.');
    } catch (err) {
      if (err instanceof ApiError && err.fields?.password) setPasswordErrors({ password: err.fields.password });
      toast(errorMessage(err), 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="People" title="Your account" description="Your name as the team sees it, and your password." />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHead title="Your details" />
          <form onSubmit={saveName} noValidate className="space-y-4 p-5">
            <TextInput
              label="Your name"
              autoComplete="name"
              maxLength={80}
              disabled={savingName}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(undefined);
              }}
              error={nameError}
              hint="Used as your byline on new stories."
            />
            <dl className="space-y-3 text-[15px]">
              <div>
                <dt className="text-[13px] font-bold text-muted">Email</dt>
                <dd className="font-bold break-all text-ink">{member.email}</dd>
              </div>
              <div>
                <dt className="text-[13px] font-bold text-muted">Role</dt>
                <dd className="text-ink">
                  <span className="font-bold">{ROLE_LABEL[member.role]}.</span> {ROLE_BLURB[member.role]}
                </dd>
              </div>
            </dl>
            <Button type="submit" loading={savingName} disabled={name.trim() === member.name}>
              Save name
            </Button>
          </form>
        </Card>

        <Card>
          <CardHead title="Change your password" />
          <form onSubmit={savePassword} noValidate className="space-y-4 p-5">
            <TextInput
              label="New password"
              type="password"
              autoComplete="new-password"
              disabled={savingPassword}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordErrors({});
              }}
              error={passwordErrors.password}
              hint="At least 8 characters."
            />
            <TextInput
              label="Type the password again"
              type="password"
              autoComplete="new-password"
              disabled={savingPassword}
              value={again}
              onChange={(e) => {
                setAgain(e.target.value);
                setPasswordErrors({});
              }}
              error={passwordErrors.again}
            />
            <Button type="submit" variant="navy" loading={savingPassword}>
              Save new password
            </Button>
          </form>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[17px] font-extrabold text-ink">Sign out of the newsroom</p>
              <p className="text-[15px] text-muted">Do this on a shared computer when you are finished.</p>
            </div>
            <Button
              variant="outline"
              loading={leaving}
              onClick={async () => {
                setLeaving(true);
                try {
                  await signOut();
                } catch (err) {
                  toast(errorMessage(err), 'error');
                  setLeaving(false);
                }
              }}
              icon={<LogOut className="h-4 w-4" aria-hidden="true" />}
            >
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
