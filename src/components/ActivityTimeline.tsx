import { Send, MessageSquare, CalendarClock, Users, Mail, Bell } from 'lucide-react';
import { fmtDate } from './ui';

interface TimelineEvent {
  kind: string;
  title: string;
  body: string;
  link: string;
  created_at: string;
}

const KIND_STYLE: Record<string, { icon: typeof Send; dot: string; ring: string }> = {
  publish: { icon: Send, dot: 'bg-emerald-500', ring: 'ring-emerald-100' },
  review: { icon: MessageSquare, dot: 'bg-amber-500', ring: 'ring-amber-100' },
  schedule: { icon: CalendarClock, dot: 'bg-navy', ring: 'ring-navy-tint' },
  comment: { icon: MessageSquare, dot: 'bg-brand', ring: 'ring-brand-tint' },
  mail: { icon: Mail, dot: 'bg-sky-500', ring: 'ring-sky-100' },
  team: { icon: Users, dot: 'bg-fuchsia-500', ring: 'ring-fuchsia-100' },
};

export function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return <p className="px-5 py-6 text-[15px] text-muted">No newsroom activity in this period yet.</p>;
  }
  return (
    <ol className="space-y-0 px-5 py-4">
      {events.map((e, i) => {
        const style = KIND_STYLE[e.kind] || { icon: Bell, dot: 'bg-off', ring: 'ring-wash' };
        const Icon = style.icon;
        const isLast = i === events.length - 1;
        return (
          <li key={`${e.title}-${e.created_at}-${i}`} className="relative flex gap-3 pb-5">
            {!isLast && <span className="absolute top-7 left-[13px] h-full w-px bg-line" aria-hidden />}
            <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ring-4 ${style.dot} ${style.ring}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[14.5px] font-bold text-ink">{e.title}</p>
              {e.body && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{e.body}</p>}
              <p className="mt-1 text-xs text-off">{fmtDate(e.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
