import { join } from "node:path";
import * as baileys from "baileys";
import { bindButton } from "./button.js";
import { bindWrapper } from "./wrapper.js";

const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, Browsers } =
  baileys;

export async function createSocket({ settings, logger, baileysLogger, store, retryCache }) {
  const sessionPath = join(process.cwd(), "sessions", settings.sessionName);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  let version;
  if (Array.isArray(settings.version)) {
    version = settings.version;
  } else {
    const latest = await fetchLatestBaileysVersion();
    version = latest.version;
    logger.info(`using WhatsApp Web version ${version.join(".")}`);
  }

  const usePairing = settings.connection.usePairingCode && !state.creds.registered;

  const sock = makeWASocket({
    version,
    logger: baileysLogger,
    printQRInTerminal: !usePairing && settings.connection.printQR,
    browser: usePairing ? Browsers.ubuntu("Chrome") : settings.connection.browser,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger)
    },
    markOnlineOnConnect: settings.connection.markOnlineOnConnect,
    syncFullHistory: settings.connection.syncFullHistory,
    generateHighQualityLinkPreview: true,
    msgRetryCounterCache: retryCache,
    getMessage: (key) => store.getMessage(key),
    cachedGroupMetadata: (jid) => store.getGroupMetadata(jid)
  });

  bindButton(sock);
  bindWrapper(sock);

  if (usePairing) {
    const number = settings.connection.pairingNumber.replace(/\D/g, "");
    if (number.length < 8) {
      logger.error("connection.pairingNumber is invalid. Use full international format, digits only (e.g. 6281234567890).");
    } else {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(number);
          const formatted = code.match(/.{1,4}/g)?.join("-") || code;
          logger.info(`pairing code for +${number}: ${formatted}`);
          logger.info("On the SAME phone: WhatsApp > Linked devices > Link a device > Link with phone number > enter the code.");
        } catch (error) {
          logger.error(error, "failed to request pairing code");
        }
      }, 3000);
    }
  }

  return { sock, saveCreds };
}

export { baileys };
