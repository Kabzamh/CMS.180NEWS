import { useId, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cx, inputClass } from './ui';

const MAX_TAGS = 5;

export function TagInput({
  value,
  onChange,
  suggestions,
  error,
  disabled,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const full = value.length >= MAX_TAGS;

  const add = (raw: string) => {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, 24);
    setDraft('');
    if (!tag || full) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const open = suggestions.filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()));

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-ink">
        Tags <span className="font-medium text-muted">(optional)</span>
      </label>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag} className="inline-flex max-w-full items-center gap-1 bg-navy-tint py-1 pr-1 pl-2.5 text-sm font-bold text-navy">
              <span className="truncate">{tag}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove tag ${tag}`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="cursor-pointer p-0.5 hover:bg-navy hover:text-white disabled:cursor-not-allowed"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        value={draft}
        list={`${id}-list`}
        disabled={disabled || full}
        placeholder={full ? 'Five tags is the limit' : 'Type a tag and press Enter'}
        aria-describedby={`${id}-help`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        className={cx(inputClass, error && 'border-brand')}
      />
      <datalist id={`${id}-list`}>
        {open.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <p id={`${id}-help`} className={cx('mt-1.5 text-[13.5px]', error ? 'font-bold text-brand' : 'text-muted')}>
        {error ?? `${value.length} of ${MAX_TAGS} used. Readers can follow a tag to related stories.`}
      </p>
    </div>
  );
}
