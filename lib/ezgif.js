import * as cheerio from "cheerio";

const BASE = "https://ezgif.com";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const OUTPUT_URL = /\/\/s\d+\.ezgif\.com\/tmp\/[^\s"'<>]+/gi;

/**
 * Upload a buffer to a tool and return its server-side token.
 * @param {string} tool ezgif tool slug, e.g. "webp-to-jpg".
 * @param {Buffer} buffer Source media.
 * @param {string} filename Original-ish filename (extension matters to ezgif).
 * @param {string} mime Content type for the upload part.
 * @returns {Promise<string>} The token (e.g. "ezgif-66bd….webp").
 */
async function upload(tool, buffer, filename, mime) {
  const form = new FormData();
  form.append("new-image", new Blob([buffer], { type: mime }), filename);
  form.append("new-image-url", "");
  form.append("upload", "Upload!");

  const res = await fetch(`${BASE}/${tool}`, {
    method: "POST",
    body: form,
    redirect: "manual",
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(60_000)
  });

  const location = res.headers.get("location");
  if (!location) {
    throw new Error(`ezgif ${tool}: upload rejected (HTTP ${res.status})`);
  }
  // .../{tool}/{token}.html  ->  {token}
  return location.split(`/${tool}/`)[1].replace(/\.html$/, "");
}

/**
 * Run the conversion step and return the absolute output media URL.
 * @param {string} tool
 * @param {string} token
 * @param {Record<string, string|number>} fields Tool parameters.
 * @param {string[]} [exts] Accepted output extensions, in priority order.
 * @returns {Promise<string>}
 */
async function convert(tool, token, fields, exts) {
  const form = new FormData();
  form.append("file", token);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  form.append("ajax", "true");

  const res = await fetch(`${BASE}/${tool}/${token}?ajax=true`, {
    method: "POST",
    body: form,
    headers: {
      "User-Agent": UA,
      Origin: BASE,
      Referer: `${BASE}/${tool}/${token}.html`
    },
    signal: AbortSignal.timeout(180_000)
  });

  const html = await res.text();
  if (!res.ok) {
    throw new Error(`ezgif ${tool}: convert failed (HTTP ${res.status})`);
  }

  // The fragment only contains the produced-media block, so any storage-node
  // URL it carries is an output. Collect candidates from the markup and pick
  // the one whose extension the caller asked for.
  const $ = cheerio.load(html);
  const urls = new Set();
  $(".outfile img, .outfile source, .outfile video, .outfile a").each((_, el) => {
    const u = $(el).attr("src") || $(el).attr("href");
    if (u) urls.add(u);
  });
  for (const u of html.match(OUTPUT_URL) || []) urls.add(u);

  const candidates = [...urls];
  const wanted =
    exts && exts.length
      ? candidates.find((u) => exts.some((e) => u.toLowerCase().includes(`.${e}`)))
      : candidates[0];

  if (!wanted) throw new Error(`ezgif ${tool}: no output in response`);
  return wanted.startsWith("http") ? wanted : `https:${wanted}`;
}

/**
 * Fetch a produced file as a Buffer.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
async function download(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(60_000)
  });
  if (!res.ok) throw new Error(`ezgif: download failed (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Full upload → convert → download round-trip against an ezgif tool.
 *
 * @param {object} opts
 * @param {string} opts.tool ezgif tool slug.
 * @param {Buffer} opts.buffer Source media.
 * @param {string} opts.filename Upload filename (extension is significant).
 * @param {string} opts.mime Upload content type.
 * @param {Record<string, string|number>} opts.fields Conversion parameters.
 * @param {string[]} [opts.exts] Accepted output extensions, priority order.
 * @returns {Promise<Buffer>} The converted media.
 */
export async function ezgifConvert({ tool, buffer, filename, mime, fields, exts }) {
  const token = await upload(tool, buffer, filename, mime);
  const url = await convert(tool, token, fields, exts);
  return download(url);
}

export default { ezgifConvert };
