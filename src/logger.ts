export class Logger {
  constructor(private readonly level: string) {}

  info(message: string, meta?: unknown): void {
    if (["debug", "info"].includes(this.level)) {
      console.log(`${new Date().toISOString()} INFO`, message, meta ?? "");
    }
  }

  warn(message: string, meta?: unknown): void {
    console.warn(`${new Date().toISOString()} WARN`, message, meta ?? "");
  }

  error(message: string, meta?: unknown): void {
    console.error(`${new Date().toISOString()} ERROR`, message, meta ?? "");
  }
}
