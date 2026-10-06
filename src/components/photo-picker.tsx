"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PHOTOS, PHOTO_BUCKET, photoUrl } from "@/lib/catalog";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Photos are resized in the browser (phones produce 5-10 MB images) and
// uploaded straight to Storage into the student's own folder. The form only
// submits the resulting storage paths as hidden inputs.

const MAX_EDGE = 1600;

async function resizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.82),
  );
}

type Slot = { key: string; path?: string; preview: string };

export function PhotoPicker({
  userId,
  initial,
  onUploadingChange,
}: {
  userId: string;
  initial: string[];
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>(initial.map((p) => ({ key: p, path: p, preview: photoUrl(p) })));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - slots.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setError(`Up to ${MAX_PHOTOS} photos.`);

    const pending = picked.map((f) => ({ key: crypto.randomUUID(), preview: URL.createObjectURL(f), file: f }));
    setSlots((s) => [...s, ...pending.map(({ key, preview }) => ({ key, preview }))]);

    const supabase = supabaseBrowser();
    await Promise.all(
      pending.map(async ({ key, file }) => {
        try {
          const blob = await resizeToJpeg(file);
          const path = `${userId}/${crypto.randomUUID()}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
          if (uploadError) throw uploadError;
          setSlots((s) => s.map((slot) => (slot.key === key ? { ...slot, path } : slot)));
        } catch {
          setSlots((s) => s.filter((slot) => slot.key !== key));
          setError("A photo couldn't be uploaded. Try a JPG or PNG.");
        }
      }),
    );
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(key: string) {
    // The storage object is left in place: it may still be used by the saved
    // listing until the form is submitted.
    setSlots((s) => s.filter((slot) => slot.key !== key));
  }

  const uploading = slots.some((s) => !s.path);
  useEffect(() => onUploadingChange?.(uploading), [uploading, onUploadingChange]);

  return (
    <div className="stack-sm">
      <div className="photo-picker">
        {slots.map((slot, i) => (
          <div key={slot.key} className={slot.path ? "photo-slot" : "photo-slot uploading"}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview / storage URL */}
            <img src={slot.preview} alt={`Photo ${i + 1}`} />
            {i === 0 && <span className="cover">Cover</span>}
            <button type="button" className="remove" onClick={() => remove(slot.key)} aria-label={`Remove photo ${i + 1}`}>
              ×
            </button>
            {slot.path && <input type="hidden" name="photos" value={slot.path} />}
          </div>
        ))}
        {slots.length < MAX_PHOTOS && (
          <label className="photo-add">
            <span>
              📷
              <br />
              Add photos
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>
        )}
      </div>
      <span className="hint">
        {uploading ? "Uploading…" : `Good light, real photos. First photo is the cover. Up to ${MAX_PHOTOS}.`}
      </span>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
