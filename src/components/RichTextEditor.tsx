import { useEffect, useRef } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Highlighter, Heading2, Heading3,
  List, ListOrdered, Quote, Link as LinkIcon, Link2Off, Eraser, Undo2, Redo2,
} from 'lucide-react';
import { cn } from './ui';

const HIGHLIGHT_COLOR = '#fde68a';

/**
 * Writing-tools editor for story bodies. Content is kept as HTML so the
 * public site renders the same formatting readers see on the desk.
 *
 * Highlighting is a true toggle: click it again on already-highlighted
 * text and the highlight is removed, rather than stacking or being stuck
 * on (the previous bug). Undo/redo run on their own history stack — not
 * the browser's native, execCommand-dependent undo, which was unreliable
 * for the highlight tool — so every action here, including highlighting,
 * can always be undone and redone from the toolbar or Ctrl+Z / Ctrl+Y.
 */
export function RichTextEditor({
  label,
  value,
  onChange,
  hint,
  minHeight = 360,
}: {
  label?: string;
  value: string;
  onChange: (html: string) => void;
  hint?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef(value);
  const historyRef = useRef<string[]>([value || '']);
  const historyIndexRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  // Paint whatever body HTML the article already has into the editor as
  // soon as it mounts (e.g. opening an existing story to edit it) — not
  // just on later prop changes, otherwise the frame renders empty even
  // though `value` already holds the saved text.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = value || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ref.current && value !== lastValue.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value;
    }
  }, [value]);

  const emit = (html: string) => {
    lastValue.current = html;
    onChange(html);
  };

  const recordHistory = (html: string) => {
    const atEnd = historyIndexRef.current === historyRef.current.length - 1;
    if (atEnd && historyRef.current[historyIndexRef.current] === html) return;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(html);
    historyIndexRef.current = historyRef.current.length - 1;
  };

  /** Toolbar actions and the highlight toggle call this immediately. */
  const commit = () => {
    if (!ref.current) return;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const html = ref.current.innerHTML;
    emit(html);
    recordHistory(html);
  };

  /** Typing debounces so undo steps through words, not every keystroke. */
  const commitDebounced = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    emit(html);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => recordHistory(html), 500);
  };

  const applyHistory = (index: number) => {
    const html = historyRef.current[index];
    if (html === undefined || !ref.current) return;
    historyIndexRef.current = index;
    ref.current.innerHTML = html;
    emit(html);
  };

  const undo = () => {
    if (historyIndexRef.current <= 0) return;
    applyHistory(historyIndexRef.current - 1);
  };

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    applyHistory(historyIndexRef.current + 1);
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    commit();
  };

  const unwrapElement = (el: HTMLElement) => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  };

  /** True toggle: removes highlight(s) under the selection if any exist,
   *  otherwise wraps the selection in a new highlight — so highlighting is
   *  always reversible with the same button, not just via undo. */
  const toggleHighlight = () => {
    const editor = ref.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    const marks = Array.from(editor.querySelectorAll('mark'));
    const intersecting = marks.filter((m) => range.intersectsNode(m));

    if (intersecting.length > 0) {
      intersecting.forEach(unwrapElement);
    } else {
      const mark = document.createElement('mark');
      mark.style.backgroundColor = HIGHLIGHT_COLOR;
      const contents = range.extractContents();
      mark.appendChild(contents);
      range.insertNode(mark);
      const after = document.createRange();
      after.selectNodeContents(mark);
      sel.removeAllRanges();
      sel.addRange(after);
    }
    editor.normalize();
    commit();
  };

  const clearFormatting = () => {
    const editor = ref.current;
    const sel = window.getSelection();
    editor?.focus();
    document.execCommand('removeFormat', false);
    if (editor && sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      Array.from(editor.querySelectorAll('mark'))
        .filter((m) => range.intersectsNode(m))
        .forEach(unwrapElement);
      editor.normalize();
    }
    commit();
  };

  const addLink = () => {
    const url = window.prompt('Link URL');
    if (!url) return;
    exec('createLink', url);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      redo();
    }
  };

  const ToolButton = ({
    onClick,
    label: title,
    children,
  }: {
    onClick: () => void;
    label: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-none text-ink hover:bg-navy-tint"
      aria-label={title}
      title={title}
    >
      {children}
    </button>
  );

  return (
    <div>
      {label && <span className="mb-1.5 block text-sm font-bold text-ink">{label}</span>}
      <div className="border border-line-strong bg-paper focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/20">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-wash px-2 py-1.5">
          <ToolButton onClick={undo} label="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={redo} label="Redo (Ctrl+Y)"><Redo2 className="h-4 w-4" /></ToolButton>
          <span className="mx-1 h-5 w-px bg-line-strong" />
          <ToolButton onClick={() => exec('bold')} label="Bold"><Bold className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={() => exec('italic')} label="Italic"><Italic className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={() => exec('underline')} label="Underline"><Underline className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={() => exec('strikeThrough')} label="Strikethrough"><Strikethrough className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={toggleHighlight} label="Highlight (click again to remove)"><Highlighter className="h-4 w-4" /></ToolButton>
          <span className="mx-1 h-5 w-px bg-line-strong" />
          <ToolButton onClick={() => exec('formatBlock', 'h2')} label="Heading"><Heading2 className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={() => exec('formatBlock', 'h3')} label="Subheading"><Heading3 className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={() => exec('formatBlock', 'blockquote')} label="Quote"><Quote className="h-4 w-4" /></ToolButton>
          <span className="mx-1 h-5 w-px bg-line-strong" />
          <ToolButton onClick={() => exec('insertUnorderedList')} label="Bullet list"><List className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={() => exec('insertOrderedList')} label="Numbered list"><ListOrdered className="h-4 w-4" /></ToolButton>
          <span className="mx-1 h-5 w-px bg-line-strong" />
          <ToolButton onClick={addLink} label="Add link"><LinkIcon className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={() => exec('unlink')} label="Remove link"><Link2Off className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={clearFormatting} label="Clear formatting"><Eraser className="h-4 w-4" /></ToolButton>
          <span className="ml-2 hidden text-xs text-muted sm:inline">Select text, then pick a tool. Highlight toggles on and off.</span>
        </div>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={commitDebounced}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full overflow-y-auto px-3.5 py-3 text-base leading-relaxed text-ink outline-none',
            '[&_mark]:bg-amber-200 [&_mark]:px-0.5',
            '[&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:my-2',
            '[&_h3]:text-lg [&_h3]:font-bold [&_h3]:my-2',
            '[&_blockquote]:border-l-4 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_blockquote]:italic',
            '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
            '[&_a]:text-navy [&_a]:underline'
          )}
          style={{ minHeight }}
          data-placeholder="Write the full story. Use the toolbar to format text."
        />
      </div>
      {hint && <span className="mt-1 block text-[13px] text-muted">{hint}</span>}
    </div>
  );
}
