import { loadDatabaseConfig } from "./config.js";
import { createPool, migrate } from "./db.js";

const config = loadDatabaseConfig();
const pool = createPool(config.databaseUrl);

try {
  await migrate(pool);
  console.log("Migrations applied");
} finally {
  await pool.end();
}
