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

function extractIE(text, { extract = true, hyperlink = true, citation = true, latex = true } = {}) {
  if (!extract) return { text, ie: [], inline_entities: [] };

  const createIE = (type, ie) => {
    if (type === "hyperlink") return {
      key: ie.key,
      metadata: { display_name: ie.text, is_trusted: ie.is_trusted, url: ie.url, __typename: "GenAIInlineLinkItem" }
    };
    if (type === "citation") return {
      key: ie.key,
      metadata: { reference_id: ie.reference_id, reference_url: ie.url, reference_title: ie.url, reference_display_name: ie.url, sources: [], __typename: "GenAISearchCitationItem" }
    };
    if (type === "latex") return {
      key: ie.key,
      metadata: { latex_expression: ie.text, latex_image: { url: ie.url, width: Number(ie.width) || 100, height: Number(ie.height) || 100 }, font_height: Number(ie.font_height) || 83.333333333333, padding: Number(ie.padding) || 15, __typename: "GenAILatexItem" }
    };
  };

  let ie = [], inline_entities = [], result = "", last = 0;
  let citation_index = 1, hyperlink_index = 0, latex_index = 0;
  const stack = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "[" && text[i - 1] !== "\\") {
      stack.push(i);
    } else if (text[i] === "]" && (text[i + 1] === "(" || text[i + 1] === "<")) {
      const start = stack.pop();
      if (start == null) continue;
      const open = text[i + 1], close = open === "(" ? ")" : ">";
      const type = open === "(" ? "link" : "latex";
      let end = i + 2, depth = 1;
      while (end < text.length && depth) {
        if (text[end] === open && text[end - 1] !== "\\") depth++;
        else if (text[end] === close && text[end - 1] !== "\\") depth--;
        end++;
      }
      if (depth) continue;
      const raw = text.slice(start + 1, i).trim();
      let url = text.slice(i + 2, end - 1).trim();
      let key, tag, data;
      if (type === "latex") {
        if (!latex) continue;
        const [txt = "", width = null, height = null, font_height = null, padding = null] = raw.split("|");
        key = `NIXEL_LATEX_${latex_index++}`;
        tag = `{{${key}}}${txt || "image"}{{/${key}}}`;
        data = { type: "latex", ie: { key, text: txt, url, width, height, font_height, padding } };
      } else if (raw) {
        if (!hyperlink) continue;
        const trusted = !url.startsWith("!");
        if (!trusted) url = url.slice(1);
        key = `NIXEL_HYPERLINK_${hyperlink_index++}`;
        tag = `{{${key}}}${url}{{/${key}}}`;
        data = { type: "hyperlink", ie: { key, text: raw, url, is_trusted: trusted } };
      } else {
        if (!citation) continue;
        key = `NIXEL_CITATION_${citation_index - 1}`;
        tag = `{{${key}}}${url}{{/${key}}}`;
        data = { type: "citation", ie: { reference_id: citation_index++, key, text: "", url } };
      }
      result += text.slice(last, start) + tag;
      last = end;
      ie.push(data);
      const entity = createIE(data.type, data.ie);
      if (entity) inline_entities.push(entity);
      i = end - 1;
    }
  }
  result += text.slice(last);
  return { text: result, ie, inline_entities };
}

const RICH_TYPE_MAP = { 0: "DEFAULT", 1: "KEYWORD", 2: "METHOD", 3: "STR", 4: "NUMBER", 5: "COMMENT" };

