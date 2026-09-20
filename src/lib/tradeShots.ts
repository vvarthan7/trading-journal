/**
 * Screenshots on a trade: a row per image in `public.trade_screenshots`, with the bytes in the
 * private `trade-screenshots` Storage bucket. See `supabase/trade_screenshots_table.sql` for the
 * link table and `supabase/trade_screenshots.sql` for the bucket and its policies.
 *
 * A trade may have as many as you like. The row is what links an image to its trade — the folder
 * layout is still `{user_id}/{trade_id}/{uuid}.{ext}`, but that is now a convenience for reading
 * a path, not the linkage itself.
 *
 * The bucket is private, so every read goes through a short-lived signed URL.
 */
import { supabase } from "./supabase";

const BUCKET = "trade-screenshots";

/** Matches the bucket's `file_size_limit`; checked here so the failure is a sentence, not a 413. */
export const MAX_BYTES = 8 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** The bucket's `allowed_mime_types`, as a set the dropzone can test against. */
export function isAcceptedImage(file: File): boolean {
  return file.type in EXTENSIONS;
}

export const ACCEPT = Object.keys(EXTENSIONS).join(",");

/** A `trade_screenshots` row as Supabase returns it. */
interface ShotRow {
  id: number;
  trade_id: number;
  path: string;
  created_at: string;
}

/** One stored screenshot, ready to render. */
export interface TradeShot {
  id: number;
  /** Object path inside the bucket — what removing the file needs. */
  path: string;
  /** Signed URL, valid for `SIGNED_FOR` seconds. */
  url: string;
  createdAt: string;
}

/** Long enough to sit on the page reading, short enough that a leaked URL dies quickly. */
const SIGNED_FOR = 60 * 60;

/**
 * Every screenshot on a trade, oldest first. The rows are the truth; a row whose object has gone
 * missing is skipped rather than rendered as a broken image.
 */
export async function listShots(tradeId: number): Promise<TradeShot[]> {
  const { data, error } = await supabase
    .from("trade_screenshots")
    .select("*")
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = data as ShotRow[];
  if (rows.length === 0) return [];

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      rows.map((r) => r.path),
      SIGNED_FOR
    );
  if (signError) throw new Error(signError.message);

  return signed.flatMap((s, i) =>
    s.signedUrl
      ? [{ id: rows[i].id, path: rows[i].path, url: s.signedUrl, createdAt: rows[i].created_at }]
      : []
  );
}

/**
 * Store one image against a trade: upload the bytes, then link them. The name is random, so
 * uploads never collide. If the row fails to insert the object is removed again, rather than
 * leaving a file in the bucket that nothing points at.
 */
export async function uploadShot(userId: string, tradeId: number, file: File): Promise<void> {
  if (!isAcceptedImage(file)) {
    throw new Error(`${file.type || "That file"} isn't an image the bucket accepts.`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`That image is ${Math.round(file.size / 1024 / 1024)}MB — the limit is 8MB.`);
  }

  const path = `${userId}/${tradeId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
  const { error: upError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });
  if (upError) throw new Error(upError.message);

  const { error: rowError } = await supabase
    .from("trade_screenshots")
    .insert({ trade_id: tradeId, path });
  if (rowError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(rowError.message);
  }
}

/** Unlink the image and delete its bytes. The row goes first: an orphaned object is the milder
 * failure of the two, and it is what the bucket already tolerates. */
export async function removeShot(id: number, path: string): Promise<void> {
  const { data, error } = await supabase
    .from("trade_screenshots")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error("Not deleted — are you still signed in?");

  const { error: fileError } = await supabase.storage.from(BUCKET).remove([path]);
  if (fileError) throw new Error(fileError.message);
}

/**
 * The images in a drop or a paste, in order. Both events carry the same shape of payload, so
 * both the dropzone and the window paste listener come through here.
 */
export function imagesFrom(list: DataTransfer | null): File[] {
  if (!list) return [];
  return [...list.files].filter((f) => f.type.startsWith("image/"));
}
