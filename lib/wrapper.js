import * as baileys from "baileys";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, createHash, createHmac, createCipheriv } from "node:crypto";
import { run } from "./helper.js";

const {
  prepareWAMessageMedia,
  generateWAMessage,
  generateWAMessageFromContent,
  getMediaKeys,
  unixTimestampSeconds,
  generateMessageIDV2,
  proto,
  MEDIA_HKDF_KEY_MAPPING,
  MEDIA_PATH_MAP
} = baileys;

if (!MEDIA_HKDF_KEY_MAPPING["sticker-pack"]) {
  MEDIA_HKDF_KEY_MAPPING["sticker-pack"] = "Sticker Pack";
  MEDIA_HKDF_KEY_MAPPING["thumbnail-sticker-pack"] = "Sticker Pack Thumbnail";
  MEDIA_PATH_MAP["sticker-pack"] = "/mms/sticker-pack";
  MEDIA_PATH_MAP["thumbnail-sticker-pack"] = "/mms/thumbnail-sticker-pack";
}

const FALLBACK_JPEG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8/5+hnoEIwDiqkL4KA" +
    "A/0E/8fJ9hBAAAAAElFTkSuQmCC",
  "base64"
);

const STK_TMP = path.join(os.tmpdir(), "saturn-stickerpack");

async function tmpFile(ext) {
  await fs.promises.mkdir(STK_TMP, { recursive: true });
  return path.join(STK_TMP, `${randomBytes(10).toString("hex")}${ext ? "." + ext : ""}`);
}

const isWebP = (buf) =>
  buf && buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";

function isAnimatedWebP(buf) {
  if (!isWebP(buf)) return false;
  try {
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString("ascii", off, off + 4);
      const sz = buf.readUInt32LE(off + 4);
      if (id === "VP8X") return ((buf[off + 8] ?? 0) & 0x02) !== 0;
      off += 8 + sz + (sz % 2);
    }
  } catch {
    /* malformed */
  }
  return false;
}

async function toWebp(buf) {
  if (isWebP(buf)) return buf;
  const src = await tmpFile("");
  const out = await tmpFile("webp");
  await fs.promises.writeFile(src, buf);
  try {
    await run("ffmpeg", ["-y", "-i", src, "-vcodec", "libwebp", "-lossless", "1", "-loop", "0", "-an", "-vsync", "0", out]);
    return await fs.promises.readFile(out);
  } finally {
    fs.promises.unlink(src).catch(() => {});
    fs.promises.unlink(out).catch(() => {});
  }
}

async function toJpegThumb(buf, size = 252) {
  const src = await tmpFile("");
  const out = await tmpFile("jpg");
  await fs.promises.writeFile(src, buf);
  try {
    await run("ffmpeg", [
      "-y", "-i", src,
      "-vf", `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}`,
      "-q:v", "3", out
    ]);
    return await fs.promises.readFile(out);
  } finally {
    fs.promises.unlink(src).catch(() => {});
    fs.promises.unlink(out).catch(() => {});
  }
}

async function resolveBuffer(src) {
  if (!src) return null;
  if (Buffer.isBuffer(src)) return src;
  if (src instanceof Uint8Array) return Buffer.from(src);
  if (typeof src === "string") {
    if (fs.existsSync(src)) return fs.readFileSync(src);
    if (/^https?:\/\//i.test(src)) {
      const r = await fetch(src, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`Fetch gagal ${r.status}: ${src}`);
      return Buffer.from(await r.arrayBuffer());
    }
    if (src.startsWith("data:")) return Buffer.from(src.split(",", 2)[1] || "", "base64");
    throw new Error(`Sumber string tidak dikenali: ${src.slice(0, 80)}`);
  }
  if (typeof src === "object") {
    return resolveBuffer(src.data ?? src.buffer ?? src.url ?? src.path ?? null);
  }
  return null;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function storeZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralPart.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralPart, eocd]);
}

async function uploadLinkThumb(sock, url, fallbackSize) {
  const WAMC = await prepareWAMessageMedia(
    { image: { url } },
    { upload: sock.waUploadToServer, mediaTypeOverride: "thumbnail-link" }
  );
  const i = WAMC.imageMessage || WAMC;
  return {
    image: i,
    meta: {
      thumbnailDirectPath: i.directPath,
      thumbnailSha256: i.fileSha256 ? Buffer.from(i.fileSha256).toString("base64") : "",
      thumbnailEncSha256: i.fileEncSha256 ? Buffer.from(i.fileEncSha256).toString("base64") : "",
      mediaKey: i.mediaKey ? Buffer.from(i.mediaKey).toString("base64") : "",
      mediaKeyTimestamp: i.mediaKeyTimestamp || Math.floor(Date.now() / 1000),
      thumbnailHeight: i.height || fallbackSize.h,
      thumbnailWidth: i.width || fallbackSize.w
    }
  };
}

