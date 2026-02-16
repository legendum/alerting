import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "log");
const MAIN_LOG = join(LOG_DIR, "alert.log");
const ERROR_LOG = join(LOG_DIR, "error.log");

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function timestamp(): string {
  return new Date().toISOString();
}

function serialize(arg: unknown): string {
  if (arg instanceof Error) return arg.stack ?? arg.message;
  if (typeof arg === "object" && arg !== null) return JSON.stringify(arg);
  return String(arg);
}

function format(level: string, msg: string, rest: unknown[]): string {
  const restStr = rest.length ? " " + rest.map(serialize).join(" ") : "";
  return `${timestamp()} [${level}] ${msg}${restStr}\n`;
}

function write(level: string, msg: string, rest: unknown[]): void {
  const line = format(level, msg, rest);
  try {
    ensureLogDir();
    appendFileSync(MAIN_LOG, line);
    if (level === "ERROR") {
      appendFileSync(ERROR_LOG, line);
    }
  } catch {
    // Avoid throwing from logger; fall back to console only
  }
  // Only WARN and ERROR to terminal; INFO goes to file only
  const consoleMsg = `[${level}] ${msg}`;
  if (level === "ERROR") {
    console.error(consoleMsg, ...rest);
  } else if (level === "WARN") {
    console.warn(consoleMsg, ...rest);
  }
}

export const log = {
  info(msg: string, ...args: unknown[]): void {
    write("INFO", msg, args);
  },
  warn(msg: string, ...args: unknown[]): void {
    write("WARN", msg, args);
  },
  error(msg: string, ...args: unknown[]): void {
    write("ERROR", msg, args);
  },
};
