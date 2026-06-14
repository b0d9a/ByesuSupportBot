import { createBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { acquireAdvisoryLock, createPool, migrate } from "./db.js";
import { Logger } from "./logger.js";

const config = loadConfig();
const logger = new Logger(config.logLevel);
const pool = createPool(config.databaseUrl);

await migrate(pool);

const lockClient = await acquireAdvisoryLock(pool);
if (!lockClient) {
  logger.error("Another bot instance is already running (advisory lock held). Exiting.");
  await pool.end();
  process.exit(1);
}

const bot = createBot({ pool, config, logger });
await bot.telegram.setMyCommands([
  { command: "start", description: "Главное меню" },
  { command: "faq", description: "FAQ / частые вопросы" },
  { command: "new", description: "Создать обращение" }
]);
await bot.telegram.setMyCommands(
  [
    { command: "setup", description: "Настроить служебные топики" },
    { command: "setup_reset", description: "Пересоздать служебные топики" }
  ],
  {
    scope: {
      type: "chat_administrators",
      chat_id: config.supportGroupId
    }
  }
);
await bot.telegram.getMe().then((me) => logger.info(`Bot started as @${me.username}`));

async function shutdown(signal: string): Promise<void> {
  bot.stop(signal);
  lockClient!.release();
  await pool.end();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await bot.launch({ dropPendingUpdates: true });
