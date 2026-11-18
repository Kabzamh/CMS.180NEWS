import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-navy">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-ink md:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('overflow-hidden rounded-none border border-line bg-paper shadow-sm', className)}>
      {children}
    </section>
  );
}

export function CardHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-4">
      <h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'navy' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}) {
  const base =
    'inline-flex cursor-pointer items-center justify-center gap-2 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-[15px]', lg: 'h-12 px-5 text-base' };
  const variants = {
    primary: 'bg-brand text-white hover:bg-brand-strong',
    navy: 'bg-navy text-white hover:bg-navy-deep',
    outline: 'border border-line-strong bg-paper text-ink hover:bg-wash',
    ghost: 'text-body hover:bg-wash hover:text-ink',
    danger: 'bg-brand-tint text-brand hover:bg-brand hover:text-white',
  };
  return (
    <button
      className={cn(base, sizes[size], variants[variant], className)}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Input({
  label,
  error,
  hint,
  optional,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1.5 flex items-baseline gap-2 text-sm font-bold text-ink">
          {label}
          {optional && <span className="font-medium text-muted">Optional</span>}
        </span>
      )}
      <input
        className={cn(
          'h-11 w-full border border-line-strong bg-paper px-3.5 text-base text-ink outline-none placeholder:text-off focus:border-navy focus:ring-2 focus:ring-navy/20 disabled:bg-wash disabled:text-muted',
          error && 'border-brand',
          className
        )}
        {...props}
      />
      {error && <span className="mt-1 block text-sm font-bold text-brand">{error}</span>}
      {hint && !error && <span className="mt-1 block text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  error,
  hint,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-bold text-ink">{label}</span>}
      <textarea
        className={cn(
          'w-full border border-line-strong bg-paper px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-off focus:border-navy focus:ring-2 focus:ring-navy/20 disabled:bg-wash',
          error && 'border-brand',
          className
        )}
        {...props}
      />
      {error && <span className="mt-1 block text-sm font-bold text-brand">{error}</span>}
      {hint && !error && <span className="mt-1 block text-[13px] text-muted">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  error,
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-bold text-ink">{label}</span>}
      <select
        className={cn(
          'h-11 w-full border border-line-strong bg-paper px-3 text-base text-ink outline-none focus:border-navy focus:ring-2 focus:ring-navy/20',
          error && 'border-brand',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-sm font-bold text-brand">{error}</span>}
    </label>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <p className="font-bold text-ink">{label}</p>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-navy' : 'bg-line-strong'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </button>
    </div>
  );
}

export function Badge({ children, tone = 'ink' }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    ink: 'bg-ink text-white',
    navy: 'bg-navy text-white',
    brand: 'bg-brand text-white',
    wash: 'bg-wash text-body',
    draft: 'bg-wash text-muted',
    review: 'bg-navy-tint text-navy',
    scheduled: 'bg-navy-tint text-navy',
    published: 'bg-emerald-100 text-emerald-800',
    hidden: 'bg-brand-tint text-brand',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-bold uppercase tracking-wide', tones[tone] || tones.ink)}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 px-5 py-12 text-muted">
      <Loader2 className="h-5 w-5 animate-spin text-navy" />
      <span className="font-medium">{label}…</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="border border-brand/30 bg-brand-tint px-5 py-4 text-brand">
      <p className="font-bold">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 cursor-pointer text-sm font-bold underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      {icon && <div className="mb-3 text-off">{icon}</div>}
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Toast({ message, tone = 'ok' }: { message: string; tone?: 'ok' | 'error' }) {
  return (
    <div
      className={cn(
        'fixed right-4 bottom-4 z-50 max-w-sm border px-4 py-3 text-[15px] font-bold shadow-lg',
        tone === 'ok' ? 'border-navy/20 bg-navy text-white' : 'border-brand bg-brand text-white'
      )}
      role="status"
    >
      {message}
    </div>
  );
}

export function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtNum(n: number) {
  return n.toLocaleString('en-ZA');
}
