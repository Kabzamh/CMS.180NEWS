import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, CircleCheck, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { ArticleStatus } from '../lib/types';
import { STATUS_LABEL } from '../lib/format';

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ buttons */

type Variant = 'primary' | 'navy' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong',
  navy: 'bg-navy text-white hover:bg-navy-deep',
  outline: 'border border-line-strong bg-paper text-ink hover:border-ink',
  ghost: 'text-body hover:bg-wash hover:text-ink',
  danger: 'border border-brand bg-paper text-brand hover:bg-brand-tint',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-[15px]',
  sm: 'h-9 px-3 text-sm',
};

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra?: string) =>
  cx(
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, type, ...rest }: ButtonProps) {
  return (
    <button type={type ?? 'button'} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  tone = 'default',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center border border-line-strong bg-paper transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        tone === 'danger' ? 'text-brand hover:border-brand hover:bg-brand-tint' : 'text-body hover:border-ink hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- fields */

export const inputClass =
  'h-11 w-full min-w-0 border border-line-strong bg-paper px-3.5 text-[15px] text-ink placeholder:text-muted focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:bg-wash disabled:text-muted';

interface FieldBase {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  wrapClass?: string;
}

function FieldShell({ id, label, error, hint, optional, wrapClass, children }: FieldBase & { id: string; children: ReactNode }) {
  return (
    <div className={wrapClass}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-ink">
        {label}
        {optional && <span className="font-medium text-muted"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13.5px] font-bold text-brand">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13.5px] leading-snug text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function TextInput({ label, error, hint, optional, wrapClass, id, className, ...rest }: FieldBase & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} error={error} hint={hint} optional={optional} wrapClass={wrapClass}>
      <input
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, hint)}
        className={cx(inputClass, error && 'border-brand', className)}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextArea({ label, error, hint, optional, wrapClass, id, className, ...rest }: FieldBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} error={error} hint={hint} optional={optional} wrapClass={wrapClass}>
      <textarea
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, hint)}
        className={cx(inputClass, 'h-auto py-2.5 leading-relaxed', error && 'border-brand', className)}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectInput({ label, error, hint, optional, wrapClass, id, className, children, ...rest }: FieldBase & SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell id={fid} label={label} error={error} hint={hint} optional={optional} wrapClass={wrapClass}>
      <select
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, hint)}
        className={cx(inputClass, 'cursor-pointer pr-8', error && 'border-brand', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <span id={id} className="block text-[15px] font-bold text-ink">
          {label}
        </span>
        {description && <span className="mt-0.5 block text-sm leading-snug text-muted">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-55',
          checked ? 'bg-live-deep' : 'bg-off',
        )}
      >
        <span className={cx('absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}

/** A bare switch for rows that already have their own visible text. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'bg-live-deep' : 'bg-off',
      )}
    >
      <span className={cx('absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

/* ------------------------------------------------------------------ display */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('border border-line bg-paper', className)}>{children}</section>;
}

export function CardHead({ title, note, action }: { title: string; note?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-black uppercase tracking-[0.06em] text-navy">{title}</h2>
        {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b-2 border-ink pb-5">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className="text-[13px] font-black uppercase tracking-[0.1em] text-brand">{eyebrow}</p>}
        <h1 className="mt-1 text-[28px] font-extrabold leading-[1.1] tracking-tight text-ink sm:text-[34px]">{title}</h1>
        {description && <p className="mt-2 text-[15.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const STATUS_STYLE: Record<ArticleStatus, string> = {
  published: 'bg-live-tint text-live-deep',
  scheduled: 'bg-navy-tint text-navy',
  review: 'bg-warn-tint text-warn-deep',
  draft: 'bg-wash text-body ring-1 ring-inset ring-line-strong',
  hidden: 'bg-brand-tint text-brand',
};

/** Solid colour for each status: dots, rules and chart segments. Matches the badges above. */
export const STATUS_DOT: Record<ArticleStatus, string> = {
  published: 'bg-live-deep',
  scheduled: 'bg-navy',
  review: 'bg-warn',
  draft: 'bg-off',
  hidden: 'bg-brand',
};

export function StatusBadge({ status }: { status: ArticleStatus }) {
  return <Pill className={STATUS_STYLE[status]}>{STATUS_LABEL[status]}</Pill>;
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-6 shrink-0 items-center whitespace-nowrap px-2 text-[12px] font-extrabold uppercase tracking-[0.04em]', className)}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2.5 py-14 text-[15px] font-semibold text-muted">
      <LoaderCircle className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse bg-line/70', className)} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-line border border-line bg-paper">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 p-4">
          <Skeleton className="h-16 w-24 shrink-0" />
          <div className="flex-1 space-y-2.5 py-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** What the database says when a table or column this CMS needs is missing. */
const TABLES_DO_NOT_FIT = /does not exist|schema cache/i;

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 border border-brand/40 bg-brand-tint p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <p className="font-extrabold text-ink">That did not load</p>
          <p className="text-[15px] text-body">{message}</p>
          {TABLES_DO_NOT_FIT.test(message) && (
            <p className="mt-1 text-[15px] text-body">
              The database tables do not match this CMS. The owner can get the script that fixes them under{' '}
              <Link to="/settings" className="font-bold text-navy underline">
                Settings, Database tables
              </Link>
              .
            </p>
          )}
        </div>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center border border-dashed border-line-strong bg-paper px-6 py-12 text-center">
      {icon && <div className="mb-3 text-navy">{icon}</div>}
      <p className="text-lg font-extrabold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-md text-[15px] leading-relaxed text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ dialogs */

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/70 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={cx('flex max-h-[92dvh] w-full flex-col border-t-4 border-brand bg-paper shadow-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 id={id} className="min-w-0 text-lg font-extrabold text-ink">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose} className="border-transparent">
            <X className="h-5 w-5" aria-hidden="true" />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-wash px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Keep it',
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[15.5px] leading-relaxed text-body">{children}</div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------- toasts */

type ToastKind = 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6500 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-6 sm:w-[380px]">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex items-start gap-3 border-l-4 bg-ink px-4 py-3 text-[15px] font-semibold text-white shadow-xl',
              t.kind === 'error' ? 'border-warn' : 'border-live',
            )}
          >
            {t.kind === 'error' ? (
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
            ) : (
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-live" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}
              className="-mr-1 cursor-pointer p-0.5 text-white/70 hover:text-white focus-visible:outline-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
