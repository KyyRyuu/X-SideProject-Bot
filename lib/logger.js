import { inspect } from "node:util";

/**
 * Numeric weight per level, mirroring pino so Baileys' internal checks
 * (`logger.level`, `logger.levelVal`) behave identically.
 */
const LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity
};

const COLORS = {
  trace: "\x1b[90m",
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  fatal: "\x1b[41m\x1b[37m"
};
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

/**
 * Minimal, dependency-free logger that is API-compatible with the subset of
 * pino used by Baileys (`child`, `level`, and the level methods). It is safe to
 * pass directly into makeWASocket as the `logger` option.
 */
class Logger {
  /**
   * @param {object} [options]
   * @param {string} [options.level] Initial level name.
   * @param {object} [options.bindings] Static fields merged into every line.
   */
  constructor(options = {}) {
    this._level = options.level || "info";
    this.bindings = options.bindings || {};
  }

  /** Current level name. Baileys reads and writes this property directly. */
  get level() {
    return this._level;
  }

  set level(value) {
    this._level = value;
  }

  /** Numeric weight of the active level (pino parity). */
  get levelVal() {
    return LEVELS[this._level] ?? LEVELS.info;
  }

  /**
   * Create a sub-logger that inherits the level and merges extra bindings.
   * @param {object} bindings
   * @returns {Logger}
   */
  child(bindings = {}) {
    const logger = new Logger({
      level: this._level,
      bindings: { ...this.bindings, ...bindings }
    });
    return logger;
  }

  /**
   * @param {string} level
   * @param {unknown} payload
   * @param {string} [message]
   */
  _write(level, payload, message) {
    if (LEVELS[level] < this.levelVal) return;

    const time = new Date().toISOString().split("T")[1].replace("Z", "");
    const tag = `${COLORS[level]}${level.toUpperCase().padEnd(5)}${RESET}`;
    const scope = this.bindings.class || this.bindings.module;
    const scopeStr = scope ? `${DIM}[${scope}]${RESET} ` : "";

    let text = message;
    let extra;
    if (typeof payload === "string") {
      text = payload;
    } else if (payload instanceof Error) {
      text = message || payload.message;
      extra = payload.stack;
    } else if (payload && typeof payload === "object") {
      extra = inspect(payload, { depth: 3, colors: true, breakLength: 120 });
    }

    const line = `${DIM}${time}${RESET} ${tag} ${scopeStr}${text ?? ""}`;
    const stream = LEVELS[level] >= LEVELS.error ? process.stderr : process.stdout;
    stream.write(line + "\n");
    if (extra) stream.write(`${DIM}${extra}${RESET}\n`);
  }

  trace(payload, message) {
    this._write("trace", payload, message);
  }

  debug(payload, message) {
    this._write("debug", payload, message);
  }

  info(payload, message) {
    this._write("info", payload, message);
  }

  warn(payload, message) {
    this._write("warn", payload, message);
  }

  error(payload, message) {
    this._write("error", payload, message);
  }

  fatal(payload, message) {
    this._write("fatal", payload, message);
  }
}

/**
 * Build the root logger from settings.
 * @param {{ level?: string }} [options]
 * @returns {Logger}
 */
export function createLogger(options = {}) {
  return new Logger(options);
}

export { Logger, LEVELS };
