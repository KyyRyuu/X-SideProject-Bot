import { writeFile, readFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { run, randomId } from "./helper.js";

const TEMP = join(process.cwd(), "temp");

/**
 * @param {Buffer} buffer
 * @param {string} ext
 * @returns {Promise<string>} Absolute temp path.
 */
async function toTemp(buffer, ext) {
  await mkdir(TEMP, { recursive: true });
  const path = join(TEMP, `${randomId(12)}.${ext}`);
  await writeFile(path, buffer);
  return path;
}

/** @param {...string} paths */
async function cleanup(...paths) {
  await Promise.all(paths.map((p) => unlink(p).catch(() => {})));
}

/**
 * Build a WhatsApp-compatible EXIF metadata block for sticker packs.
 * @param {string} packname
 * @param {string} author
 * @returns {Buffer}
 */
function buildExif(packname, author) {
  const json = {
    "sticker-pack-id": `saturn-${randomId(8)}`,
    "sticker-pack-name": packname,
    "sticker-pack-publisher": author,
    emojis: []
  };
  const head = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
  ]);
  const payload = Buffer.from(JSON.stringify(json), "utf8");
  const exif = Buffer.concat([head, payload]);
  exif.writeUIntLE(payload.length, 14, 4);
  return exif;
}

/**
 * Convert an image or short video/gif into a 512x512 WebP sticker. EXIF pack
 * metadata is applied via the optional `webpmux` binary (part of libwebp); if
 * it is not installed the sticker is still returned without metadata.
 *
 * @param {Buffer} input Source media buffer.
 * @param {object} [meta]
 * @param {string} [meta.packname]
 * @param {string} [meta.author]
 * @param {boolean} [meta.animated] Treat input as video/gif.
 * @returns {Promise<Buffer>} WebP buffer.
 */
export async function toSticker(input, meta = {}) {
  const src = await toTemp(input, meta.animated ? "mp4" : "img");
  const webp = join(TEMP, `${randomId(12)}.webp`);
  const filter =
    "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease," +
    "format=rgba,pad=512:512:-1:-1:color=#00000000";

  const args = meta.animated
    ? ["-y", "-i", src, "-vcodec", "libwebp", "-vf", `${filter},fps=15`,
       "-loop", "0", "-ss", "0", "-t", "6", "-preset", "default",
       "-an", "-vsync", "0", webp]
    : ["-y", "-i", src, "-vcodec", "libwebp", "-vf", filter, "-lossless", "1",
       "-loop", "0", "-an", "-vsync", "0", webp];

  try {
    await run("ffmpeg", args);
    let buffer = await readFile(webp);
    buffer = await applyExif(buffer, meta);
    return buffer;
  } finally {
    await cleanup(src, webp);
  }
}

/**
 * Inject sticker pack EXIF using webpmux when available.
 * @param {Buffer} webp
 * @param {object} meta
 * @returns {Promise<Buffer>}
 */
async function applyExif(webp, meta) {
  if (!meta.packname && !meta.author) return webp;
  const exif = buildExif(meta.packname || "", meta.author || "");
  const inPath = await toTemp(webp, "webp");
  const exifPath = await toTemp(exif, "exif");
  const outPath = join(TEMP, `${randomId(12)}.webp`);
  try {
    await run("webpmux", ["-set", "exif", exifPath, inPath, "-o", outPath]);
    return await readFile(outPath);
  } catch {
    return webp;
  } finally {
    await cleanup(inPath, exifPath, outPath);
  }
}

/**
 * Convert a WebP sticker back into a PNG image.
 * @param {Buffer} webp
 * @returns {Promise<Buffer>}
 */
export async function toImage(webp) {
  const src = await toTemp(webp, "webp");
  const out = join(TEMP, `${randomId(12)}.png`);
  try {
    await run("ffmpeg", ["-y", "-i", src, out]);
    return await readFile(out);
  } finally {
    await cleanup(src, out);
  }
}

/**
 * Convert media (gif/webp/etc.) into an MP4 video.
 * @param {Buffer} input
 * @returns {Promise<Buffer>}
 */
export async function toVideo(input) {
  const src = await toTemp(input, "webp");
  const out = join(TEMP, `${randomId(12)}.mp4`);
  try {
    await run("ffmpeg", [
      "-y", "-i", src,
      "-movflags", "faststart", "-pix_fmt", "yuv420p",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", out
    ]);
    return await readFile(out);
  } finally {
    await cleanup(src, out);
  }
}

/**
 * Convert audio into a WhatsApp voice-note compatible Opus/OGG buffer.
 * @param {Buffer} input
 * @param {boolean} [ptt] Encode for push-to-talk (voice note).
 * @returns {Promise<Buffer>}
 */
export async function toAudio(input, ptt = true) {
  const src = await toTemp(input, "audio");
  const out = join(TEMP, `${randomId(12)}.ogg`);
  const args = ptt
    ? ["-y", "-i", src, "-c:a", "libopus", "-b:a", "128k", "-vn",
       "-avoid_negative_ts", "make_zero", out]
    : ["-y", "-i", src, "-c:a", "libopus", "-b:a", "128k", "-vn", out];
  try {
    await run("ffmpeg", args);
    return await readFile(out);
  } finally {
    await cleanup(src, out);
  }
}

export default { toSticker, toImage, toVideo, toAudio };
