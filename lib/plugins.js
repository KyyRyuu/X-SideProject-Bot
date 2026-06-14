import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";

export class PluginRegistry {
  constructor({ dir, logger }) {
    this.dir = dir;
    this.logger = logger;
    this.byPath = new Map();
    this.byCommand = new Map();
  }

  async _walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await this._walk(full)));
      else if (extname(entry.name) === ".js") files.push(full);
    }
    return files;
  }

  async loadAll() {
    this.byPath.clear();
    this.byCommand.clear();
    const files = await this._walk(this.dir);
    let ok = 0;
    for (const file of files) {
      if (await this.load(file)) ok++;
    }
    this.logger.info(`loaded ${ok}/${files.length} plugins`);
    return ok;
  }

  async load(file) {
    try {
      const url = `${pathToFileURL(file).href}?update=${Date.now()}`;
      const module = await import(url);
      const plugin = module.default;
      if (!plugin || typeof plugin.run !== "function") {
        throw new Error("missing default export or run()");
      }
      if (!plugin.command) throw new Error("missing command");
      plugin.__file = file;
      this._index(file, plugin);
      this.logger.debug(`plugin ${this._label(plugin)} ready`);
      return true;
    } catch (error) {
      this.logger.error(error, `failed to load plugin ${file}`);
      return false;
    }
  }

  unload(file) {
    const existing = this.byPath.get(file);
    if (!existing) return;
    for (const cmd of this._commands(existing)) this.byCommand.delete(cmd);
    this.byPath.delete(file);
    this.logger.debug(`plugin ${file} unloaded`);
  }

  _index(file, plugin) {
    this.unload(file);
    this.byPath.set(file, plugin);
    for (const cmd of this._commands(plugin)) {
      if (this.byCommand.has(cmd)) {
        this.logger.warn(`duplicate command "${cmd}" in ${file}`);
      }
      this.byCommand.set(cmd, plugin);
    }
  }

  _commands(plugin) {
    if (plugin.command instanceof RegExp) return [];
    return [].concat(plugin.command).map((c) => String(c).toLowerCase());
  }

  _label(plugin) {
    return [].concat(plugin.command instanceof RegExp ? plugin.command.source : plugin.command).join("|");
  }

  find(command) {
    const exact = this.byCommand.get(command);
    if (exact) return exact;
    for (const plugin of this.byPath.values()) {
      if (plugin.command instanceof RegExp && plugin.command.test(command)) return plugin;
    }
    return undefined;
  }

  all() {
    return [...this.byPath.values()];
  }
}

export function createRegistry(options) {
  return new PluginRegistry(options);
}
