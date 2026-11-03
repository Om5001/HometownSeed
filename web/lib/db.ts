import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __hsSql?: Sql };

/** Shared Postgres connection (Supabase Session pooler or any Postgres). */
export function db(): Sql {
  if (!g.__hsSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see web/.env.example)");
    g.__hsSql = postgres(url, {
      max: 5,
      prepare: false, // safe with Supabase poolers
      idle_timeout: 20,
      ssl: /sslmode=(require|verify)/.test(url) ? "require" : false,
      // DB_TRACE=1 prints every query to the terminal (for finding slow pages)
      debug: process.env.DB_TRACE === "1" ? (_c, q) => console.log("[db]", Date.now() % 100000, q.replace(/\s+/g, " ").slice(0, 90)) : undefined,
    });
  }
  return g.__hsSql;
}
