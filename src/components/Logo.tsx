import { cx } from './ui';

/** The 180° News logo, as used on the site. It is drawn for light backgrounds. */
export function Logo({ markOnly = false }: { markOnly?: boolean }) {
  const mark = (
    <picture className="shrink-0">
      <source srcSet="/logo.webp" type="image/webp" />
      <img src="/logo.png" alt="180° News" width={480} height={274} className={cx('w-auto', markOnly ? 'h-9' : 'h-12')} />
    </picture>
  );
  if (markOnly) return mark;
  return (
    <span className="inline-flex items-center gap-3">
      {mark}
      <span className="border-l border-line-strong pl-3 text-[11px] leading-[1.35] font-black tracking-[0.14em] whitespace-nowrap text-muted uppercase">
        Newsroom
        <br />
        CMS
      </span>
    </span>
  );
}
