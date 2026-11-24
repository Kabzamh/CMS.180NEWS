import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { signInWithGoogle } from '../lib/googleAuth';
import { Button, Input, cn } from '../components/ui';
import Logo from '../components/Logo';
import {
  Eye,
  EyeOff,
  FilePen,
  CalendarClock,
  Users,
  Newspaper,
  LayoutTemplate,
  Megaphone,
  BarChart3,
  Youtube,
  Film,
  Headphones,
} from 'lucide-react';

const deskPerks = [
  {
    icon: FilePen,
    title: 'Write and publish',
    text: 'Draft, review and push your own articles live on the 180news app, with a full story preview.',
  },
  {
    icon: CalendarClock,
    title: 'Schedule ahead',
    text: 'Line stories up for the morning and let them go live on their own.',
  },
  {
    icon: Users,
    title: 'Shared by the team',
    text: 'Everyone sees the same stories, on any device. Nothing lives in one browser.',
  },
];

const controlFeatures = [
  { icon: Newspaper, label: 'Publish articles' },
  { icon: LayoutTemplate, label: 'Homepage layout' },
  { icon: Megaphone, label: 'Ads control' },
  { icon: BarChart3, label: 'Analytics' },
  { icon: Youtube, label: 'YouTube embeds' },
  { icon: Film, label: 'Short videos' },
  { icon: Headphones, label: 'Audio clips' },
];

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
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
  const from = (location.state as { from?: string })?.from || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · 180news Newsroom CMS';
  }, []);

  if (status === 'ready') return <Navigate to={from} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (!email.trim()) f.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      f.email = 'Enter a valid email address, for example owner@180news.co.za.';
    }
    if (!password) f.password = 'Enter your password.';
    setFields(f);
    setError(null);
    if (Object.keys(f).length) return;
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
      setLoading(false);
    }
  };

  const alertMsg = error || (status === 'error' ? authError : null);

  return (
    <div className="relative min-h-dvh bg-navy-deep text-white lg:grid lg:grid-cols-2">
      {/* Left brand panel — matches cms.180news.co.za */}
      <div className="relative hidden overflow-hidden px-10 py-12 lg:flex lg:flex-col lg:justify-between xl:px-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'repeating-linear-gradient(135deg, #fff 0 1px, transparent 1px 22px)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -bottom-24 select-none text-[380px] leading-none font-black tracking-tighter text-white/[0.06]"
        >
          180
        </div>
        <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-brand" />

        <div className="relative">
          <span className="inline-block bg-paper px-4 py-3">
            <Logo />
          </span>
        </div>

        <motion.div
          className="relative max-w-lg"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <p className="text-[13px] font-black uppercase tracking-[0.14em] text-brand-bright">The 180news desk</p>
          <h1 className="mt-3 text-[52px] leading-[1.02] font-black tracking-tight text-balance xl:text-[62px]">
            Every story, one desk.
          </h1>
          <ul className="mt-10 space-y-6">
            {deskPerks.map(({ icon: Icon, title, text }, i) => (
              <motion.li
                key={title}
                className="flex gap-4"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.1, ease: 'easeOut' }}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center bg-white/10">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span>
                  <span className="block text-[17px] font-extrabold">{title}</span>
                  <span className="mt-0.5 block text-[15px] leading-relaxed text-white/75">{text}</span>
                </span>
              </motion.li>
            ))}
          </ul>

          <div className="mt-10 border border-white/15 bg-white/5 p-4">
            <p className="text-[11px] font-black tracking-[0.1em] text-brand-bright uppercase">Full control of the news app</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {controlFeatures.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 bg-white/10 px-2.5 py-1.5 text-[13px] font-bold text-white"
                >
                  <Icon className="h-3.5 w-3.5 text-brand-bright" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[14px] leading-relaxed text-white/70">
              After sign-in you can publish your own articles, set homepage layout and ads, track analytics, and load YouTube, short videos and audio into any story.
            </p>
          </div>
        </motion.div>

        <p className="relative text-sm text-white/65">
          For 180news staff. Access is by invitation from the newsroom owner.{' '}
          <Link to="/site" className="font-bold text-white underline-offset-2 hover:underline">
            View the news app
          </Link>
        </p>
      </div>

      {/* Right sign-in column */}
      <div className="flex min-h-dvh flex-col bg-wash lg:min-h-0">
        <div className="border-b-4 border-brand bg-paper px-5 py-3 lg:hidden">
          <Logo />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">
            <h2 className="text-[30px] leading-tight font-extrabold tracking-tight text-ink">Sign in to the newsroom</h2>
            <p className="mt-1.5 text-[15.5px] text-muted">
              Use the email address the owner added under Users and roles.
            </p>

            {alertMsg && (
              <div role="alert" className="mt-5 border-l-4 border-brand bg-brand-tint px-4 py-3 text-[15px] font-semibold text-ink">
                {alertMsg}
                {status === 'error' && (
                  <button type="button" onClick={retry} className="ml-2 cursor-pointer font-bold text-navy underline">
                    Try again
                  </button>
                )}
              </div>
            )}

            <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
              <Input
                label="Email"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                placeholder="you@180news.co.za"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fields.email}
              />
              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-sm font-bold text-ink">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={show ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!fields.password}
                    aria-describedby={fields.password ? 'login-password-error' : undefined}
                    className={cn(
                      'h-11 w-full border border-line-strong bg-paper px-3.5 pr-12 text-base text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/20',
                      fields.password && 'border-brand'
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-muted hover:text-ink"
                  >
                    {show ? <EyeOff className="h-[18px] w-[18px]" aria-hidden /> : <Eye className="h-[18px] w-[18px]" aria-hidden />}
                  </button>
                </div>
                {fields.password && (
                  <p id="login-password-error" className="mt-1 text-sm font-bold text-brand" role="alert">
                    {fields.password}
                  </p>
                )}
              </div>

              <Button type="submit" loading={loading} className="w-full">
                {loading ? 'Signing in' : 'Sign in'}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-sm text-muted">
              <div className="h-px flex-1 bg-line" />
              or
              <div className="h-px flex-1 bg-line" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              icon={<GoogleGlyph />}
              onClick={() => signInWithGoogle('180news Newsroom CMS')}
            >
              Sign in with Google
            </Button>

            <div className="mt-6 border border-line bg-paper p-4 text-sm">
              <p className="font-bold text-ink">Owner desk account</p>
              <p className="mt-1 text-[13.5px] text-muted">
                Kabelo Zwelibuyile Hlongwane — full publish, layout, ads, analytics and media access.
              </p>
              <dl className="mt-2 space-y-1 text-[13.5px]">
                <div className="flex gap-2">
                  <dt className="w-20 text-muted">Owner</dt>
                  <dd className="font-bold text-ink">Kabelo Zwelibuyile Hlongwane</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 text-muted">Sign-in</dt>
                  <dd className="font-bold break-all text-ink">owner@180news.co.za</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 text-muted">Contact</dt>
                  <dd className="font-bold break-all text-ink">zweli@180news.co.za</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 text-muted">Password</dt>
                  <dd className="font-bold text-ink">newsroom180</dd>
                </div>
              </dl>
              <Button
                type="button"
                variant="navy"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setEmail('owner@180news.co.za');
                  setPassword('newsroom180');
                  setFields({});
                  setError(null);
                }}
              >
                Fill these in
              </Button>
            </div>

            <p className="mt-6 text-center text-sm text-muted lg:hidden">
              <Link to="/site" className="font-bold text-navy hover:underline">
                Open the public news app →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
