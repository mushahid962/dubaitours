'use client';

import { useActionState } from 'react';
import Image from 'next/image';
import { Loader2, Upload, Star, Trash2 } from 'lucide-react';
import {
  uploadTourMediaAction, saveAltTextAction, setCoverAction, deleteMediaAction, type MediaState,
} from '@/actions/media';
import type { Locale } from '@/lib/i18n/config';

type Photo = { mediaId: string; url: string; isCover: boolean; altText: string };

export function MediaPanel({
  tourId, companyId, locale, photos,
}: { tourId: string; companyId: string; locale: Locale; photos: Photo[] }) {
  const [uploadState, upload, isUploading] = useActionState<MediaState, FormData>(
    uploadTourMediaAction, { status: 'idle' },
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={upload} className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-6">
        <input type="hidden" name="tourId" value={tourId} />
        <input type="hidden" name="companyId" value={companyId} />

        <div className="flex flex-col gap-1">
          <h3 className="text-[var(--text-lg)] font-semibold">Photos</h3>
          <p className="text-[var(--text-sm)] text-[var(--ink-soft)]">
            Your own photos, not stock. Travellers spot stock imagery instantly and it is the most
            common reason we send a listing back. Landscape, at least 1200px wide, under 10 MB.
          </p>
        </div>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--hairline)] p-8 text-center hover:border-[var(--teal)]">
          <Upload className="h-6 w-6 text-[var(--ink-faint)]" aria-hidden />
          <span className="text-[var(--text-sm)] font-medium">Choose photos</span>
          <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">JPEG, PNG, WebP or AVIF · up to 12 at once</span>
          <input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" />
        </label>

        {uploadState.status === 'error' && (
          <p role="alert" className="text-[var(--text-sm)] text-[var(--pomegranate)]">{uploadState.message}</p>
        )}
        {uploadState.status === 'done' && (
          <p role="status" className="text-[var(--text-sm)] text-[var(--teal)]">{uploadState.message}</p>
        )}

        <button type="submit" disabled={isUploading}
          className="flex h-11 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--teal)] px-6 font-semibold text-white disabled:opacity-60">
          {isUploading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Upload
        </button>
      </form>

      {photos.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {photos.map((photo) => (
            <li key={photo.mediaId}>
              <PhotoCard tourId={tourId} locale={locale} photo={photo} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PhotoCard({ tourId, locale, photo }: { tourId: string; locale: Locale; photo: Photo }) {
  const [altState, saveAlt, savingAlt] = useActionState<MediaState, FormData>(
    saveAltTextAction, { status: 'idle' },
  );
  const [, setCover, settingCover] = useActionState<MediaState, FormData>(setCoverAction, { status: 'idle' });
  const [, remove, removing] = useActionState<MediaState, FormData>(deleteMediaAction, { status: 'idle' });

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--paper)] p-4">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] bg-[var(--limestone)]">
        <Image src={photo.url} alt={photo.altText || 'Uploaded photo awaiting a description'}
          fill sizes="(max-width: 640px) 92vw, 45vw" className="object-cover" />
        {photo.isCover && (
          <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--brass-wash)] px-2.5 py-1 text-[var(--text-xs)] font-semibold text-[var(--brass)]">
            <Star className="h-3 w-3 fill-current" aria-hidden /> Cover
          </span>
        )}
      </div>

      <form action={saveAlt} className="flex flex-col gap-1.5">
        <input type="hidden" name="tourId" value={tourId} />
        <input type="hidden" name="mediaId" value={photo.mediaId} />
        <input type="hidden" name="locale" value={locale} />

        <label className="text-[var(--text-sm)] font-medium">
          Describe this photo
          <input name="altText" defaultValue={photo.altText}
            placeholder="A 4x4 cresting a red dune at sunset near Lahbab"
            className="mt-1 h-10 w-full rounded-[var(--radius-md)] border border-[var(--hairline)] px-3 font-normal" />
        </label>
        {/* Alt text is the one field suppliers skip and the one that gets
            photos into Google Images — which is a real traffic source for
            desert and landmark searches. */}
        <span className="text-[var(--text-xs)] text-[var(--ink-faint)]">
          Read aloud to blind travellers, and used by Google Images. Describe what is in the frame.
        </span>

        {altState.status === 'error' && (
          <span role="alert" className="text-[var(--text-xs)] text-[var(--pomegranate)]">{altState.message}</span>
        )}

        <button type="submit" disabled={savingAlt}
          className="mt-1 flex h-9 w-fit items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 text-[var(--text-sm)] font-medium disabled:opacity-60">
          {savingAlt && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
          Save description
        </button>
      </form>

      <div className="flex gap-2 border-t border-[var(--hairline)] pt-3">
        {!photo.isCover && (
          <form action={setCover}>
            <input type="hidden" name="tourId" value={tourId} />
            <input type="hidden" name="mediaId" value={photo.mediaId} />
            <button type="submit" disabled={settingCover}
              className="flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] px-3 text-[var(--text-sm)] text-[var(--ink-soft)] hover:text-[var(--teal)]">
              <Star className="h-3.5 w-3.5" aria-hidden /> Make cover
            </button>
          </form>
        )}
        <form action={remove}>
          <input type="hidden" name="tourId" value={tourId} />
          <input type="hidden" name="mediaId" value={photo.mediaId} />
          <button type="submit" disabled={removing}
            className="flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] px-3 text-[var(--text-sm)] text-[var(--ink-soft)] hover:text-[var(--pomegranate)]">
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
          </button>
        </form>
      </div>
    </div>
  );
}
