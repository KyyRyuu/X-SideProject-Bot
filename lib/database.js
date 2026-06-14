import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { debounce } from "./helper.js";

export class JSONAdapter {
  constructor(path) {
    this.path = path;
  }

  async load() {
    if (!existsSync(this.path)) return {};
    try {
      const raw = await readFile(this.path, "utf8");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  async save(data) {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, this.path);
  }
}

export class Database {
  constructor(adapter, options = {}) {
    this.adapter = adapter;
    this.logger = options.logger;
    this.data = { users: {}, groups: {}, chats: {}, settings: {} };
    this._flush = debounce(() => this.save(), options.saveInterval ?? 5000);
  }

  async init() {
    const loaded = await this.adapter.load();
    this.data = {
      users: {},
      groups: {},
      chats: {},
      settings: {},
      ...loaded
    };
    this.logger?.info("database loaded");
    return this;
  }

  async save() {
    try {
      await this.adapter.save(this.data);
    } catch (error) {
      this.logger?.error(error, "database save failed");
    }
  }

  touch() {
    this._flush();
  }

  user(jid) {
    if (!this.data.users[jid]) {
      this.data.users[jid] = { jid, banned: false };
      this.touch();
    }
    return this.data.users[jid];
  }

  group(jid) {
    if (!this.data.groups[jid]) {
      this.data.groups[jid] = { jid, welcome: false, antilink: false, mute: false };
      this.touch();
    }
    return this.data.groups[jid];
  }

  chat(jid) {
    if (!this.data.chats[jid]) {
      this.data.chats[jid] = { jid };
      this.touch();
    }
    return this.data.chats[jid];
  }
}

export function createDatabase(config, logger) {
  let adapter;
  switch (config.adapter) {
    case "json":
    default:
      adapter = new JSONAdapter(config.path);
      break;
  }
  return new Database(adapter, { saveInterval: config.saveInterval, logger });
}
