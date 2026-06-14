import { normalize, isGroup } from "./jid.js";

export class Store {
  constructor(options = {}) {
    this.maxMessagesPerChat = options.maxMessagesPerChat ?? 200;
    this.groupTtl = options.groupTtl ?? 5 * 60 * 1000;
    this.logger = options.logger;

    /** @type {Map<string, Map<string, import("baileys").WAMessage>>} */
    this.messages = new Map();
    /** @type {Map<string, object>} */
    this.contacts = new Map();
    /** @type {Map<string, object>} */
    this.chats = new Map();
    /** @type {Map<string, { metadata: object, expires: number }>} */
    this._groups = new Map();
    /** @type {Map<string, object>} */
    this.presences = new Map();
  }

  get groupMetadata() {
    const groups = this._groups;
    return {
      *values() {
        for (const entry of groups.values()) yield entry.metadata;
      }
    };
  }

  upsertMessage(message) {
    const jid = normalize(message?.key?.remoteJid);
    if (!jid || !message?.key?.id) return;
    let chat = this.messages.get(jid);
    if (!chat) {
      chat = new Map();
      this.messages.set(jid, chat);
    }
    chat.set(message.key.id, message);
    if (chat.size > this.maxMessagesPerChat) {
      const oldest = chat.keys().next().value;
      chat.delete(oldest);
    }
  }

  async getMessage(key) {
    const jid = normalize(key?.remoteJid);
    const message = this.messages.get(jid)?.get(key?.id);
    return message?.message || undefined;
  }

  setGroupMetadata(jid, metadata) {
    if (!jid || !metadata) return;
    this._groups.set(jid, { metadata, expires: Date.now() + this.groupTtl });
  }

  async getGroupMetadata(jid) {
    const entry = this._groups.get(jid);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this._groups.delete(jid);
      return undefined;
    }
    return entry.metadata;
  }

  invalidateGroup(jid) {
    this._groups.delete(jid);
  }

  bind(ev) {
    ev.on("messages.upsert", ({ messages }) => {
      for (const message of messages) this.upsertMessage(message);
    });

    ev.on("messages.update", (updates) => {
      for (const { key, update } of updates) {
        const message = this.messages.get(normalize(key?.remoteJid))?.get(key?.id);
        if (message) Object.assign(message, update);
      }
    });

    ev.on("contacts.upsert", (contacts) => {
      for (const c of contacts) this.contacts.set(normalize(c.id), c);
    });
    ev.on("contacts.update", (contacts) => {
      for (const c of contacts) {
        const id = normalize(c.id);
        this.contacts.set(id, { ...this.contacts.get(id), ...c });
      }
    });

    ev.on("chats.upsert", (chats) => {
      for (const c of chats) this.chats.set(normalize(c.id), c);
    });
    ev.on("chats.update", (chats) => {
      for (const c of chats) {
        const id = normalize(c.id);
        this.chats.set(id, { ...this.chats.get(id), ...c });
      }
    });

    ev.on("groups.update", (updates) => {
      for (const update of updates) {
        if (!update.id) continue;
        const entry = this._groups.get(update.id);
        if (entry) Object.assign(entry.metadata, update);
      }
    });

    ev.on("group-participants.update", ({ id }) => {
      this.invalidateGroup(id);
    });

    ev.on("presence.update", ({ id, presences }) => {
      this.presences.set(normalize(id), presences);
    });
  }

  async fetchGroupMetadata(sock, jid, force = false) {
    if (!isGroup(jid)) return undefined;
    if (!force) {
      const cached = await this.getGroupMetadata(jid);
      if (cached) return cached;
    }
    const metadata = await sock.groupMetadata(jid);
    this.setGroupMetadata(jid, metadata);
    return metadata;
  }
}

export function createStore(options) {
  return new Store(options);
}
