import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export async function openDatabase(root) {
  const url = process.env.DATABASE_URL;
  if (process.env.NODE_ENV === "production" && !url)
    throw new Error("Production requires a Supabase Postgres DATABASE_URL.");
  if (url) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: url,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      // Supabase transaction pooling: use unnamed parameterized queries.
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
    });
    pool.on("error", () => console.error("Database pool connection failed"));
    function connection(c) {
      return {
        prepare(sql) {
          let index = 0;
          let query = sql.replace(/\?/g, () => `$${++index}`);
          if (/^INSERT OR IGNORE /i.test(query))
            query = query.replace(/^INSERT OR IGNORE /i, "INSERT ") + " ON CONFLICT DO NOTHING";
          if (/^INSERT INTO (users|crews|challenges|runs)\b/i.test(query) && !/\bRETURNING\b/i.test(query))
            query += " RETURNING id";
          return {
            async get(...args) { return (await c.query(query, args)).rows[0]; },
            async all(...args) { return (await c.query(query, args)).rows; },
            async run(...args) {
              const result = await c.query(query, args);
              return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
            },
          };
        },
        exec(sql) { return c.query(sql); },
      };
    }
    return {
      db: connection(pool),
      client: { close: () => pool.end() },
      async transaction(fn) {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const value = await fn(connection(c));
          await c.query("COMMIT");
          return value;
        } catch (error) {
          await c.query("ROLLBACK");
          throw error;
        } finally { c.release(); }
      },
    };
  }
  // Local tests and development keep an isolated SQLite database.
  const { createClient } = await import("@libsql/client");
  const dbPath = process.env.DB_PATH || resolve(root, "data/pace.sqlite");
  mkdirSync(dirname(dbPath), { recursive: true });
  const client = createClient({ url: `file:${dbPath}`, intMode: "number" });
  function connection(c) {
    return {
      prepare(sql) {
        return {
          async get(...args) { return (await c.execute({ sql, args })).rows[0]; },
          async all(...args) { return (await c.execute({ sql, args })).rows; },
          async run(...args) {
            const result = await c.execute({ sql, args });
            return { ...result, lastInsertRowid: Number(result.lastInsertRowid) };
          },
        };
      },
      exec(sql) { return c.executeMultiple(sql); },
    };
  }
  const db = connection(client);
  await db.exec(readFileSync(new URL("./sqlite-schema.sql", import.meta.url), "utf8"));
  return {
    db, client,
    async transaction(fn) {
      const t = await client.transaction("write");
      try { const value = await fn(connection(t)); await t.commit(); return value; }
      catch (error) { await t.rollback(); throw error; }
      finally { t.close(); }
    },
  };
}
