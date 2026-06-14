import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

export type DbClient = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string): pg.Pool {
  return new Pool({ connectionString });
}

export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const migrationsPath = resolve(root, "migrations");
  const migrationNames = (await readdir(migrationsPath)).filter((name) => name.endsWith(".sql")).sort();

  for (const name of migrationNames) {
    const existing = await pool.query("select 1 from schema_migrations where name = $1", [name]);
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const sql = await readFile(resolve(migrationsPath, name), "utf8");
      await client.query(sql);
      await client.query("insert into schema_migrations(name) values ($1)", [name]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

// Stable lock key for this bot process. Chosen arbitrarily; must not collide with other apps on the same DB.
// pg_try_advisory_lock takes a single bigint (8 bytes). We use a fixed constant documented here.
// Value: sha256("byesu_support_bot")[0..7] interpreted as int64, truncated to pg bigint range.
const ADVISORY_LOCK_KEY = 1_862_351_047_294_318n;

/**
 * Acquire a session-level PostgreSQL advisory lock so only one bot instance runs at a time.
 * Returns the dedicated PoolClient that holds the lock — keep it open for process lifetime.
 * Returns null if the lock is already held by another session.
 */
export async function acquireAdvisoryLock(pool: pg.Pool): Promise<pg.PoolClient | null> {
  const client = await pool.connect();
  const result = await client.query("select pg_try_advisory_lock($1) as acquired", [ADVISORY_LOCK_KEY]);
  if (result.rows[0].acquired) {
    return client;
  }
  client.release();
  return null;
}

export async function inTransaction<T>(pool: pg.Pool, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
