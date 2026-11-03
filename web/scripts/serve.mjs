// Fast mode: builds the site once and runs the optimized server (pages load several times
// faster than `npm run dev`, which recompiles as you browse). Use it when sharing the link.
//   npm run serve
// Re-run it after pasting an update. In GitHub Codespaces it fills in the site address and,
// until an email service is set up, shows email links on screen like dev mode does.
import { spawnSync } from "node:child_process";

const env = { ...process.env };
if (!env.NEXT_PUBLIC_SITE_URL && env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN)
  env.NEXT_PUBLIC_SITE_URL = `https://${env.CODESPACE_NAME}-3000.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
if (!env.NEXT_PUBLIC_SITE_URL) env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
if (!env.RESEND_API_KEY && env.EMAIL_DEV_LINKS === undefined) env.EMAIL_DEV_LINKS = "1";

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("node", ["scripts/migrate.mjs"]);
console.log("\nBuilding the fast version of the site (about a minute)...\n");
run("npx", ["next", "build"]);
console.log(`\nReady: open the Ports tab and click port 3000 (${env.NEXT_PUBLIC_SITE_URL})\n`);
run("npx", ["next", "start", "-p", "3000"]);
