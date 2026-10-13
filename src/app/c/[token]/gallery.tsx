"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import flame from "./brand/flame.svg";

/** A model's photos: the main one large, the rest as squares along its bottom edge that swap in on hover or click. */
export function ModelGallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const src = images[index] ?? images[0];
  return (
    <div className="relative border-b border-chaleur-stone bg-chaleur-smoke">
      <div className={cn("flex aspect-[4/3] items-center justify-center overflow-hidden p-8", images.length > 1 && "pb-16")}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={title}
            loading="lazy"
            className="max-h-full max-w-full object-contain mix-blend-multiply transition-transform duration-500 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.03]"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flame.src} alt="" className="h-16 w-auto opacity-15 grayscale" />
        )}
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-3 left-3 flex gap-1.5">
          {images.slice(0, 6).map((thumb, i) => (
            <button
              key={thumb}
              type="button"
              aria-label={`Show photo ${i + 1} of ${title || "this model"}`}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
              onMouseEnter={() => setIndex(i)}
              className={cn(
                "size-10 overflow-hidden rounded-[2px] border bg-white p-1 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-chaleur-flame",
                i === index ? "border-chaleur-char" : "border-chaleur-stone hover:border-chaleur-steel",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb} alt="" className="size-full object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