function aiRichTokenizer(code, lang = "javascript") {
  const keywordsMap = {
    javascript: new Set(["break","case","catch","continue","debugger","delete","do","else","finally","for","function","if","in","instanceof","new","return","switch","this","throw","try","typeof","var","void","while","with","true","false","null","undefined","class","const","let","super","extends","export","import","yield","static","constructor","async","await","get","set"]),
    typescript: new Set(["abstract","any","as","asserts","bigint","boolean","declare","enum","implements","infer","interface","is","keyof","module","namespace","never","readonly","require","number","object","override","private","protected","public","satisfies","string","symbol","type","unknown","using","from","break","case","catch","continue","do","else","finally","for","function","if","new","return","switch","this","throw","try","var","void","while","class","const","let","extends","import","export","async","await"]),
    python: new Set(["False","None","True","and","as","assert","async","await","break","class","continue","def","del","elif","else","except","finally","for","from","global","if","import","in","is","lambda","nonlocal","not","or","pass","raise","return","try","while","with","yield"]),
    java: new Set(["abstract","assert","boolean","break","byte","case","catch","char","class","const","continue","default","do","double","else","enum","extends","final","finally","float","for","goto","if","implements","import","instanceof","int","interface","long","native","new","package","private","protected","public","return","short","static","strictfp","super","switch","synchronized","this","throw","throws","transient","try","void","volatile","while"]),
    golang: new Set(["break","case","chan","const","continue","default","defer","else","fallthrough","for","func","go","goto","if","import","interface","map","package","range","return","select","struct","switch","type","var"]),
    c: new Set(["auto","break","case","char","const","continue","default","do","double","else","enum","extern","float","for","goto","if","int","long","register","return","short","signed","sizeof","static","struct","switch","typedef","union","unsigned","void","volatile","while"]),
    cpp: new Set(["alignas","alignof","and","auto","bool","break","case","catch","class","const","constexpr","continue","delete","do","double","else","enum","explicit","export","extern","false","float","for","friend","if","inline","int","long","mutable","namespace","new","noexcept","nullptr","operator","private","protected","public","return","short","signed","sizeof","static","struct","switch","template","this","throw","true","try","typedef","typename","union","unsigned","using","virtual","void","while"]),
    php: new Set(["abstract","and","array","as","break","callable","case","catch","class","clone","const","continue","declare","default","do","echo","else","elseif","empty","enddeclare","endfor","endforeach","endif","endswitch","endwhile","extends","final","finally","fn","for","foreach","function","global","goto","if","implements","include","include_once","instanceof","interface","match","namespace","new","null","or","private","protected","public","require","require_once","return","static","switch","throw","trait","try","use","var","while","yield"]),
    rust: new Set(["as","break","const","continue","crate","else","enum","extern","false","fn","for","if","impl","in","let","loop","match","mod","move","mut","pub","ref","return","self","Self","static","struct","super","trait","true","type","unsafe","use","where","while"]),
    html: new Set(["html","head","body","div","span","p","a","img","video","audio","script","style","link","meta","form","input","button","table","tr","td","th","ul","ol","li","section","article","header","footer","nav","main"]),
    bash: new Set(["if","then","else","elif","fi","for","while","do","done","case","esac","function","in","select","until","break","continue","return","export","readonly","local","declare"]),
    markdown: new Set(["#","##","###","####","#####","######"])
  };

  if (!lang || lang === "txt" || lang === "text" || lang === "plaintext") {
    return {
      codeBlock: [{ codeContent: code, highlightType: 0 }],
      unified_codeBlock: [{ content: code, type: "DEFAULT" }]
    };
  }

  const keywords = keywordsMap[lang.toLowerCase()] || new Set();
  const tokens = [];
  let i = 0;

  const push = (content, type) => {
    if (!content) return;
    const last = tokens[tokens.length - 1];
    if (last && last.highlightType === type) last.codeContent += content;
    else tokens.push({ codeContent: content, highlightType: type });
  };

  const isIdentifier = (char) => {
    if (lang === "css") return /[a-zA-Z0-9_$-]/.test(char);
    if (lang === "html") return /[a-zA-Z0-9_$:-]/.test(char);
    return /[a-zA-Z0-9_$]/.test(char);
  };

  while (i < code.length) {
    const c = code[i];
    if (/\s/.test(c)) {
      const s = i;
      while (i < code.length && /\s/.test(code[i])) i++;
      push(code.slice(s, i), 0);
      continue;
    }
    if ((c === "/" && code[i + 1] === "/") || (c === "#" && ["python", "bash"].includes(lang))) {
      const s = i;
      while (i < code.length && code[i] !== "\n") i++;
      push(code.slice(s, i), 5);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const s = i; const q = c; i++;
      while (i < code.length) {
        if (code[i] === "\\" && i + 1 < code.length) i += 2;
        else if (code[i] === q) { i++; break; }
        else i++;
      }
      push(code.slice(s, i), 3);
      continue;
    }
    if (/[0-9]/.test(c)) {
      const s = i;
      while (i < code.length && /[0-9._]/.test(code[i])) i++;
      push(code.slice(s, i), 4);
      continue;
    }
    if (/[a-zA-Z_$]/.test(c)) {
      const s = i;
      while (i < code.length && isIdentifier(code[i])) i++;
      const word = code.slice(s, i);
      let type = 0;
      if (keywords.has(word)) {
        type = 1;
      } else if (lang === "css") {
        let j = i;
        while (j < code.length && /\s/.test(code[j])) j++;
        if (code[j] === ":") type = 1;
      } else if (lang === "html") {
        let p = s - 1;
        while (p >= 0 && /\s/.test(code[p])) p--;
        if (code[p] === "<" || (code[p] === "/" && code[p - 1] === "<")) type = 1;
      }
      if (type === 0) {
        let j = i;
        while (j < code.length && /\s/.test(code[j])) j++;
        if (code[j] === "(") type = 2;
      }
      push(word, type);
      continue;
    }
    push(c, 0);
    i++;
  }
  return {
    codeBlock: tokens,
    unified_codeBlock: tokens.map(t => ({ content: t.codeContent, type: RICH_TYPE_MAP[t.highlightType] ?? "DEFAULT" }))
  };
}

