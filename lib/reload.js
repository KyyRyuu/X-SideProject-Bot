import { watch } from "node:fs";
import { existsSync } from "node:fs";
import { debounce } from "./helper.js";

export class HotReloader {
  constructor({ dir, registry, logger, debounce: wait = 200 }) {
    this.dir = dir;
    this.registry = registry;
    this.logger = logger;
    this.wait = wait;
    /** @type {Map<string, Function>} debounced reloaders per file. */
    this._reloaders = new Map();
    this._watcher = null;
  }

  /** Begin watching. Recursive watch falls back to per-event resolution. */
  start() {
    if (this._watcher) return;
    this._watcher = watch(this.dir, { recursive: true }, (_event, filename) => {
      if (!filename || !filename.endsWith(".js")) return;
      const file = `${this.dir}/${filename}`.replace(/\\/g, "/");
      this._schedule(file);
    });
    this.logger.info("hot reload watching plugins/");
  }

  _schedule(file) {
    let reload = this._reloaders.get(file);
    if (!reload) {
      reload = debounce(() => this._reload(file), this.wait);
      this._reloaders.set(file, reload);
    }
    reload();
  }

  async _reload(file) {
    try {
      if (existsSync(file)) {
        const ok = await this.registry.load(file);
        if (ok) this.logger.info(`reloaded ${this._short(file)}`);
      } else {
        this.registry.unload(file);
        this.logger.info(`removed ${this._short(file)}`);
        this._reloaders.delete(file);
      }
    } catch (error) {
      this.logger.error(error, `hot reload failed for ${file}`);
    }
  }

  _short(file) {
    return file.split("/plugins/").pop();
  }

  /** Stop watching. */
  stop() {
    this._watcher?.close();
    this._watcher = null;
  }
}

/**
 * @param {object} options
 * @returns {HotReloader}
 */
export function createReloader(options) {
  return new HotReloader(options);
}
