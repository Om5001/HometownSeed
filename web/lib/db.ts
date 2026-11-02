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
    });
  }
  return g.__hsSql;
}
