"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import flame from "../brand/flame.svg";

type Image = { src: string; full: string };

const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chaleur-flame";

/**
 * A product page's photos: the main one large, squares below to pick another, and a click on the
 * main one opens it full size (Esc, the X or a click outside closes it; the page stays where it was).
 */
export function ProductGallery({ images, title }: { images: Image[]; title: string }) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = images[index];
  const many = images.length > 1;
  const step = (d: number) => setIndex((i) => (i + d + images.length) % images.length);

  if (!current) {
    return (
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-[2px] border border-chaleur-stone bg-chaleur-smoke">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={flame.src} alt="" className="h-14 w-auto opacity-15 grayscale" />
        <p className="text-xs font-normal tracking-[0.12em] text-chaleur-steel uppercase">Photos coming soon</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`View ${title || "this photo"} larger`}
        className={cn(
          "group relative flex aspect-[4/3] w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-[2px] border border-chaleur-stone bg-chaleur-smoke p-6 sm:p-10",
          ring,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.src} alt={title} className="max-h-full max-w-full object-contain mix-blend-multiply" />
        <span className="absolute right-3 bottom-3 flex size-9 items-center justify-center rounded-full bg-white/90 text-chaleur-graphite opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:opacity-100">
          <Maximize2 className="size-4" aria-hidden />
        </span>
      </button>

      {many && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1" role="group" aria-label="Photos">
          {images.map((image, i) => (
            <button
              key={image.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Photo ${i + 1} of ${images.length}`}
              aria-current={i === index}
              className={cn(
                "size-16 shrink-0 overflow-hidden rounded-[2px] border bg-white p-1 transition-colors duration-200 sm:size-[72px]",
                i === index ? "border-chaleur-char ring-1 ring-chaleur-char" : "border-chaleur-stone hover:border-chaleur-steel",
                ring,
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt="" className="size-full object-contain" />
            </button>
          ))}
        </div>
      )}

      <dialog
        ref={dialog}
        aria-label={`${title || "Photo"}, full size`}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
        className="m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 backdrop:bg-chaleur-char/90"
      >
        <div className="pointer-events-none flex h-full w-full items-center justify-center p-4 sm:p-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.full} alt={title} className="pointer-events-auto max-h-full max-w-full rounded-[2px] bg-white object-contain" />
        </div>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Close"
          autoFocus
          className={cn("absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20", ring)}
        >
          <X className="size-5" />
        </button>
        {many && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous photo"
              className={cn("absolute top-1/2 left-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6", ring)}
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next photo"
              className={cn("absolute top-1/2 right-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6", ring)}
            >
              <ChevronRight className="size-5" />
            </button>
            <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-white/70 tabular-nums">
              {index + 1} / {images.length}
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}
