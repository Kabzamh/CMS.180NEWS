/** One run of text in a comparison: unchanged, added or removed. */
export interface Part {
  kind: 'same' | 'add' | 'del';
  text: string;
}

const MAX_CELLS = 9_000_000; // the most work one comparison is allowed

function push(parts: Part[], kind: Part['kind'], text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.kind === kind) last.text += text;
  else parts.push({ kind, text });
}

/** The longest run of pieces two lists share, in order, turned into what was kept, removed and added. */
function compare(a: string[], b: string[]): Part[] | null {
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) return null;
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const parts: Part[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(parts, 'same', a[i]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      push(parts, 'del', a[i]);
      i += 1;
    } else {
      push(parts, 'add', b[j]);
      j += 1;
    }
  }
  while (i < n) push(parts, 'del', a[i++]);
  while (j < m) push(parts, 'add', b[j++]);
  return parts;
}

/**
 * What changed between two texts, word by word. Very long texts that differ a great deal are compared
 * paragraph by paragraph instead.
 */
export function diffWords(before: string, after: string): Part[] {
  if (before === after) return before ? [{ kind: 'same', text: before }] : [];
  const split = (text: string, pattern: RegExp) => text.match(pattern) ?? [];
  for (const pattern of [/\s+|[^\s]+/g, /\n+|[^\n]+/g]) {
    const a = split(before, pattern);
    const b = split(after, pattern);
    // What the two share at the start and at the end needs no comparing.
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
    const middle = compare(a.slice(head, a.length - tail), b.slice(head, b.length - tail));
    if (!middle) continue;
    const parts: Part[] = [];
    push(parts, 'same', a.slice(0, head).join(''));
    for (const part of middle) push(parts, part.kind, part.text);
    push(parts, 'same', a.slice(a.length - tail).join(''));
    return parts;
  }
  return [
    { kind: 'del', text: before },
    { kind: 'add', text: after },
  ];
}

export const changed = (parts: Part[]) => parts.some((part) => part.kind !== 'same');
