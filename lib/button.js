import * as baileys from "baileys";
import { randomUUID } from "node:crypto";

const { prepareWAMessageMedia, generateWAMessageFromContent } = baileys;

const INTERACTIVE_NODES = [
  {
    tag: "biz",
    attrs: {},
    content: [
      {
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }]
      }
    ]
  }
];

const AI_NODES = [{ tag: "bot", attrs: { biz_bot: "1" } }];

function toNativeFlow(button) {
  if (button?.name && button?.buttonParamsJson) return button;
  switch (button.type) {
    case "url":
      return {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: button.text,
          url: button.url,
          merchant_url: button.url
        })
      };
    case "copy":
      return {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: button.text,
          id: button.id || button.copy,
          copy_code: button.copy
        })
      };
    case "call":
      return {
        name: "cta_call",
        buttonParamsJson: JSON.stringify({
          display_text: button.text,
          phone_number: button.phone
        })
      };
    case "list":
      return {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: button.text || "Menu",
          sections: (button.sections || []).map((section) => ({
            title: section.title,
            rows: (section.rows || []).map((row) => ({
              header: row.header || "",
              title: row.title,
              description: row.description || "",
              id: row.id || row.title
            }))
          }))
        })
      };
    case "flow":
      return {
        name: button.name,
        buttonParamsJson: JSON.stringify(button.params || {})
      };
    case "reply":
    default:
      return {
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: button.text,
          id: button.id || button.text
        })
      };
  }
}

const normalizeButtons = (list = []) => list.map(toNativeFlow);

function detectMime(src) {
  if (!src) return null;
  if (src.thumbnail) return "thumbnail";
  if (src.image) return "image";
  if (src.video) return "video";
  if (src.document) return "document";
  return null;
}

async function resolveMedia(sock, content, mime) {
  if (!mime) return {};
  const asSource = (v) => (typeof v === "string" ? { url: v } : v);

  if (mime === "thumbnail") {
    const media = await prepareWAMessageMedia(
      { image: asSource(content.thumbnail) },
      { upload: sock.waUploadToServer }
    );
    return { hasMediaAttachment: true, imageMessage: media.imageMessage };
  }

  const payload = { [mime]: asSource(content[mime]) };
  if (mime === "document") {
    if (content.jpegThumbnail) payload.jpegThumbnail = content.jpegThumbnail;
    if (content.mimetype) payload.mimetype = content.mimetype;
    if (content.fileName) payload.fileName = content.fileName;
  }

  const media = await prepareWAMessageMedia(payload, { upload: sock.waUploadToServer });
  const key = `${mime}Message`;
  if (mime === "document" && content.fileName) media[key].fileName = content.fileName;
  if (mime === "document" && content.mimetype) media[key].mimetype = content.mimetype;
  return { hasMediaAttachment: true, [key]: media[key] };
}

async function resolveExternalAd(content, ctxRaw) {
  const extAd = content.externalAdReply || ctxRaw.externalAdReply || null;
  if (extAd?.thumbnailUrl && !extAd.jpegThumbnail) {
    try {
      const r = await fetch(extAd.thumbnailUrl);
      extAd.jpegThumbnail = Buffer.from(await r.arrayBuffer());
    } catch {
      /* leave thumbnail unset */
    }
  }
  return extAd;
}

