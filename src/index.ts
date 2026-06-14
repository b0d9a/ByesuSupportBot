import { createBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { createPool, migrate } from "./db.js";
import { Logger } from "./logger.js";

const config = loadConfig();
const logger = new Logger(config.logLevel);
const pool = createPool(config.databaseUrl);

await migrate(pool);

const bot = createBot({ pool, config, logger });
await bot.telegram.getMe().then((me) => logger.info(`Bot started as @${me.username}`));

process.once("SIGINT", () => {
  bot.stop("SIGINT");
  void pool.end();
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  void pool.end();
});

await bot.launch({ dropPendingUpdates: true });
