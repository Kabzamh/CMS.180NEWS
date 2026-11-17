import { useRef, useState } from 'react';
import { ImagePlus, Images, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { uploadImage } from '../lib/image';
import { mediaKind } from '../lib/clips';
import type { MediaItem } from '../lib/types';
import { useLoad } from '../hooks/useLoad';
import { Button, Dialog, EmptyState, ErrorState, Spinner, cx } from './ui';

function LibraryDialog({ onPick, onClose }: { onPick: (item: MediaItem) => void; onClose: () => void }) {
  const media = useLoad(() => api<MediaItem[]>('/api/media'), []);
  const images = (media.data ?? []).filter((item) => mediaKind(item.content_type) === 'image');
  return (
    <Dialog open onClose={onClose} title="Choose from the media library" wide>
      {media.loading ? (
        <Spinner label="Loading images" />
      ) : media.error ? (
        <ErrorState message={media.error} onRetry={() => media.reload()} />
      ) : !images.length ? (
        <EmptyState icon={<Images className="h-8 w-8" aria-hidden="true" />} title="No images in the library yet">
          Upload an image instead and it will be kept here for next time.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPick(item)}
                className="group block w-full cursor-pointer border border-line bg-paper text-left hover:border-navy"
              >
                <img src={item.url} alt={item.alt || item.file_name} loading="lazy" className="aspect-[4/3] w-full bg-wash object-cover" />
                <span className="block truncate px-2.5 py-2 text-[13px] font-semibold text-body group-hover:text-navy">{item.file_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function ImagePicker({
  label,
  hint,
  value,
  onChange,
  error,
  disabled,
  contain,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null, item?: MediaItem) => void;
  error?: string;
  disabled?: boolean;
  contain?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const shown = problem ?? error;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setUploading(true);
    try {
      const item = await uploadImage(file);
      onChange(item.url, item);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-bold text-ink">{label}</p>
      {value ? (
        <div className={cx('border border-line bg-wash', contain && 'flex items-center justify-center p-3')}>
          <img src={value} alt="" className={contain ? 'max-h-32 w-auto max-w-full object-contain' : 'aspect-[16/9] w-full object-cover'} />
        </div>
      ) : (
        <div className="flex aspect-[16/7] items-center justify-center border border-dashed border-line-strong bg-wash text-sm font-semibold text-muted">
          No image yet
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          loading={uploading}
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          icon={<ImagePlus className="h-4 w-4" aria-hidden="true" />}
        >
          {uploading ? 'Uploading' : value ? 'Replace' : 'Upload image'}
        </Button>
        <Button variant="outline" size="sm" disabled={disabled || uploading} onClick={() => setLibraryOpen(true)} icon={<Images className="h-4 w-4" aria-hidden="true" />}>
          From library
        </Button>
        {value && (
          <Button variant="ghost" size="sm" disabled={disabled || uploading} onClick={() => onChange(null)} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}>
            Remove
          </Button>
        )}
      </div>
      {shown ? (
        <p role="alert" className="mt-1.5 text-[13.5px] font-bold text-brand">
          {shown}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13.5px] leading-snug text-muted">{hint}</p>
      ) : null}
      {libraryOpen && (
        <LibraryDialog
          onClose={() => setLibraryOpen(false)}
          onPick={(item) => {
            setProblem(null);
            onChange(item.url, item);
            setLibraryOpen(false);
          }}
        />
      )}
    </div>
  );
}