export function bindWrapper(sock) {
  sock.sendWithThumbnail = async (jid, data = {}, quoted = null, options = {}) => {
    let {
      text = "",
      title = "",
      body = "",
      thumbnailUrl = null,
      faviconUrl = null,
      sourceUrl = "",
      renderLargerThumbnail = true,
      previewType = renderLargerThumbnail ? 1 : 0,
      showSourceUrl = true,
      ...restData
    } = data;

    if (!sourceUrl) sourceUrl = "https://kzy.my.id";

    let finalText = showSourceUrl ? sourceUrl + "\n" + (text || "") : text || "";
    const matchedText = sourceUrl;

    const mentionedJid = new Set();
    if (Array.isArray(restData?.mentions)) {
      for (const j of restData.mentions) if (j && typeof j === "string") mentionedJid.add(j.trim());
    }

    const fullJidRegex = /(\d{8,15})@(s\.whatsapp\.net|lid)/g;
    let match;
    while ((match = fullJidRegex.exec(finalText)) !== null) {
      mentionedJid.add(`${match[1]}@${match[2]}`);
    }
    const atOnlyRegex = /@(\d{8,15})\b/g;
    while ((match = atOnlyRegex.exec(finalText)) !== null) {
      const number = match[1];
      if (!mentionedJid.has(`${number}@s.whatsapp.net`) && !mentionedJid.has(`${number}@lid`)) {
        mentionedJid.add(`${number}@lid`);
      }
    }

    finalText = finalText
      .replace(/(\d{8,15})@(s\.whatsapp\.net|lid)/g, "@$1")
      .replace(/@(\d{8,15})\b/g, "@$1");

    let thumbnailData = {};
    let jpegThumbnailBuffer;

    if (thumbnailUrl) {
      try {
        const { image, meta } = await uploadLinkThumb(sock, thumbnailUrl, { h: 736, w: 1308 });
        jpegThumbnailBuffer = image.jpegThumbnail || FALLBACK_JPEG;
        // The uploaded high-res link thumbnail (directPath + large dimensions) is
        // what makes WhatsApp render the preview BIG. There is no real
        // `renderLargerThumbnail` field on extendedTextMessage — it lives only on
        // ExternalAdReplyInfo — so the only way to get a small card is to omit
        // this metadata and keep just the inline jpegThumbnail.
        if (renderLargerThumbnail) {
          thumbnailData = { ...meta, inviteLinkGroupTypeV2: 0 };
        }
      } catch {
        jpegThumbnailBuffer = FALLBACK_JPEG;
      }
    }

    if (!jpegThumbnailBuffer) jpegThumbnailBuffer = FALLBACK_JPEG;

    let faviconMMSMetadata = null;
    if (faviconUrl) {
      try {
        const { meta } = await uploadLinkThumb(sock, faviconUrl, { h: 48, w: 48 });
        faviconMMSMetadata = meta;
      } catch {
        /* favicon optional */
      }
    }

    let contextInfo = {
      mentionedJid: [...mentionedJid],
      groupMentions: [],
      statusAttributions: []
    };

    if (quoted?.key) {
      contextInfo.stanzaId = quoted.key.id;
      contextInfo.participant = quoted.key.participant || quoted.key.remoteJid;
      contextInfo.remoteJid = quoted.key.remoteJid;
      contextInfo.fromMe = quoted.key.fromMe || false;
      contextInfo.quotedMessage = quoted.message || { conversation: "" };
      contextInfo.quotedType = 0;
    }

    if (restData.contextInfo) contextInfo = { ...contextInfo, ...restData.contextInfo };

    const { mentions: _m, contextInfo: _c, ...passthrough } = restData;

    const content = {
      extendedTextMessage: {
        text: finalText,
        matchedText,
        canonicalUrl: sourceUrl,
        title: title || "",
        description: body || "",
        previewType,
        renderLargerThumbnail,
        inviteLinkGroupTypeV2: 0,
        jpegThumbnail: jpegThumbnailBuffer,
        ...thumbnailData,
        ...(faviconMMSMetadata && { faviconMMSMetadata }),
        contextInfo,
        ...passthrough
      },
      messageContextInfo: { messageSecret: randomBytes(32) }
    };

    return sock.relayMessage(jid, content, { quoted, ...options });
  };

  sock.sendAlbum = async (jid, medias = [], options = {}) => {
    const album = await generateWAMessageFromContent(
      jid,
      {
        albumMessage: {
          expectedImageCount: medias.filter((v) => v.image).length,
          expectedVideoCount: medias.filter((v) => v.video).length
        }
      },
      { quoted: options.quoted }
    );

    await sock.relayMessage(jid, album.message, { messageId: album.key.id });

    for (const media of medias) {
      const msg = await generateWAMessage(jid, media, { upload: sock.waUploadToServer });
      msg.message.messageContextInfo = {
        messageAssociation: { associationType: 1, parentMessageKey: album.key }
      };
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
    }
    return album;
  };

  sock.sendStickerPack = async (jid, data = {}, options = {}) => {
    const {
      cover,
      stickers = [],
      name = "Sticker Pack",
      publisher = "Unknown",
      description = "",
      emojis: defaultEmojis = ["🎨"],
      origin = "USER_CREATED"
    } = data;

    if (!stickers.length) throw new Error("sendStickerPack: stickers tidak boleh kosong");
    if (!cover) throw new Error("sendStickerPack: cover wajib diisi");

    const encryptForUpload = async (plaintext, mediaType, providedMediaKey = null) => {
      const mediaKey = providedMediaKey ? Buffer.from(providedMediaKey) : randomBytes(32);
      const { iv, cipherKey, macKey } = await getMediaKeys(mediaKey, mediaType);
      const cipher = createCipheriv("aes-256-cbc", cipherKey, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const mac = createHmac("sha256", macKey).update(iv).update(ciphertext).digest().slice(0, 10);
      const encrypted = Buffer.concat([ciphertext, mac]);
      return {
        mediaKey,
        encrypted,
        fileSha256: createHash("sha256").update(plaintext).digest(),
        fileEncSha256: createHash("sha256").update(encrypted).digest(),
        fileLength: plaintext.length
      };
    };

    const writeTempAndUpload = async (encrypted, mediaType) => {
      const tmp = await tmpFile("enc");
      await fs.promises.writeFile(tmp, encrypted.encrypted);
      try {
        const result = await sock.waUploadToServer(tmp, {
          mediaType,
          fileEncSha256B64: encrypted.fileEncSha256.toString("base64"),
          timeoutMs: 60000
        });
        if (!result?.directPath) throw new Error(`Upload ${mediaType} gagal: tidak ada directPath`);
        return result;
      } finally {
        fs.promises.unlink(tmp).catch(() => {});
      }
    };

    const packId = options.packId || generateMessageIDV2();
    const zipEntries = [];
    const stickerMetadata = [];

    for (let i = 0; i < stickers.length; i++) {
      const s = stickers[i];
      const srcBuf = await resolveBuffer(s.data ?? s.sticker ?? s.url ?? s.path ?? s);
      if (!srcBuf) {
        console.warn(`[sendStickerPack] sticker #${i + 1} dilewati (buffer kosong)`);
        continue;
      }
      const webpBuf = await toWebp(srcBuf);
      const fileName = `${createHash("sha256").update(webpBuf).digest("base64url")}.webp`;
      if (!zipEntries.some((e) => e.name === fileName)) zipEntries.push({ name: fileName, data: webpBuf });
      stickerMetadata.push({
        fileName,
        mimetype: "image/webp",
        isAnimated: isAnimatedWebP(webpBuf),
        isLottie: false,
        emojis: Array.isArray(s.emojis) && s.emojis.length ? s.emojis : defaultEmojis,
        accessibilityLabel: s.accessibilityLabel || s.label || ""
      });
    }

    if (!stickerMetadata.length) throw new Error("sendStickerPack: tidak ada sticker valid");

    const coverBuf = await resolveBuffer(cover.data ?? cover);
    if (!coverBuf) throw new Error("sendStickerPack: cover gagal dimuat");
    const trayIconFileName = `${packId}.webp`;
    zipEntries.push({ name: trayIconFileName, data: await toWebp(coverBuf) });

    const zipBuffer = storeZip(zipEntries);

    const packEnc = await encryptForUpload(zipBuffer, "sticker-pack");
    const packUpload = await writeTempAndUpload(packEnc, "sticker-pack");

    let thumbBuf = await toJpegThumb(coverBuf, 252).catch(() => null);
    if (!thumbBuf || !thumbBuf.length) thumbBuf = coverBuf;

    const thumbEnc = await encryptForUpload(thumbBuf, "thumbnail-sticker-pack", packEnc.mediaKey);
    const thumbUpload = await writeTempAndUpload(thumbEnc, "thumbnail-sticker-pack");

    const Origin = proto.Message.StickerPackMessage.StickerPackOrigin;
    const stickerPackMessage = {
      stickerPackId: packId,
      name: name || "Sticker Pack",
      publisher: publisher || "Unknown",
      stickers: stickerMetadata,
      fileLength: zipBuffer.length,
      fileSha256: packEnc.fileSha256,
      fileEncSha256: packEnc.fileEncSha256,
      mediaKey: packEnc.mediaKey,
      directPath: packUpload.directPath,
      packDescription: description || `${stickerMetadata.length} stickers`,
      mediaKeyTimestamp: unixTimestampSeconds(),
      trayIconFileName,
      thumbnailDirectPath: thumbUpload.directPath,
      thumbnailSha256: thumbEnc.fileSha256,
      thumbnailEncSha256: thumbEnc.fileEncSha256,
      thumbnailHeight: 252,
      thumbnailWidth: 252,
      imageDataHash: createHash("sha256").update(thumbBuf).digest("base64"),
      stickerPackSize: zipBuffer.length,
      stickerPackOrigin: Origin[origin] ?? Origin.USER_CREATED
    };

    if (options.quoted?.key) {
      stickerPackMessage.contextInfo = {
        stanzaId: options.quoted.key.id,
        participant: options.quoted.key.participant || options.quoted.key.remoteJid,
        quotedMessage: options.quoted.message || { conversation: "" }
      };
    }

    const content = {
      messageContextInfo: { messageSecret: randomBytes(32) },
      stickerPackMessage
    };

    return sock.relayMessage(jid, content, { messageId: options.messageId });
  };

  return sock;
}

export { storeZip };
export default bindWrapper;