function aiRichTable(arr, { hyperlink = true, citation = true, latex = true } = {}) {
  if (!Array.isArray(arr) || !arr.every(row => Array.isArray(row) && row.every(cell => typeof cell === "string"))) {
    throw new TypeError("Table must be a nested array of strings");
  }
  const [header, ...rows] = arr;
  const maxLen = Math.max(header.length, ...rows.map(r => r.length));
  const normalize = (r) => [...r, ...Array(maxLen - r.length).fill("")];

  const unified_rows = [
    { is_header: true, cells: normalize(header) },
    ...rows.map(r => ({ is_header: false, cells: normalize(r) }))
  ].map(row => {
    const markdown_cells = row.cells.map(cell => {
      const ex = extractIE(cell, { hyperlink, citation, latex });
      return { text: ex.text, ...(ex.inline_entities.length ? { inline_entities: ex.inline_entities } : {}) };
    });
    return { ...row, ...(markdown_cells.some(c => c.inline_entities?.length) ? { markdown_cells } : {}) };
  });

  const rowsMeta = unified_rows.map(r => ({
    items: r.cells,
    ...(r.is_header ? { isHeading: true } : {})
  }));

  return { title: "", rows: rowsMeta, unified_rows };
}

function newRichLayout(name, data, extra = {}) {
  return {
    ...extra,
    view_model: {
      [Array.isArray(data) ? "primitives" : "primitive"]: data,
      __typename: `GenAI${name}LayoutViewModel`
    }
  };
}

