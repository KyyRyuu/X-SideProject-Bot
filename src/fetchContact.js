import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { normalize, isUser, toUser, encode, SERVERS } from "../lib/jid.js";
import { debounce } from "../lib/helper.js";

export class ContactBook {
  constructor({ contactsPath = null, logger = null, saveInterval = 5000 } = {}) {
    this.path = contactsPath;
    this.logger = logger;
    this.contacts = new Map();
    this.lidIndex = new Map();
    this._persist = debounce(() => this.save(), saveInterval);
    this._syncing = false;
  }

  static pickName(c) {
    return c?.name || c?.notify || c?.verifiedName || undefined;
  }

  upsert(contact) {
    if (!contact) return false;
    const idNorm = contact.id ? normalize(contact.id) : null;
    const lid = contact.lid
      ? normalize(contact.lid)
      : idNorm && !isUser(idNorm)
        ? idNorm
        : undefined;

    let pn =
      contact.phoneNumber && isUser(contact.phoneNumber)
        ? normalize(contact.phoneNumber)
        : idNorm && isUser(idNorm)
          ? idNorm
          : null;

    if (!pn && lid && this.lidIndex.has(lid)) pn = this.lidIndex.get(lid);

    const key = pn || idNorm;
    if (!key) return false;

    let merged = this.contacts.get(key);
    if (pn && lid && this.contacts.has(lid)) {
      merged = { ...this.contacts.get(lid), ...merged };
      this.contacts.delete(lid);
    }
    if (lid && pn) this.lidIndex.set(lid, pn);

    const name = ContactBook.pickName(contact) || merged?.name;
    this.contacts.set(key, {
      id: key,
      ...(pn && { phoneNumber: pn }),
      ...(lid && { lid }),
      ...(name && { name })
    });
    this._persist();
    return true;
  }

  async resolveLids(sock) {
    const map = sock?.signalRepository?.lidMapping;
    if (!map?.getPNForLID) return 0;
    let resolved = 0;
    for (const [key, c] of [...this.contacts]) {
      if (isUser(key)) continue; // already has a number
      try {
        const pn = await map.getPNForLID(c.lid || key);
        if (pn && isUser(normalize(pn))) {
          this.upsert({ id: c.lid || key, phoneNumber: pn, name: c.name });
          resolved++;
        }
      } catch {
      }
    }
    return resolved;
  }

  async sync(sock) {
    if (this._syncing) return { resolved: 0, total: this.contacts.size };
    this._syncing = true;
    try {
      const resolved = await this.resolveLids(sock);
      await this.save();

      const total = [...this.contacts.keys()].filter(isUser).length;
      this.logger?.info(`contact sync: ${resolved} lids resolved, ${total} numbers`);
      return { resolved, total };
    } finally {
      this._syncing = false;
    }
  }

  async load() {
    if (!this.path || !existsSync(this.path)) return 0;
    try {
      const raw = await readFile(this.path, "utf8");
      const data = raw ? JSON.parse(raw) : {};
      const entries = Array.isArray(data) ? data.map((r) => [r.number, r]) : Object.entries(data);
      for (const [number, value] of entries) {
        if (value && typeof value === "object") {
          if (value.phoneNumber && isUser(value.phoneNumber)) {
            this.upsert({ id: value.phoneNumber, lid: value.lid, name: value.name || value.notify });
          } else if (value.id && isUser(normalize(value.id))) {
            this.upsert({ id: value.id, lid: value.lid, name: value.name || value.notify });
          }
          continue;
        }
        const digits = String(number).replace(/\D/g, "");
        if (digits) this.upsert({ id: encode(digits, SERVERS.user), name: value || undefined });
      }
      this.logger?.info(`loaded ${this.contacts.size} contacts from disk`);
    } catch (error) {
      this.logger?.error(error, "failed to load contacts");
    }
    return this.contacts.size;
  }

  async save() {
    if (!this.path) return;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      const out = {};
      for (const [jid, c] of this.contacts) {
        if (!isUser(jid)) continue;
        out[toUser(jid)] = c.name || "";
      }
      const tmp = `${this.path}.tmp`;
      await writeFile(tmp, JSON.stringify(out, null, 2));
      await rename(tmp, this.path);
    } catch (error) {
      this.logger?.error(error, "failed to save contacts");
    }
  }

  list() {
    return [...this.contacts.values()].filter((c) => c.phoneNumber || isUser(c.id));
  }
}

export function createContactBook(options) {
  return new ContactBook(options);
}

export default createContactBook;
