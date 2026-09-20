/**
 * The screenshot gallery on the trade detail screen. Three ways in, all landing on the same
 * `add()`: the file picker, a drop onto the panel, and Ctrl/Cmd+V anywhere on the page.
 *
 * Multiple images per trade, and every route accepts several at once — a multi-select in the
 * picker, a drop of four files, or a paste carrying more than one image.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useJournal } from "../store";
import {
  ACCEPT,
  imagesFrom,
  listShots,
  removeShot,
  uploadShot,
  type TradeShot,
} from "../lib/tradeShots";
import { Eyebrow } from "./ui";

export default function TradeScreenshots({ tradeId }: { tradeId: number }) {
  const { session } = useJournal();
  const userId = session?.user.id ?? null;

  const [shots, setShots] = useState<TradeShot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Id of the shot open full-size, or null. */
  const [zoomed, setZoomed] = useState<number | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setShots(await listShots(tradeId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [tradeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      if (!userId) {
        setError("Sign in first — screenshots are stored against your account.");
        return;
      }
      setBusy(true);
      try {
        // Sequential, so the first bad file reports its own reason rather than a bulk failure.
        for (const file of files) await uploadShot(userId, tradeId, file);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      await refresh();
      setBusy(false);
    },
    [userId, tradeId, refresh]
  );

  /** Paste is a page-level gesture — there is nothing sensible to focus first. */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const images = imagesFrom(e.clipboardData);
      if (images.length === 0) return;
      e.preventDefault();
      void add(images);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  /** Esc closes the full-size view. */
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomed]);

  const remove = async (id: number, path: string) => {
    setBusy(true);
    try {
      await removeShot(id, path);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    if (zoomed === id) setZoomed(null);
    await refresh();
    setBusy(false);
  };

  const open = shots.find((s) => s.id === zoomed);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // Moving between children fires dragleave; only the panel itself ends the drag.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void add(imagesFrom(e.dataTransfer));
      }}
      className={[
        "border rounded-md bg-surface p-6 flex flex-col gap-4 transition-colors",
        dragging ? "border-accent bg-accent-soft" : "border-line",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-[14px] font-medium">Screenshots</span>
        <div className="flex items-center gap-4">
          <span className="text-[12px] text-dim">
            {busy
              ? "Uploading…"
              : loading
                ? "Loading…"
                : shots.length === 0
                  ? "Drop, paste or upload"
                  : `${shots.length} ${shots.length === 1 ? "image" : "images"}`}
          </span>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy || !userId}
            className="px-4 py-[5px] text-[12px] rounded-sm border border-line-strong bg-transparent text-muted cursor-pointer transition-colors hover:text-ink disabled:opacity-40 disabled:cursor-default"
          >
            Upload
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          void add([...(e.target.files ?? [])]);
          // Let the same file be picked twice in a row.
          e.target.value = "";
        }}
      />

      {error && <span className="text-[12.5px] text-loss">{error}</span>}

      {shots.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy || !userId}
          className="border border-dashed border-line-strong rounded-md bg-transparent py-16 px-6 flex flex-col items-center gap-2 cursor-pointer transition-colors hover:border-accent disabled:cursor-default"
        >
          <i className="ph ph-image text-[24px] text-dim" />
          <span className="text-[13px] text-muted">
            {userId
              ? "Drag images here, paste with Ctrl+V, or click to browse"
              : "Sign in to add screenshots"}
          </span>
          <span className="text-[11.5px] text-dim">PNG, JPEG, WebP or GIF · up to 8MB each</span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {shots.map((s) => (
            <div
              key={s.id}
              className="relative group border border-line rounded-md overflow-hidden bg-subtle"
            >
              <button
                type="button"
                onClick={() => setZoomed(s.id)}
                className="block w-full h-[128px] p-0 border-0 bg-transparent cursor-zoom-in"
              >
                <img src={s.url} alt="Trade screenshot" className="w-full h-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() => void remove(s.id, s.path)}
                disabled={busy}
                title="Remove"
                className="absolute top-2 right-2 w-[22px] h-[22px] rounded-sm border border-line-strong bg-surface text-dim text-[12px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity hover:text-loss disabled:cursor-default"
              >
                <i className="ph ph-trash" />
              </button>
            </div>
          ))}

          {/* Keeps the picker reachable once the empty-state button is gone. */}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy || !userId}
            className="h-[128px] border border-dashed border-line-strong rounded-md bg-transparent flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors hover:border-accent disabled:cursor-default"
          >
            <i className="ph ph-plus text-[16px] text-dim" />
            <span className="text-[11.5px] text-dim">Add more</span>
          </button>
        </div>
      )}

      <Eyebrow>Drop anywhere on this panel · paste anywhere on the page</Eyebrow>

      {/* Full-size view */}
      {open && (
        <div
          onClick={() => setZoomed(null)}
          className="fixed inset-0 z-50 bg-[rgba(41,43,49,0.72)] flex items-center justify-center p-12 cursor-zoom-out"
        >
          <img
            src={open.url}
            alt="Trade screenshot"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-md cursor-default"
          />
        </div>
      )}
    </div>
  );
}
