import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarClock, Eye, EyeOff, PenLine, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getConfig, type PublicConfig } from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { errorMessage } from '../lib/api';
import { Logo } from '../components/Logo';
import { NoAccessScreen } from '../components/Shell';
import { Button, Spinner, TextInput, cx, inputClass } from '../components/ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const POINTS = [
  { icon: PenLine, title: 'Write and edit', text: 'Drafts, review and publishing in one place, with a preview of the finished story.' },
  { icon: CalendarClock, title: 'Schedule ahead', text: 'Line stories up for the morning and let them go live on their own.' },
  { icon: Users, title: 'Shared by the team', text: 'Everyone sees the same stories, on any device. Nothing lives in one browser.' },
];

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function Login() {
  const { status, signIn, error: authError, retry } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<PublicConfig['demoLogin']>(null);

  useEffect(() => {
    document.title = 'Sign in · 180news Newsroom CMS';
    getConfig()
      .then((config) => setDemo(config.demoLogin))
      .catch(() => setDemo(null));
  }, []);

  useEffect(() => {
    if (status === 'error' || status === 'signedOut') setBusy(false);
  }, [status]);

  if (status === 'ready') return <Navigate to={from} replace />;
  if (status === 'noAccess') return <NoAccessScreen />;
  if (status === 'loading' && !busy) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-wash">
        <Spinner label="Opening the newsroom" />
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    else if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address, for example thandi@180news.co.za.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  };

  const onGoogle = () => {
    setFormError(null);
    if (!signInWithGoogle('180news Newsroom CMS')) {
      setFormError('Google sign-in is not switched on for this site yet. Sign in with your email and password instead.');
    }
  };

  const waiting = busy;
  const shownError = formError ?? (status === 'error' ? authError : null);

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="relative hidden overflow-hidden bg-navy-deep text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 22px)' }}
        />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -bottom-24 text-[380px] leading-none font-black tracking-tighter text-white/[0.06] select-none">
          180
        </div>
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-brand" />

        <div className="relative">
          <span className="inline-block bg-paper px-4 py-3">
            <Logo />
          </span>
        </div>

        <motion.div className="relative max-w-lg" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}>
          <p className="text-[13px] font-black uppercase tracking-[0.14em] text-brand-bright">The 180news desk</p>
          <h1 className="mt-3 text-[52px] leading-[1.02] font-black tracking-tight text-balance xl:text-[62px]">Every story, one desk.</h1>
          <ul className="mt-10 space-y-6">
            {POINTS.map(({ icon: Icon, title, text }, i) => (
              <motion.li
                key={title}
                className="flex gap-4"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-white/10">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[17px] font-extrabold">{title}</span>
                  <span className="mt-0.5 block text-[15px] leading-relaxed text-white/75">{text}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <p className="relative text-sm text-white/65">For 180news staff. Access is by invitation from the newsroom owner.</p>
      </div>

      <div className="flex min-h-dvh flex-col lg:min-h-0">
        <div className="border-b-4 border-brand bg-paper px-5 py-3 lg:hidden">
          <Logo />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">
            <h2 className="text-[30px] leading-tight font-extrabold tracking-tight text-ink">Sign in to the newsroom</h2>
            <p className="mt-1.5 text-[15.5px] text-muted">Use the email address the owner added under Users and roles.</p>

            {shownError && (
              <div role="alert" className="mt-5 border-l-4 border-brand bg-brand-tint px-4 py-3 text-[15px] font-semibold text-ink">
                {shownError}
                {status === 'error' && !formError && (
                  <button type="button" onClick={retry} className="ml-2 cursor-pointer font-bold text-navy underline">
                    Try again
                  </button>
                )}
              </div>
            )}

            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              <TextInput
                label="Email"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                placeholder="you@180news.co.za"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />
              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-bold text-ink">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={errors.password ? true : undefined}
                    aria-describedby={errors.password ? 'login-password-error' : undefined}
                    className={cx(inputClass, 'pr-12', errors.password && 'border-brand')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
                  </button>
                </div>
                {errors.password && (
                  <p id="login-password-error" role="alert" className="mt-1.5 text-[13.5px] font-bold text-brand">
                    {errors.password}
                  </p>
                )}
              </div>
              <Button type="submit" loading={waiting} className="w-full">
                {waiting ? 'Signing in' : 'Sign in'}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-sm font-semibold text-muted">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <Button variant="outline" className="w-full" onClick={onGoogle} icon={<GoogleMark />}>
              Sign in with Google
            </Button>

            {demo && (
              <div className="mt-7 border border-line bg-wash p-4">
                <p className="text-[13px] font-black uppercase tracking-[0.08em] text-navy">Starter owner account</p>
                <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[15px]">
                  <dt className="text-muted">Email</dt>
                  <dd className="font-bold break-all text-ink">{demo.email}</dd>
                  <dt className="text-muted">Password</dt>
                  <dd className="font-bold break-all text-ink">{demo.password}</dd>
                </dl>
                <p className="mt-2 text-[13.5px] leading-snug text-muted">
                  This note disappears once that account sets its own password under Your account.
                </p>
                <Button
                  variant="navy"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setEmail(demo.email);
                    setPassword(demo.password);
                    setErrors({});
                    setFormError(null);
                  }}
                >
                  Fill these in
                </Button>
              </div>
            )}

            <p className="mt-7 text-[13.5px] leading-relaxed text-muted lg:hidden">
              For 180news staff. Access is by invitation from the newsroom owner.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
