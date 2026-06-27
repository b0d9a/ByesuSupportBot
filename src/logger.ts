const LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LEVELS)[number];

function levelIndex(level: string): number {
  const idx = LEVELS.indexOf(level as LogLevel);
  return idx === -1 ? 1 : idx; // default to "info"
}

export class Logger {
  private readonly minLevel: number;

  constructor(level: string) {
    this.minLevel = levelIndex(level);
  }

  info(message: string, meta?: unknown): void {
    if (this.minLevel <= levelIndex("info")) {
      console.log(`${new Date().toISOString()} INFO`, message, meta ?? "");
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.minLevel <= levelIndex("warn")) {
      console.warn(`${new Date().toISOString()} WARN`, message, meta ?? "");
    }
  }

  error(message: string, meta?: unknown): void {
    if (this.minLevel <= levelIndex("error")) {
      console.error(`${new Date().toISOString()} ERROR`, message, meta ?? "");
    }
  }
}
