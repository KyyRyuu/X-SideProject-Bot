import webpmux from "node-webpmux";
import { randomId } from "./helper.js";
import { ezgifConvert } from "./ezgif.js";

/**
 * Detect the image container of a buffer from its magic bytes.
 * @param {Buffer} buffer
 * @returns {"png"|"jpg"|"webp"|"gif"|"unknown"}
 */
function imageKind(buffer) {
  if (buffer.length < 12) return "unknown";
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "jpg";
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return "gif";
  if (buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return "unknown";
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
 * Inject sticker pack EXIF using node-webpmux (pure JS — no external binary).
 * Works for both static and animated WebP; frames are preserved untouched.
 * @param {Buffer} webp
 * @param {object} meta
 * @returns {Promise<Buffer>}
 */
async function applyExif(webp, meta) {
  if (!meta.packname && !meta.author) return webp;
  try {
    const img = new webpmux.Image();
    await img.load(webp);
    img.exif = buildExif(meta.packname || "", meta.author || "");
    return await img.save(null);
  } catch {
    return webp; // never fail the sticker over metadata
  }
}

/**
 * Convert an image or video into a WhatsApp WebP sticker via ezgif.com.
 *
 * Animated input (video/gif) is routed through ezgif's `video-to-webp` tool,
 * which produces a true animated WebP — the sticker actually moves. Still
 * images go through `jpg-to-webp` / `png-to-webp`. EXIF pack metadata is then
 * applied locally with node-webpmux.
 *
 * @param {Buffer} input Source media buffer.
 * @param {object} [meta]
 * @param {string} [meta.packname]
 * @param {string} [meta.author]
 * @param {boolean} [meta.animated] Treat input as video/gif.
 * @returns {Promise<Buffer>} WebP buffer.
 */
export async function toSticker(input, meta = {}) {
  let webp;

  if (meta.animated) {
    // Square, ~400px, 12fps, ≤6s — keeps animated stickers under WhatsApp's
    // ~1MB practical ceiling while staying smooth.
    webp = await ezgifConvert({
      tool: "video-to-webp",
      buffer: input,
      filename: "input.mp4",
      mime: "video/mp4",
      fields: {
        start: 0, end: 6, size: 400, crop: "1:1", ar: "no",
        fps: 12, fpsr: 12, "detected-fps": 12,
        method: "imagemagick", quality: 50, qualityr: 50, loop: 0
      },
      exts: ["webp"]
    });
  } else {
    const kind = imageKind(input) === "png" ? "png" : "jpg";
    webp = await ezgifConvert({
      tool: `${kind}-to-webp`,
      buffer: input,
      filename: `input.${kind}`,
      mime: kind === "png" ? "image/png" : "image/jpeg",
      fields: { percentage: 90, percentager: 90 },
      exts: ["webp"]
    });
  }

  return applyExif(webp, meta);
}

/**
 * Convert a WebP sticker into a JPG image via ezgif's `webp-to-jpg` tool.
 * For animated stickers ezgif returns the first frame as a single JPG.
 * @param {Buffer} webp
 * @returns {Promise<Buffer>} JPG buffer.
 */
export async function toImage(webp) {
  return ezgifConvert({
    tool: "webp-to-jpg",
    buffer: webp,
    filename: "input.webp",
    mime: "image/webp",
    fields: {
      percentage: 92, percentager: 92,
      background: "#ffffff", backgroundc: "#ffffff"
    },
    exts: ["jpg", "jpeg"]
  });
}

/**
 * Convert a WebP sticker into an MP4 video via ezgif's `webp-to-mp4` tool.
 * Animated stickers become looping videos; still stickers become a 1-frame clip.
 * @param {Buffer} webp
 * @returns {Promise<Buffer>} MP4 buffer.
 */
export async function toVideo(webp) {
  return ezgifConvert({
    tool: "webp-to-mp4",
    buffer: webp,
    filename: "input.webp",
    mime: "image/webp",
    fields: { background: "#ffffff", backgroundc: "#ffffff", repeat: 0 },
    exts: ["mp4"]
  });
}

/**
 * Extract an MP3 audio track from a video via ezgif's `mp4-to-mp3` tool.
 * @param {Buffer} input Source video buffer.
 * @param {object} [opts]
 * @param {string} [opts.filename] Upload filename (extension matters to ezgif).
 * @param {string} [opts.mime] Upload content type.
 * @returns {Promise<Buffer>} MP3 buffer.
 */
export async function toMp3(input, opts = {}) {
  return ezgifConvert({
    tool: "mp4-to-mp3",
    buffer: input,
    filename: opts.filename || "input.mp4",
    mime: opts.mime || "video/mp4",
    fields: {},
    exts: ["mp3"]
  });
}

export default { toSticker, toImage, toVideo, toMp3 };
