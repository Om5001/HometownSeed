// End-to-end API smoke test. Run against a running app: BASE_URL=http://localhost:3000 npm run test:api
import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL;
const skip = !BASE && "BASE_URL not set";
const stamp = Date.now().toString(36);

function client() {
  let cookie = "";
  return async (path, body) => {
    const r = await fetch(BASE + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = r.headers.get("set-cookie"); if (set) cookie = set.split(";")[0];
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: r.status, data };
  };
}

test("campaign lifecycle: create, pledge, match, pool, invite", { skip }, async () => {
  const ana = client(), ben = client(), cy = client();
  assert.equal((await ana("/api/auth/login", { email: `ana-${stamp}@example.com`, name: "Ana" })).status, 200);
  assert.equal((await ben("/api/auth/login", { email: `ben-${stamp}@example.com`, name: "Ben" })).status, 200);

  const unauth = await client()("/api/campaigns", { name: "Nope", zips: ["11234"], goalCents: 100000 });
  assert.equal(unauth.status, 401);

  const a = await ana("/api/campaigns", { name: `Marine ${stamp}`, zips: ["11234"], goalCents: 42_000_000, mode: "match" });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const b = await ben("/api/campaigns", { name: `Canarsie ${stamp}`, zips: ["11236", "11234"], goalCents: 85_000_000, mode: "match" });
  assert.equal(b.status, 201);

  const bad = await ana("/api/campaigns", { name: "Bad", zips: ["00000"], goalCents: 100000 });
  assert.equal(bad.status, 400);

  const pl = await client()(`/api/campaigns/${a.data.slug}/pledges`, { amountCents: 2500, name: "Guest", email: "g@example.com" });
  assert.equal(pl.status, 201);
  assert.equal(pl.data.payment.kind, "pledge_only");
  assert.equal((await client()(`/api/campaigns/${a.data.slug}/pledges`, { amountCents: 100, name: "Tiny" })).status, 400);

  const m = await ana(`/api/campaigns/${a.data.slug}/matches`);
  const hit = m.data.find((x) => x.slug === b.data.slug);
  assert.ok(hit, "Canarsie should match Marine");
  assert.equal(hit.match_type, "same_area");

  assert.equal((await cy(`/api/campaigns/${a.data.slug}/pool-requests`, { toSlug: b.data.slug })).status, 401);
  const req = await ana(`/api/campaigns/${a.data.slug}/pool-requests`, { toSlug: b.data.slug, message: "Pool?" });
  assert.equal(req.status, 201, JSON.stringify(req.data));
  assert.equal((await ana(`/api/pool-requests/${req.data.id}`, { action: "accept" })).status, 403); // only receiver accepts
  const acc = await ben(`/api/pool-requests/${req.data.id}`, { action: "accept" });
  assert.equal(acc.status, 200);

  const view = await client()(`/api/campaigns/${a.data.slug}`);
  assert.equal(view.data.pool.campaigns.length, 2);
  assert.equal(view.data.campaign.invite_code, undefined, "invite code hidden from visitors");

  const inv = await ana(`/api/campaigns/${a.data.slug}/invites`, { emails: ["friend@example.com"] });
  assert.equal(inv.status, 200);
  const code = inv.data.link.split("/join/")[1];
  await cy("/api/auth/login", { email: `cy-${stamp}@example.com`, name: "Cy" });
  assert.equal((await cy(`/api/join/${code}`, {})).data.slug, a.data.slug);

  const cov = await client()("/api/map/coverage");
  assert.ok(cov.data.some((c) => c.z === "11234" && c.s === 2));
  const pts = await client()("/api/map/points");
  assert.match(pts.data, /11234,40\.608,-73\.911,\d+/);
});
