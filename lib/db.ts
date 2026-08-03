import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set — see .env.example.");
}

// Works with any standard Postgres (Railway, Neon, local) — no provider-specific driver.
export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: false }
});

interface Executor {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

function makeSqlRunner(executor: Executor) {
  // Supports both call styles used throughout this codebase:
  //   sql`select * from x where id = ${id}`      (tagged template)
  //   sql(dynamicText, [param1, param2, ...])     (plain call, for dynamically-built queries)
  return async function sql(stringsOrText: TemplateStringsArray | string, ...values: unknown[]): Promise<any[]> {
    let text: string;
    let params: unknown[];
    if (typeof stringsOrText === "string") {
      text = stringsOrText;
      params = (values[0] as unknown[]) || [];
    } else {
      text = "";
      stringsOrText.forEach((s, i) => {
        text += s;
        if (i < values.length) text += `$${i + 1}`;
      });
      params = values;
    }
    const res = await executor.query(text, params);
    return res.rows;
  };
}

export const sql = makeSqlRunner(pool);

/** Runs a group of queries atomically on a single checked-out connection. */
export async function withTransaction<T>(fn: (txSql: ReturnType<typeof makeSqlRunner>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const txSql = makeSqlRunner(client);
  try {
    await client.query("BEGIN");
    const result = await fn(txSql);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
