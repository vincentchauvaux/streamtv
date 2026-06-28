type LogLevel = "INFO" | "WARN" | "ERROR";

function format(level: LogLevel, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level}] ${message}`;
  if (meta !== undefined) {
    return `${base} ${JSON.stringify(meta)}`;
  }
  return base;
}

export const logger = {
  info(message: string, meta?: unknown) {
    console.log(format("INFO", message, meta));
  },
  warn(message: string, meta?: unknown) {
    console.warn(format("WARN", message, meta));
  },
  error(message: string, meta?: unknown) {
    console.error(format("ERROR", message, meta));
  },
};
