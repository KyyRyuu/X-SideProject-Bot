import * as baileys from "baileys";

const {
  downloadMediaMessage,
  getContentType,
  extractMessageContent,
  normalizeMessageContent,
  generateWAMessageFromContent,
  proto
} = baileys;

/** Every concrete message container key Baileys may surface, newest first. */
export const MESSAGE_TYPES = [
  "conversation",
  "extendedTextMessage",
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "documentMessage",
  "documentWithCaptionMessage",
  "stickerMessage",
  "contactMessage",
  "contactsArrayMessage",
  "locationMessage",
  "liveLocationMessage",
  "reactionMessage",
  "pollCreationMessage",
  "pollCreationMessageV2",
  "pollCreationMessageV3",
  "pollUpdateMessage",
  "eventMessage",
  "protocolMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "ephemeralMessage",
  "editedMessage",
  "interactiveMessage",
  "interactiveResponseMessage",
  "templateMessage",
  "templateButtonReplyMessage",
  "buttonsMessage",
  "buttonsResponseMessage",
  "listMessage",
  "listResponseMessage",
  "productMessage",
  "orderMessage"
];

/** Media container types that can be downloaded. */
export const MEDIA_TYPES = new Set([
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "documentMessage",
  "stickerMessage"
]);

/**
 * Unwrap ephemeral / view-once / edited / device wrappers to the inner content.
 * @param {import("baileys").WAMessageContent} content
 * @returns {import("baileys").WAMessageContent | undefined}
 */
export function unwrap(content) {
  return extractMessageContent(normalizeMessageContent(content));
}

/**
 * Resolve the active content type key for a message.
 * @param {import("baileys").WAMessageContent} content
 * @returns {string | undefined}
 */
export function typeOf(content) {
  return getContentType(unwrap(content));
}

/**
 * Extract the readable text from any message content.
 * @param {import("baileys").WAMessageContent} content
 * @returns {string}
 */
export function textOf(content) {
  const inner = unwrap(content);
  if (!inner) return "";
  const type = getContentType(inner);
  const node = inner[type];
  if (typeof node === "string") return node;
  return (
    node?.text ||
    node?.caption ||
    node?.contentText ||
    node?.selectedDisplayText ||
    node?.name ||
    node?.singleSelectReply?.selectedRowId ||
    node?.selectedButtonId ||
    node?.nativeFlowResponseMessage?.paramsJson ||
    ""
  );
}

/**
 * Download the media buffer from a message.
 * @param {import("baileys").WAMessage | import("baileys").WAMessageContent} message
 * @param {object} [options]
 * @param {import("./logger.js").Logger} [options.logger]
 * @param {import("baileys").WASocket} [options.sock] Enables media-retry reupload.
 * @returns {Promise<Buffer>}
 */
export async function download(message, options = {}) {
  const full = message?.message ? message : { message };
  return downloadMediaMessage(
    full,
    "buffer",
    {},
    {
      logger: options.logger,
      reuploadRequest: options.sock?.updateMediaMessage
    }
  );
}

export { generateWAMessageFromContent, proto, getContentType };
