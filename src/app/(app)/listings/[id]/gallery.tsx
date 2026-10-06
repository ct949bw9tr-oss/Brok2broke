"use client";

import { useState } from "react";
import { photoUrl } from "@/lib/catalog";

export function Gallery({ photos, emoji, title }: { photos: string[]; emoji: string; title: string }) {
  const [index, setIndex] = useState(0);
  if (photos.length === 0) {
    return (
      <div className="gallery-main">
        <div className="placeholder" aria-hidden>
          {emoji}
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="gallery-main">
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
        <img src={photoUrl(photos[index])} alt={`${title}, photo ${index + 1} of ${photos.length}`} />
      </div>
      {photos.length > 1 && (
        <div className="gallery-thumbs">
          {photos.map((p, i) => (
            <button key={p} type="button" onClick={() => setIndex(i)} aria-current={i === index} aria-label={`Show photo ${i + 1}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
              <img src={photoUrl(p)} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
