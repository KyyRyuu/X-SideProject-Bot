import { promisify } from "node:util";
import { exec as execCb, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const execAsync = promisify(execCb);

/** @param {number} ms */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Format an uptime in seconds into a human-readable string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatRuntime(seconds) {
  seconds = Math.floor(seconds);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [
    d ? `${d}d` : "",
    h ? `${h}h` : "",
    m ? `${m}m` : "",
    `${s}s`
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Format a byte count into a readable size.
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Pick a random element from an array.
 * @template T
 * @param {T[]} array
 * @returns {T}
 */
export function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate a short random hex id.
 * @param {number} [length]
 * @returns {string}
 */
export function randomId(length = 8) {
  return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

/**
 * Run a fixed, trusted shell command and resolve its stdout.
 *
 * SECURITY: never interpolate user input into `command`. For anything that
 * carries arguments (media conversion, downloads) use {@link run} instead,
 * which passes an argument array to a binary without invoking a shell.
 * @param {string} command
 * @param {object} [options]
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
export function exec(command, options = {}) {
  return execAsync(command, { maxBuffer: 1024 * 1024 * 64, ...options });
}

/**
 * Spawn a binary with an argument array — no shell, so user-supplied values
 * cannot inject commands. Resolves with the collected stdout/stderr buffers.
 * @param {string} file Binary to execute (e.g. "ffmpeg").
 * @param {string[]} [args] Argument list passed verbatim.
 * @param {object} [options] Passed to child_process.spawn.
 * @returns {Promise<{ code: number, stdout: Buffer, stderr: Buffer }>}
 */
export function run(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { ...options });
    const stdout = [];
    const stderr = [];
    if (child.stdout) child.stdout.on("data", (d) => stdout.push(d));
    if (child.stderr) child.stderr.on("data", (d) => stderr.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        code,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr)
      };
      if (code === 0) resolve(result);
      else reject(Object.assign(new Error(`${file} exited with code ${code}`), result));
    });
  });
}

/**
 * Run an async function, returning a tuple instead of throwing.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<[Error|null, T|undefined]>}
 */
export async function attempt(fn) {
  try {
    return [null, await fn()];
  } catch (error) {
    return [error, undefined];
  }
}

/**
 * Coalesce rapid calls into a single trailing invocation.
 * @param {Function} fn
 * @param {number} wait
 * @returns {Function}
 */
export function debounce(fn, wait) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Strip the leading prefix and command token from a message body, returning the
 * raw remainder verbatim (internal whitespace and newlines preserved). Use this
 * instead of ctx.text when the argument is code or a shell command, where the
 * whitespace-collapsing of args.join(" ") would corrupt the input.
 *
 * @param {string} text Original message body (m.body).
 * @param {string[]} prefixes settings.prefix.
 * @param {string} command The command token that was matched (ctx.command).
 * @returns {string}
 */
export function rawSource(text, prefixes = [], command = "") {
  let s = typeof text === "string" ? text : "";
  for (const p of prefixes) {
    if (p && s.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }
  s = s.replace(/^\s+/, "");
  if (command && s.slice(0, command.length).toLowerCase() === command.toLowerCase()) {
    s = s.slice(command.length);
  }
  return s.replace(/^\s+/, "");
}

/**
 * Convert any thrown value into a clean string for logging or replies.
 * @param {unknown} error
 * @returns {string}
 */
export function formatError(error) {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "object") {
    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return String(error);
    }
  }
  return String(error);
}
