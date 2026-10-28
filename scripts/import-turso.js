// Stop writes to the source before running. The source is read only.
import { createClient } from "@libsql/client";
import pg from "pg";

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN || !process.env.DATABASE_URL)
  throw new Error("Set TURSO_DATABASE_URL, TURSO_AUTH_TOKEN and DATABASE_URL securely before importing.");
const source = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" });
const target = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
const tables = ["users", "crews", "members", "challenges", "participants", "runs", "sessions", "resets", "auth_buckets"];
const identities = new Set(["users", "crews", "challenges", "runs"]);
try {
  await target.connect();
  await target.query("BEGIN");
  await target.query(`LOCK TABLE ${tables.map(t => `"${t}"`).join(",")} IN ACCESS EXCLUSIVE MODE`);
  for (const table of tables) {
    const existing = await target.query(`SELECT 1 FROM "${table}" LIMIT 1`);
    if (existing.rowCount) throw new Error("Target must be empty; no existing target data was changed.");
  }
  for (const table of tables) {
    const { rows, columns } = await source.execute(`SELECT * FROM "${table}"`);
    const names = columns.map(c => `"${c}"`).join(",");
    const params = columns.map((_, i) => `$${i + 1}`).join(",");
    for (const row of rows)
      await target.query(`INSERT INTO "${table}" (${names}) VALUES (${params})`, columns.map(c => row[c]));
    const { rows: counts } = await target.query(`SELECT COUNT(*)::integer AS count FROM "${table}"`);
    if (counts[0].count !== rows.length) throw new Error(`Count mismatch: ${table}`);
    if (identities.has(table))
      await target.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM "${table}"`, [table]);
    console.log(`${table}: ${rows.length} rows verified`);
  }
  await target.query("COMMIT");
  console.log("Import committed. Source data was not modified.");
} catch (error) {
  await target.query("ROLLBACK").catch(() => {});
  console.error("Import failed; target transaction rolled back:", error.code || error.name);
  process.exitCode = 1;
} finally {
  source.close();
  await target.end();
}
