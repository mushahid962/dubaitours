'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X, ChevronLeft, ChevronRight, Images } from 'lucide-react';

type Photo = { url: string; alt: string; width: number | null; height: number | null; blurhash: string | null };

/**
 * Hero gallery. The first image is the LCP element on this page, so it ships
 * with `priority` and an explicit `sizes` — everything else lazy-loads.
 * The lightbox is the only client-side state here; the grid itself is static.
 */
export function Gallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [cover, ...rest] = photos;

  if (!cover) {
    return <div className="aspect-[16/9] w-full rounded-[var(--radius-lg)] bg-[var(--limestone)]" />;
  }

  const step = (delta: number) =>
    setOpenAt((current) => (current === null ? null : (current + delta + photos.length) % photos.length));

  return (
    <>
      <div className="grid gap-2 overflow-hidden rounded-[var(--radius-lg)] md:grid-cols-[2fr_1fr]">
        <button
          type="button"
          onClick={() => setOpenAt(0)}
          className="relative aspect-[4/3] md:aspect-auto md:h-[420px]"
          aria-label={`Open photo gallery, ${photos.length} photos`}
        >
          <Image
            src={cover.url}
            alt={cover.alt}
            fill
            priority
            fetchPriority="high"
            sizes="(max-width: 768px) 100vw, 62vw"
            placeholder={cover.blurhash ? 'blur' : 'empty'}
            blurDataURL={cover.blurhash ?? undefined}
            className="object-cover"
          />
        </button>

        <div className="hidden grid-cols-2 gap-2 md:grid">
          {rest.slice(0, 4).map((photo, index) => (
            <button
              key={photo.url}
              type="button"
              onClick={() => setOpenAt(index + 1)}
              className="relative h-[206px]"
              aria-label={`Open photo ${index + 2}`}
            >
              <Image
                src={photo.url}
                alt={photo.alt}
                fill
                loading="lazy"
                sizes="19vw"
                placeholder={photo.blurhash ? 'blur' : 'empty'}
                blurDataURL={photo.blurhash ?? undefined}
                className="object-cover"
              />
              {index === 3 && photos.length > 5 && (
                <span className="absolute inset-0 grid place-items-center bg-[rgb(11_31_28/0.55)] text-[var(--text-sm)] font-semibold text-white">
                  <span className="flex items-center gap-1.5">
                    <Images className="h-4 w-4" aria-hidden />
                    {photos.length - 5} more
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {openAt !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photos`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(8_18_15/0.94)] p-4"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpenAt(null);
            if (event.key === 'ArrowRight') step(1);
            if (event.key === 'ArrowLeft') step(-1);
          }}
          tabIndex={-1}
          ref={(node) => node?.focus()}
        >
          <button
            type="button"
            onClick={() => setOpenAt(null)}
            aria-label="Close gallery"
            className="absolute end-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-[rgb(255_255_255/0.12)] text-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>

          <button type="button" onClick={() => step(-1)} aria-label="Previous photo"
            className="absolute start-4 grid h-11 w-11 place-items-center rounded-full bg-[rgb(255_255_255/0.12)] text-white">
            <ChevronLeft className="h-6 w-6 rtl:rotate-180" aria-hidden />
          </button>

          <figure className="relative h-[80vh] w-full max-w-5xl">
            <Image
              src={photos[openAt].url}
              alt={photos[openAt].alt}
              fill
              sizes="90vw"
              className="object-contain"
            />
            <figcaption className="absolute inset-x-0 bottom-0 p-3 text-center text-[var(--text-sm)] text-white">
              {photos[openAt].alt} · {openAt + 1} of {photos.length}
            </figcaption>
          </figure>

          <button type="button" onClick={() => step(1)} aria-label="Next photo"
            className="absolute end-4 grid h-11 w-11 place-items-center rounded-full bg-[rgb(255_255_255/0.12)] text-white">
            <ChevronRight className="h-6 w-6 rtl:rotate-180" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