async function waitAllPromises(input) {
  const isPromise = v => v && typeof v.then === "function";
  const isObject = v => v && typeof v === "object";
  const deep = async (v) => {
    if (isPromise(v)) return deep(await v);
    if (Array.isArray(v)) return Promise.all(v.map(deep));
    if (isObject(v)) {
      const entries = await Promise.all(Object.entries(v).map(async ([k, val]) => [k, await deep(val)]));
      return Object.fromEntries(entries);
    }
    return v;
  };
  return deep(await input);
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

  sock.sendAiRich = async (jid, data = {}, options = {}) => {
    const {
      disclaimer = "",
      sources = [],
      submessages = [],
      footer = "",
      unifiedData = null,
      forwarded = true
    } = data;

    const metadataSources = sources.map((s, i) => ({
      provider: s.provider || s.title || "Bot",
      thumbnailCDNURL: s.thumbnailUrl || "",
      sourceProviderURL: s.providerUrl || s.url || "",
      sourceQuery: s.query || "",
      faviconCDNURL: s.faviconUrl || "",
      citationNumber: s.citationNumber ?? i + 1,
      sourceTitle: s.title || "Source"
    }));

    const extraRichSources = [];
    const builtSubmessages = [];
    const sections = [];

    for (const s of submessages) {
      switch (s.type) {

        case "text": {
          const { text: t, inline_entities } = extractIE(s.text || "");
          builtSubmessages.push({ messageType: 2, messageText: t });
          sections.push(newRichLayout("Single", {
            text: t,
            ...(inline_entities.length ? { inline_entities } : {}),
            __typename: "GenAIMarkdownTextUXPrimitive"
          }));
          break;
        }

        case "code": {
          const lang = s.language || "javascript";
          let meta;
          if (s.code) {
            meta = aiRichTokenizer(s.code, lang);
          } else {
            const blocks = (s.blocks || []).map(b => ({
              codeContent: b.codeContent ?? b.content ?? "",
              highlightType: b.highlightType ?? 0
            }));
            meta = {
              codeBlock: blocks,
              unified_codeBlock: blocks.map(b => ({ content: b.codeContent, type: RICH_TYPE_MAP[b.highlightType] ?? "DEFAULT" }))
            };
          }
          builtSubmessages.push({ messageType: 5, codeMetadata: { codeLanguage: lang, codeBlocks: meta.codeBlock } });
          sections.push(newRichLayout("Single", { language: lang, code_blocks: meta.unified_codeBlock, __typename: "GenAICodeUXPrimitive" }));
          break;
        }

        case "table": {
          let rows, unified_rows;
          if (Array.isArray(s.rows) && s.rows.every(r => Array.isArray(r) && r.every(c => typeof c === "string"))) {
            const meta = aiRichTable(s.rows);
            rows = meta.rows;
            unified_rows = meta.unified_rows;
          } else {
            rows = (s.rows || []).map(r => {
              if (Array.isArray(r)) return { items: r, isHeading: false };
              return { items: r.items ?? r.cells ?? [], isHeading: r.isHeading ?? r.header ?? false };
            });
            unified_rows = rows.map(r => ({ is_header: r.isHeading || false, cells: r.items }));
          }
          builtSubmessages.push({ messageType: 4, tableMetadata: { title: s.title || "", rows } });
          sections.push(newRichLayout("Single", { rows: unified_rows, __typename: "GenATableUXPrimitive" }));
          break;
        }

        case "image":
        case "grid": {
          let list;
          if (s.images) {
            list = s.images.map(img => ({
              imagePreviewUrl: img.previewUrl || img.url || "",
              imageHighResUrl: img.highResUrl || img.previewUrl || img.url || "",
              sourceUrl: img.sourceUrl || img.url || ""
            }));
          } else {
            const urls = Array.isArray(s.url) ? s.url : [s.url].filter(Boolean);
            list = urls.map(u => ({ imagePreviewUrl: u, imageHighResUrl: u, sourceUrl: u }));
          }
          builtSubmessages.push({
            messageType: 1,
            gridImageMetadata: {
              gridImageUrl: { imagePreviewUrl: s.previewUrl || list[0]?.imagePreviewUrl || "" },
              imageUrls: list
            }
          });
          list.forEach(img => sections.push(newRichLayout("Single", {
            media: { url: img.imagePreviewUrl, mime_type: "image/jpeg" },
            imagine_type: 3,
            status: { status: "READY" },
            __typename: "GenAIImaginePrimitive"
          })));
          break;
        }

        case "video": {
          const isObj = s.url && typeof s.url === "object" && !Array.isArray(s.url);
          const videoUrl = isObj ? (s.url.url || "") : (s.url || "");
          const fileLength = isObj ? (s.url.file_length ?? 0) : (s.fileLength ?? 0);
          const duration = isObj ? (s.url.duration ?? 0) : (s.duration ?? 0);
          const thumbnail = isObj ? (s.url.thumbnail || null) : (s.thumbnail || null);
          builtSubmessages.push({ messageType: 2, messageText: "[ CANNOT_LOAD_VIDEO ]" });
          sections.push(newRichLayout("Single", {
            media: { url: videoUrl, mime_type: isObj ? (s.url.mime_type ?? "video/mp4") : "video/mp4", file_length: fileLength, duration },
            imagine_type: "ANIMATE",
            status: { status: "READY" },
            ...(thumbnail ? { thumbnail: { raw_media: thumbnail } } : {}),
            __typename: "GenAIImaginePrimitive"
          }));
          break;
        }

        case "reels": {
          const items = (s.items || []).map(item => ({
            title: item.title || item.username || "",
            profileIconUrl: item.profileIconUrl || item.avatarUrl || item.profile || "",
            thumbnailUrl: item.thumbnailUrl || item.thumbnail || "",
            videoUrl: item.videoUrl || item.url || "",
            reelsTitle: item.reels_title || item.reelsTitle || item.title || "",
            likesCount: item.likes_count ?? item.like ?? 0,
            sharesCount: item.shares_count ?? item.share ?? 0,
            viewCount: item.view_count ?? item.view ?? 0,
            reelSource: item.reel_source || item.source || "IG",
            isVerified: !!(item.is_verified || item.verified)
          }));
          builtSubmessages.push({
            messageType: 9,
            contentItemsMetadata: {
              contentType: 1,
              itemsMetadata: items.map(item => ({
                reelItem: {
                  title: item.title,
                  profileIconUrl: item.profileIconUrl,
                  thumbnailUrl: item.thumbnailUrl,
                  videoUrl: item.videoUrl
                }
              }))
            }
          });
          items.forEach((item, idx) => extraRichSources.push({
            provider: "Bot",
            thumbnailCDNURL: item.thumbnailUrl,
            sourceProviderURL: item.videoUrl,
            sourceQuery: "",
            faviconCDNURL: item.profileIconUrl,
            citationNumber: idx + 1,
            sourceTitle: item.title
          }));
          sections.push(newRichLayout("HScroll", items.map(item => ({
            reels_url: item.videoUrl,
            thumbnail_url: item.thumbnailUrl,
            creator: item.title,
            avatar_url: item.profileIconUrl,
            reels_title: item.reelsTitle,
            likes_count: item.likesCount,
            shares_count: item.sharesCount,
            view_count: item.viewCount,
            reel_source: item.reelSource,
            is_verified: item.isVerified,
            __typename: "GenAIReelPrimitive"
          }))));
          break;
        }

        case "tip": {
          builtSubmessages.push({ messageType: 2, messageText: s.text || "" });
          sections.push(newRichLayout("Single", { text: s.text || "", __typename: "GenAIMetadataTextPrimitive" }));
          break;
        }

        case "suggest": {
          const texts = Array.isArray(s.text) ? s.text : [s.text || s.suggest].filter(Boolean);
          const primitives = texts.map(t => ({
            prompt_text: t,
            prompt_type: "SUGGESTED_PROMPT",
            __typename: "GenAIFollowUpSuggestionPillPrimitive"
          }));
          const layout = s.layout ?? (primitives.length === 1 ? "Single" : s.scroll !== false ? "HScroll" : "ActionRow");
          sections.push(newRichLayout(layout, layout === "Single" ? primitives[0] : primitives, { __typename: "GenAIUnifiedResponseSection" }));
          break;
        }

        case "source": {
          let srcList = s.sources || [];
          if (srcList.every(v => typeof v === "string")) srcList = [srcList];
          sections.push(newRichLayout("Single", {
            sources: srcList.map(([icon, url, text]) => ({
              source_type: "THIRD_PARTY",
              source_display_name: text ?? "",
              source_subtitle: "AI",
              source_url: url ?? "",
              favicon: { url: icon ?? "", mime_type: "image/jpeg", width: 16, height: 16 }
            })),
            __typename: "GenAISearchResultPrimitive"
          }));
          break;
        }

        case "product": {
          const isArray = Array.isArray(s.data);
          const items = isArray ? s.data : [s.data ?? s].filter(v => v?.title);
          const primitives = items.map(item => ({
            title: item.title,
            brand: item.brand,
            price: item.price,
            sale_price: item.sale_price || item.salePrice,
            product_url: item.product_url || item.url,
            image: { url: item.image_url || item.imageUrl || item.image || "" },
            additional_images: [{ url: item.icon_url || item.iconUrl || item.icon || "" }],
            __typename: "GenAIProductItemCardPrimitive"
          }));
          builtSubmessages.push({ messageType: 2, messageText: "[ CANNOT_LOAD_PRODUCT ]" });
          sections.push(newRichLayout(isArray ? "HScroll" : "Single", isArray ? primitives : primitives[0]));
          break;
        }

        case "post": {
          const isArray = Array.isArray(s.data);
          const items = isArray ? s.data : [s.data ?? s];
          const primitives = items.map(p => ({
            title: p.title ?? "",
            subtitle: p.subtitle ?? "",
            username: p.username ?? "",
            profile_picture_url: p.profile_picture_url || p.profileUrl || p.profile || "",
            is_verified: !!(p.is_verified || p.verified),
            thumbnail_url: p.thumbnail_url || p.thumbnail || "",
            post_caption: p.post_caption || p.caption || "",
            likes_count: p.likes_count ?? p.likes ?? 0,
            comments_count: p.comments_count ?? p.comments ?? 0,
            shares_count: p.shares_count ?? p.shares ?? 0,
            post_url: p.post_url || p.url || "",
            post_deeplink: p.post_deeplink || p.deeplink || "",
            source_app: p.source_app || p.source || "INSTAGRAM",
            footer_label: p.footer_label || p.footer || "",
            footer_icon: p.footer_icon || p.icon || "",
            is_carousel: items.length > 1,
            orientation: p.orientation ?? "LANDSCAPE",
            post_type: p.post_type ?? "VIDEO",
            __typename: "GenAIPostPrimitive"
          }));
          builtSubmessages.push({ messageType: 2, messageText: "[ CANNOT_LOAD_POST ]" });
          sections.push(newRichLayout("HScroll", primitives));
          break;
        }

        default:
          builtSubmessages.push(s);
          break;
      }
    }

    if (footer) sections.push(newRichLayout("Single", { text: footer, __typename: "GenAIMetadataTextPrimitive" }));

    const allRichSources = [...metadataSources, ...extraRichSources];

    const botMetadata = {};
    if (disclaimer) botMetadata.messageDisclaimerText = disclaimer;
    if (allRichSources.length) botMetadata.richResponseSourcesMetadata = { sources: allRichSources };

    const forwardInfo = forwarded
      ? { forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: "0@bot" }, forwardOrigin: 4 }
      : {};

    const quotedInfo = {};
    if (options.quoted?.key) {
      quotedInfo.stanzaId = options.quoted.key.id;
      quotedInfo.participant = options.quoted.key.participant || options.quoted.key.remoteJid;
      quotedInfo.quotedType = 0;
      quotedInfo.quotedMessage = options.quoted.message || { conversation: "" };
    }

    const contextInfo = { ...forwardInfo, ...quotedInfo };

    let unifiedResponse;
    if (unifiedData) {
      unifiedResponse = { data: unifiedData };
    } else {
      const resolvedSections = await waitAllPromises(sections);
      unifiedResponse = {
        data: Buffer.from(JSON.stringify({
          response_id: randomBytes(16).toString("hex"),
          sections: resolvedSections
        })).toString("base64")
      };
    }

    return sock.relayMessage(jid, {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        ...(Object.keys(botMetadata).length ? { botMetadata } : {})
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            submessages: builtSubmessages,
            unifiedResponse,
            contextInfo
          }
        }
      }
    }, {});
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
