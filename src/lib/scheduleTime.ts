// Browser-local schedule input handling. This is UI validation, NOT authorization
// or a replacement for server-side timezone, future-time and permission checks.
export type LocalScheduleResult = { ok: true; iso: string } | { ok: false; error: string };

export function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your device time zone'; }
  catch { return 'your device time zone'; }
}

/** Reject invalid, nonexistent and ambiguous local minute values, then convert to UTC. */
export function parseFutureLocalTime(value: string, nowMs = Date.now()): LocalScheduleResult {
  if (!value) return { ok: false, error: 'Pick a date and time to schedule.' };
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { ok: false, error: 'Enter a valid date and time.' };
  const [, y, mo, d, h, mi] = match;
  const year=Number(y), month=Number(mo), day=Number(d), hour=Number(h), minute=Number(mi);
  if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59)
    return { ok: false, error: 'Enter a valid date and time.' };
  const utc=Date.UTC(year,month-1,day,hour,minute);
  const normalized=new Date(utc);
  if (normalized.getUTCFullYear()!==year || normalized.getUTCMonth()!==month-1 || normalized.getUTCDate()!==day)
    return { ok: false, error: 'Enter a valid date and time.' };

  // Sample nearby offsets, then independently round-trip every candidate. This
  // catches ordinary DST gaps, folds and half-hour transitions without silently
  // choosing one occurrence. Historical or unusual timezone rules need further
  // integration testing; the server remains authoritative.
  const offsets=new Set<number>();
  for (let hours=-48; hours<=48; hours++) offsets.add(new Date(utc+hours*3600000).getTimezoneOffset());
  const matches:number[]=[];
  for (const offset of offsets) {
    const instant=utc+offset*60000, local=new Date(instant);
    if (local.getFullYear()===year && local.getMonth()===month-1 && local.getDate()===day && local.getHours()===hour && local.getMinutes()===minute)
      matches.push(instant);
  }
  if (matches.length===0) return { ok: false, error: 'That local time does not exist in your device time zone. Choose another time.' };
  if (matches.length>1) return { ok: false, error: 'That local time occurs twice in your device time zone. Choose a different time.' };
  if (matches[0]<=nowMs) return { ok: false, error: 'Choose a publication time in the future.' };
  return { ok: true, iso: new Date(matches[0]).toISOString() };
}
