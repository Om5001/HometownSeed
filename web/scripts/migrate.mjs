// Applies ../sql/*.sql to DATABASE_URL in order. Every file is safe to re-run.
// Runs automatically before `npm run dev`; run by hand with `npm run migrate`.
// Set SKIP_MIGRATE=1 to skip.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

if (process.env.SKIP_MIGRATE === "1") process.exit(0);
const here = path.dirname(fileURLToPath(import.meta.url));
for (const f of [".env.local", ".env"]) {
  const p = path.join(here, "..", f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set. Put it in web/.env.local (see web/.env.example)."); process.exit(1); }

const dir = path.join(here, "..", "..", "sql");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, ssl: /sslmode=(require|verify)/.test(url) ? "require" : false });
try {
  for (const f of files) await sql.unsafe(fs.readFileSync(path.join(dir, f), "utf8")).simple();
  console.log(`Database is up to date (${files.join(", ")})`);
} catch (e) {
  console.error("Database setup failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
