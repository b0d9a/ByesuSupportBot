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
