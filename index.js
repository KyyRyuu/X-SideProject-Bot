import { join } from "node:path";
import * as baileys from "baileys";

import settings from "./settings.js";
import { createLogger } from "./lib/logger.js";
import { createCache } from "./lib/cache.js";
import { createStore } from "./lib/store.js";
import { createContactBook } from "./src/fetchContact.js";
import { createDatabase } from "./lib/database.js";
import { createRegistry } from "./lib/plugins.js";
import { createReloader } from "./lib/reload.js";
import { createSocket } from "./lib/baileys.js";
import { createHandler } from "./lib/handler.js";
import { createGroup } from "./lib/group.js";
import converter from "./lib/converter.js";
import { sleep } from "./lib/helper.js";

const { DisconnectReason } = baileys;

const logger = createLogger({ level: settings.logger.level });
const baileysLogger = createLogger({ level: settings.logger.baileysLevel }).child({ module: "baileys" });

const retryCache = createCache({ ttl: 3600, max: 5000 });
const contacts = createContactBook({
  contactsPath: join(process.cwd(), "database", "contact.json"),
  logger: logger.child({ module: "contacts" })
});
const store = createStore({ logger: logger.child({ module: "store" }), contacts });
const db = createDatabase(settings.database, logger.child({ module: "db" }));
const registry = createRegistry({ dir: join(process.cwd(), "plugins"), logger: logger.child({ module: "plugins" }) });

let reconnectAttempts = 0;
let shuttingDown = false;

async function onParticipantsUpdate(sock, { id, participants, action }) {
  store.invalidateGroup(id);
  const config = db.group(id);
  if (!config.welcome) return;
  const verb = action === "add" ? "joined" : action === "remove" ? "left" : null;
  if (!verb) return;
  for (const jid of participants) {
    await sock.sendMessage(id, { text: `@${jid.split("@")[0]} ${verb} the group.`, mentions: [jid] }).catch(() => {});
  }
}

async function connect() {
  const { sock, saveCreds } = await createSocket({ settings, logger, baileysLogger, store, retryCache });
  store.bind(sock.ev);

  const group = createGroup(sock, store);
  const handle = createHandler({ sock, settings, logger, store, db, registry, converter, group });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) await handle(message);
  });

  sock.ev.on("group-participants.update", (event) => onParticipantsUpdate(sock, event));

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && settings.connection.printQR) {
      logger.info("QR received. If it did not render above, set connection.usePairingCode: true in settings.js to log in with an 8-digit code instead.");
    }

    if (connection === "open") {
      reconnectAttempts = 0;
      logger.info(`connected as ${sock.user?.name || sock.user?.id}`);
      // Resolve address-book contacts to numbers (deduped, persisted). Groups are not harvested.
      contacts.sync(sock).catch((error) => logger.error(error, "contact sync failed"));
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reasonName = Object.keys(DisconnectReason).find((k) => DisconnectReason[k] === statusCode) || "unknown";
      logger.warn(`connection closed (${statusCode} ${reasonName})`);

      const stop =
        statusCode === DisconnectReason.loggedOut ||
        statusCode === DisconnectReason.connectionReplaced ||
        statusCode === DisconnectReason.forbidden ||
        statusCode === DisconnectReason.multideviceMismatch;

      if (shuttingDown) return;

      if (stop) {
        logger.error(`not reconnecting (${reasonName}). Delete sessions/${settings.sessionName} and re-pair if needed.`);
        return;
      }

      const delay = Math.min(
        settings.connection.reconnectDelay * 2 ** reconnectAttempts,
        settings.connection.maxReconnectDelay
      );
      reconnectAttempts++;
      logger.info(`reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
      await sleep(delay);
      connect().catch((error) => logger.error(error, "reconnect failed"));
    }
  });

  return sock;
}

async function main() {
  logger.info(`starting ${settings.botName} on Baileys v7`);

  await db.init();
  await contacts.load();
  await registry.loadAll();
  createReloader({ dir: join(process.cwd(), "plugins"), registry, logger: logger.child({ module: "reload" }) }).start();

  await connect();
}

process.on("uncaughtException", (error) => logger.error(error, "uncaughtException"));
process.on("unhandledRejection", (reason) => logger.error(reason, "unhandledRejection"));

const shutdown = async (signal) => {
  shuttingDown = true;
  logger.info(`received ${signal}, flushing database`);
  await db.save();
  await contacts.save();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((error) => {
  logger.fatal(error, "fatal startup error");
  process.exit(1);
});