async function fetchThumb(src) {
  if (!src) return undefined;
  if (Buffer.isBuffer(src)) return src;
  if (typeof src === "string") {
    try {
      const r = await fetch(src);
      return Buffer.from(await r.arrayBuffer());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function buildLocation(sock, jid, content, options, contextInfo) {
  const thumb = await fetchThumb(content.thumbnail || content.image);
  const loc = content.location || {};
  const buttons = (content.buttons || []).map((b) =>
    b.buttonId
      ? b
      : {
          buttonId: b.id || b.text || randomUUID(),
          buttonText: { displayText: b.text || b.displayText || "" },
          type: 1
        }
  );

  return generateWAMessageFromContent(
    jid,
    {
      buttonsMessage: {
        contentText: content.body || content.text || content.caption || "",
        footerText: content.footer || "",
        headerType: 6,
        locationMessage: {
          degreesLatitude: loc.latitude ?? loc.degreesLatitude ?? 0,
          degreesLongitude: loc.longitude ?? loc.degreesLongitude ?? 0,
          name: content.title || loc.name || "",
          address: content.subtitle || loc.address || "",
          jpegThumbnail: thumb
        },
        viewOnce: true,
        contextInfo,
        buttons
      }
    },
    { userJid: sock.user?.id, ...options }
  );
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function bindButton(sock) {
  sock.sendButton = async (jid, content = {}, options = {}) => {
    if (content.viewOnceMessage?.message?.interactiveMessage) {
      content = content.viewOnceMessage.message.interactiveMessage;
    } else if (content.interactiveMessage) {
      content = content.interactiveMessage;
    }

    const ctxRaw = content.contextInfo || {};
    const extAd = await resolveExternalAd(content, ctxRaw);
    const contextInfo = {
      mentionedJid: content.mentions || ctxRaw.mentionedJid || [],
      ...ctxRaw,
      ...(extAd ? { externalAdReply: extAd } : {})
    };

    const additionalNodes = content.ai === true ? [...INTERACTIVE_NODES, ...AI_NODES] : INTERACTIVE_NODES;

    if (content.location) {
      const msg = await buildLocation(sock, jid, content, options, contextInfo);
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes });
      return msg;
    }

    if (Array.isArray(content.cards) && content.cards.length > 0) {
      const cards = [];
      for (const card of content.cards) {
        const mime = detectMime(card);
        const header = await resolveMedia(sock, card, mime);
        cards.push({
          header: { title: card.title || "", ...header },
          body: { text: card.caption || card.body || card.text || "" },
          footer: { text: card.footer || "" },
          nativeFlowMessage: { buttons: normalizeButtons(card.buttons), messageVersion: 1 }
        });
      }

      const carouselHeaderTitle = isObj(content.header)
        ? (content.header.title || "")
        : (content.header || content.title || "");
      const carouselBody = isObj(content.body)
        ? (content.body.text || "")
        : (content.body || content.text || content.caption || "");
      const carouselFooter = isObj(content.footer)
        ? (content.footer.text || "")
        : (content.footer || "");

      const carousel = {
        header: { title: carouselHeaderTitle },
        body: { text: carouselBody },
        footer: { text: carouselFooter },
        contextInfo,
        carouselMessage: { cards, messageVersion: 1, carouselCardType: 1 }
      };

      const msg = generateWAMessageFromContent(
        jid,
        { interactiveMessage: carousel },
        { userJid: sock.user?.id, ...options }
      );
      await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes });
      return msg;
    }

    const isStructured = isObj(content.header) || isObj(content.body) || isObj(content.footer);

    let interactive;

    if (isStructured) {
      const rawNativeFlow = content.nativeFlowMessage || null;
      const rawButtons = rawNativeFlow?.buttons || content.buttons || [];
      const buttons = normalizeButtons(rawButtons);

      let nativeFlow = { buttons };
      if (rawNativeFlow) {
        const { buttons: _b, ...rest } = rawNativeFlow;
        nativeFlow = { ...nativeFlow, ...rest };
      }

      interactive = {
        header: isObj(content.header) ? content.header : { title: content.header || "" },
        body: isObj(content.body) ? content.body : { text: content.body || "" },
        footer: isObj(content.footer) ? content.footer : { text: content.footer || "" },
        nativeFlowMessage: nativeFlow,
        contextInfo
      };
    } else {
      const mime = detectMime(content);
      const header = await resolveMedia(sock, content, mime);

      const rawNativeFlow = content.nativeFlowMessage || null;
      const buttons = normalizeButtons(
        rawNativeFlow?.buttons || content.buttons || content.interactiveButtons || []
      );
      let nativeFlow = { buttons };
      if (rawNativeFlow) {
        const { buttons: _b, ...rest } = rawNativeFlow;
        nativeFlow = { ...nativeFlow, ...rest };
      }

      interactive = {
        header: {
          title: content.header || content.title || "",
          subtitle: content.subtitle || "",
          ...header
        },
        body: { text: content.body || content.text || content.caption || "" },
        footer: { text: content.footer || "" },
        nativeFlowMessage: nativeFlow,
        contextInfo
      };
    }

    const msg = generateWAMessageFromContent(
      jid,
      { interactiveMessage: interactive },
      { userJid: sock.user?.id, ...options }
    );
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes });
    return msg;
  };

  return sock;
}

export default bindButton;
