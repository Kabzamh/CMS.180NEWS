import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Maximize, Minimize, Monitor, RotateCw } from 'lucide-react';
import { useMember } from '../contexts/AuthContext';
import { isHandheld } from '../lib/device';
import { LIVE_SITES } from '../lib/format';
import { canEdit } from '../lib/types';
import { Button, Card, PageHeader, buttonClass, cx, useToast } from '../components/ui';

const VIEW_WIDTH = 1280; // the site is always shown as it looks on a computer screen at least this wide
const CHECK_MS = 4000; // how often the CMS is asked whether anything published has changed
const WIDE = '(min-width: 1024px)';
const SITE_KEY = '180news-cms:live-site';
const clock = (time: Date) => time.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

type Reply = { type?: unknown; version?: unknown; path?: unknown } | null;

function useWideWindow() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/**
 * The site in a frame, kept up to date. The CMS is asked every few seconds whether anything published has
 * changed; when it has, the site in the frame is told to fetch it at once. A site that takes its content
 * from this CMS answers through its connector (/connect.js); one that does not is shown as it is.
 */
function Screen() {
  const member = useMember();
  const toast = useToast();
  const [site, setSite] = useState(() => {
    try {
      const saved = localStorage.getItem(SITE_KEY);
      return LIVE_SITES.find((s) => s.url === saved)?.url ?? LIVE_SITES[0].url;
    } catch {
      return LIVE_SITES[0].url;
    }
  });
  const [round, setRound] = useState(0); // goes up to load the frame afresh
  const [startAt, setStartAt] = useState('/'); // the page the frame is loaded at
  const [path, setPath] = useState('/'); // the page the frame is on now, as far as the site has said
  const [link, setLink] = useState<'waiting' | 'live' | 'silent'>('waiting');
  const [updating, setUpdating] = useState(false);
  const [shownAt, setShownAt] = useState<Date | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [room, setRoom] = useState(480); // the height left for the frame, so the CMS page itself does not scroll
  const [full, setFull] = useState(false);

  const frame = useRef<HTMLIFrameElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const version = useRef(''); // what is published now, as last heard from the CMS
  const showing = useRef<string | null>(null); // what the site in the frame last said it is showing
  const now = useRef({ link, updating });
  now.current = { link, updating };
  const greeting = useRef<number | undefined>(undefined);
  const patience = useRef<number | undefined>(undefined);

  const post = useCallback(
    (message: { type: string; version?: string }) => {
      // Delivered only if the page in the frame is the site itself.
      frame.current?.contentWindow?.postMessage(message, site);
    },
    [site],
  );

  /** Greets the page in the frame until it answers. A site that takes its content from this CMS answers at once. */
  const greet = useCallback(() => {
    window.clearInterval(greeting.current);
    setLink('waiting');
    let tries = 0;
    const hello = () => {
      tries += 1;
      post({ type: 'newsroom-cms:hello' });
      if (tries >= 12) {
        window.clearInterval(greeting.current);
        setLink((was) => (was === 'waiting' ? 'silent' : was));
      }
    };
    greeting.current = window.setInterval(hello, 750);
    hello();
  }, [post]);

  /** Asks the page in the frame to fetch what is published now and redraw. */
  const refresh = useCallback(
    (announce: boolean) => {
      if (announce) setUpdating(true);
      post({ type: 'newsroom-cms:refresh', version: version.current });
      window.clearTimeout(patience.current);
      // No answer: the frame may have been taken to another page. Greet it again and carry on.
      patience.current = window.setTimeout(() => {
        setUpdating(false);
        greet();
      }, 20000);
    },
    [post, greet],
  );

  // A new frame: nothing is known about it until it has loaded and answered.
  useEffect(() => {
    setLink('waiting');
    setUpdating(false);
    showing.current = null;
    const giveUp = window.setTimeout(() => setLink((was) => (was === 'waiting' ? 'silent' : was)), 25000);
    return () => {
      window.clearTimeout(giveUp);
      window.clearInterval(greeting.current);
      window.clearTimeout(patience.current);
    };
  }, [site, round]);

  // What the site in the frame says back.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== site || event.source !== frame.current?.contentWindow) return;
      const data = event.data as Reply;
      if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
      if (typeof data.path === 'string' && /^\/\S{0,400}$/.test(data.path)) setPath(data.path);
      if (typeof data.version === 'string') showing.current = data.version;
      if (data.type === 'newsroom-cms:here') {
        window.clearInterval(greeting.current);
        setLink('live');
        // The page may have loaded a moment before something was published: make sure it shows what is published now.
        if (version.current && showing.current !== version.current) refresh(false);
      } else if (data.type === 'newsroom-cms:refreshed') {
        window.clearTimeout(patience.current);
        if (now.current.updating) setShownAt(new Date());
        setUpdating(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [site, refresh]);

  // Every few seconds, while this window is in view: has anything published changed?
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        // "t" changes every few seconds, so the answer is never a stored copy.
        const res = await fetch(`/api/public?resource=site&v=${encodeURIComponent(version.current)}&t=${Math.floor(Date.now() / CHECK_MS)}`);
        if (!res.ok) throw new Error(String(res.status));
        const feed = (await res.json()) as { version?: unknown };
        if (stopped) return;
        setUnreachable(false);
        if (typeof feed.version !== 'string' || feed.version === version.current) return;
        const first = version.current === '';
        version.current = feed.version;
        if (now.current.link !== 'live') return; // a frame that answers later is brought up to date when it does
        // The first answer is what was already published when this screen was opened: no announcement for that.
        if (!first) refresh(true);
        else if (showing.current !== feed.version) refresh(false);
      } catch {
        if (!stopped) setUnreachable(true);
      }
    };
    check();
    const timer = window.setInterval(check, CHECK_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [refresh]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The frame takes the height that is left under the bar, down to the bottom of the window.
  useLayoutEffect(() => {
    const measure = () => {
      const el = stage.current;
      if (!el || document.fullscreenElement) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setRoom(Math.max(260, Math.floor(window.innerHeight - top - 38)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [link, updating, unreachable, full, shownAt]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === shell.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.current?.requestFullscreen();
    } catch {
      toast('This browser did not allow full screen here. Open the CMS in its own tab and try again.', 'error');
    }
  };

  const reload = () => {
    setStartAt(path); // comes back on the page it was on
    setRound((n) => n + 1);
  };

  const choose = (url: string) => {
    try {
      localStorage.setItem(SITE_KEY, url);
    } catch {
      /* the choice just is not remembered */
    }
    setStartAt('/');
    setPath('/');
    setShownAt(null);
    setSite(url);
  };

  // Narrower than a computer screen, the frame is drawn at full width and scaled down to fit, so the
  // site always shows its computer layout.
  const width = Math.max(VIEW_WIDTH, size.w);
  const scale = size.w ? Math.min(1, size.w / width) : 1;
  const name = LIVE_SITES.find((s) => s.url === site)?.name ?? site;

  return (
    <div ref={shell} className={cx('@container flex flex-col bg-paper', full ? 'h-screen w-screen' : 'border border-line')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-wash px-3 py-2">
        <span
          className={cx(
            'inline-flex h-7 shrink-0 items-center gap-2 px-2.5 text-[12px] font-extrabold tracking-[0.05em] uppercase',
            link === 'live' ? 'bg-live-tint text-live-deep' : link === 'silent' ? 'bg-warn-tint text-warn-deep' : 'bg-paper text-body ring-1 ring-line-strong ring-inset',
          )}
        >
          <span aria-hidden="true" className="relative flex h-2.5 w-2.5">
            {link === 'live' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60 motion-reduce:hidden" />}
            <span className={cx('relative inline-flex h-2.5 w-2.5 rounded-full', link === 'live' ? 'bg-live-deep' : link === 'silent' ? 'bg-warn' : 'bg-off')} />
          </span>
          {link === 'live' ? 'Live' : link === 'silent' ? 'Not connected' : 'Loading'}
        </span>
        <label htmlFor="live-site" className="sr-only">
          Address shown
        </label>
        <select
          id="live-site"
          value={site}
          onChange={(e) => choose(e.target.value)}
          className="h-9 max-w-full cursor-pointer border border-line-strong bg-paper px-2.5 text-sm font-bold text-ink focus:border-navy focus:ring-2 focus:ring-navy/20 focus:outline-none"
        >
          {LIVE_SITES.map((s) => (
            <option key={s.url} value={s.url}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="min-w-0 flex-1 basis-24 truncate font-mono text-[13px] text-muted" title={`${name}${path}`}>
          {path}
        </span>
        {scale < 1 && <span className="shrink-0 text-[13px] text-muted tabular-nums">Shown at {Math.round(scale * 100)}%</span>}
        {/* Where the bar is short of room, these two are shown by their icons alone. */}
        <Button variant="outline" size="sm" onClick={reload} aria-label="Reload" title="Reload" icon={<RotateCw className="h-4 w-4" aria-hidden="true" />}>
          <span className="hidden @5xl:inline">Reload</span>
        </Button>
        <a href={`${site}${path}`} target="_blank" rel="noreferrer" aria-label="Open in a new tab" title="Open in a new tab" className={buttonClass('outline', 'sm')}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          <span className="hidden @5xl:inline">Open in a new tab</span>
        </a>
        <Button variant="navy" size="sm" onClick={toggleFull} icon={full ? <Minimize className="h-4 w-4" aria-hidden="true" /> : <Maximize className="h-4 w-4" aria-hidden="true" />}>
          {full ? 'Leave full screen' : 'Full screen'}
        </Button>
      </div>

      <p role="status" className={cx('border-b border-line px-4 py-2 text-[14.5px] leading-snug', link === 'silent' ? 'border-l-4 border-l-warn bg-warn-tint text-ink' : 'text-body')}>
        {link === 'waiting' ? (
          'Loading the site…'
        ) : link === 'silent' ? (
          <>
            <span className="font-extrabold">This address did not answer this CMS.</span> It is not connected to it, or its connector is an older one, so what is published here will not show up in this view. You are seeing the site as it
            is for readers now.{' '}
            {canEdit(member) && (
              <Link to="/settings" className="font-bold text-navy underline">
                Connect the site
              </Link>
            )}
          </>
        ) : updating ? (
          <span className="font-bold text-ink">Something was just published. Updating the view…</span>
        ) : (
          <>
            <span className="font-bold text-ink">Live.</span> Anything published in this CMS shows here within a few seconds.
            {shownAt && (
              <>
                {' '}
                Last change shown at <time dateTime={shownAt.toISOString()}>{clock(shownAt)}</time>.
              </>
            )}
          </>
        )}
        {unreachable && <span className="font-bold text-brand"> The CMS could not be asked for changes just now. Trying again.</span>}
      </p>

      <div ref={stage} className={cx('relative overflow-hidden bg-wash', full && 'min-h-0 flex-1')} style={full ? undefined : { height: room }}>
        {size.w > 0 && (
          <iframe
            key={`${site}|${round}`}
            ref={frame}
            title={`The 180news site at ${name}, live`}
            src={`${site}${startAt}`}
            onLoad={greet}
            // The site runs as it does for a reader, but cannot take this window somewhere else.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            allow="fullscreen; autoplay; picture-in-picture; encrypted-media"
            referrerPolicy="origin"
            className="absolute top-0 left-0 border-0 bg-paper"
            style={{ width, height: Math.round(size.h / scale), transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: '0 0' }}
          />
        )}
      </div>
    </div>
  );
}

export default function Live() {
  const wide = useWideWindow();
  const [handheld] = useState(isHandheld);

  useEffect(() => {
    document.title = 'Live view · 180news Newsroom CMS';
  }, []);

  return (
    <>
      <PageHeader eyebrow="Site" title="Live view" description="The 180news site as readers see it on a computer, updating as the newsroom publishes." />
      {handheld || !wide ? (
        // Nothing of the site is loaded here: Live view is for computers.
        <Card className="px-6 py-12 text-center">
          <Monitor className="mx-auto h-9 w-9 text-navy" aria-hidden="true" />
          <p className="mt-2.5 text-lg font-extrabold text-ink">{handheld ? 'Live view is for computers' : 'This window is too narrow for Live view'}</p>
          <p className="mx-auto mt-1 max-w-md text-[15px] leading-relaxed text-muted">
            {handheld
              ? 'It is not available on phones and tablets. Open the CMS on a computer to watch the site update as you publish.'
              : 'Make the window wider, to at least 1024 pixels, and the site appears here.'}
          </p>
        </Card>
      ) : (
        <Screen />
      )}
    </>
  );
}
