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

const PW = "correct horse battery";
const path = (link) => { const u = new URL(link); return u.pathname + u.search; };
async function signup(c, name, verify = true) {
  const r = await c("/api/auth/signup", { email: `${name.toLowerCase()}-${stamp}@example.com`, name, password: PW });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.user.email_verified, false);
  if (verify) {
    const page = await c(path(r.data.verification.devLink));
    assert.match(page.data, /Email confirmed/);
  }
  return r.data;
}

test("campaign lifecycle: create, pledge, match, pool, invite", { skip }, async () => {
  const ana = client(), ben = client(), cy = client();
  const pw = PW;
  await signup(ana, "Ana", false);
  assert.equal((await ana("/api/campaigns", { name: "Too soon", zips: ["11234"], goalCents: 100000 })).status, 403, "unverified can't create");
  const resend = await ana("/api/auth/resend", {});
  assert.equal((await ana(path(resend.data.verification.devLink))).status, 200);
  await signup(ben, "Ben");
  assert.equal((await client()("/api/auth/signup", { email: `ana-${stamp}@example.com`, name: "Ana", password: pw })).status, 409);
  assert.equal((await client()("/api/auth/signup", { email: `x-${stamp}@example.com`, name: "X", password: "short" })).status, 400);
  assert.equal((await client()("/api/auth/signup", { email: `x-${stamp}@example.com`, name: "X", password: "password123" })).status, 400);
  assert.equal((await client()("/api/auth/login", { email: `ana-${stamp}@example.com`, password: "wrong password" })).status, 401);
  assert.equal((await client()("/api/auth/login", { email: `ana-${stamp}@example.com`, password: pw })).status, 200);

  const unauth = await client()("/api/campaigns", { name: "Nope", zips: ["11234"], goalCents: 100000 });
  assert.equal(unauth.status, 401);

  const a = await ana("/api/campaigns", { name: `Marine ${stamp}`, zips: ["11234"], goalCents: 42_000_000, mode: "match" });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const b = await ben("/api/campaigns", { name: `Canarsie ${stamp}`, zips: ["11236", "11234"], goalCents: 85_000_000, mode: "match" });
  assert.equal(b.status, 201);

  const bad = await ana("/api/campaigns", { name: "Bad", zips: ["00000"], goalCents: 100000 });
  assert.equal(bad.status, 400);

  assert.equal((await client()(`/api/campaigns/${a.data.slug}/pledges`, { amountCents: 2500, name: "Guest" })).status, 401);
  const pl = await ben(`/api/campaigns/${a.data.slug}/pledges`, { amountCents: 2500 });
  assert.equal(pl.status, 201);
  assert.equal(pl.data.payment.kind, "pledge_only");
  assert.equal((await ben(`/api/campaigns/${a.data.slug}/pledges`, { amountCents: 100 })).status, 400);

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
  await signup(cy, "Cy");
  assert.equal((await cy(`/api/join/${code}`, {})).data.slug, a.data.slug);

  const cov = await client()("/api/map/coverage");
  assert.ok(cov.data.some((c) => c.z === "11234" && c.s === 2));
  const pts = await client()("/api/map/points");
  assert.match(pts.data, /11234,40\.608,-73\.911,\d+/);
});

test("profiles, swipe deck, mutual match, start together", { skip }, async () => {
  const dee = client(), eli = client(), anon = client();
  await signup(dee, "Dee");
  await signup(eli, "Eli");

  assert.equal((await anon("/api/deck")).status, 401);
  assert.equal((await dee("/api/profile", { home_zip: "11234", target_zips: ["11234"], gift_types: [] })).status, 400);
  assert.equal((await dee("/api/profile", { home_zip: "11234", target_zips: ["11234", "11236"], gift_types: ["cash", "stock"], per_child_cents: 2500, budget_cents: 500000 })).status, 200);
  assert.equal((await eli("/api/profile", { home_zip: "11210", target_zips: ["11236"], gift_types: ["stock"], per_child_cents: 3000 })).status, 200);
  const prof = await dee("/api/profile");
  assert.deepEqual(prof.data.profile.target_zips, ["11234", "11236"]);

  const deck = await dee("/api/deck");
  assert.equal(deck.status, 200);
  const eliCard = deck.data.find((c) => c.kind === "person" && c.title === "Eli");
  assert.ok(eliCard, "Eli should be in Dee's deck");
  const camp = deck.data.find((c) => c.kind === "campaign");
  assert.ok(camp && camp.score >= deck.data.at(-1).score, "deck is sorted by score");
  for (let i = 1; i < deck.data.length; i++) assert.ok(deck.data[i - 1].score >= deck.data[i].score);

  assert.equal((await dee("/api/swipes", { kind: "person", id: eliCard.id, decision: "like" })).data.matched, false);
  const eliDeck = await eli("/api/deck");
  const deeCard = eliDeck.data.find((c) => c.kind === "person" && c.title === "Dee");
  assert.equal((await eli("/api/swipes", { kind: "person", id: deeCard.id, decision: "like" })).data.matched, true);
  assert.ok(!(await dee("/api/deck")).data.some((c) => c.id === eliCard.id), "swiped cards leave the deck");

  await dee("/api/swipes", { kind: "campaign", id: camp.id, decision: "like" });
  const page = await dee("/connections");
  assert.match(page.data, /Eli/);
  assert.match(page.data, new RegExp(camp.title));

  const gated = await fetch(BASE + "/start", { redirect: "manual" });
  assert.equal(gated.status, 307);
  assert.match(gated.headers.get("location"), /\/signin\?next=/);

  const cross = await fetch(BASE + "/api/profile", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
  assert.equal(cross.status, 403);
});

test("account security: lockout delay, reset, change password, delete", { skip }, async () => {
  const fay = client();
  const { user } = await signup(fay, "Fay");
  const email = user.email;

  // headers
  const home = await fetch(BASE + "/");
  assert.equal(home.headers.get("x-frame-options"), "DENY");

  // progressive delay after 4 failures
  for (let i = 0; i < 4; i++) assert.equal((await client()("/api/auth/login", { email, password: "nope nope nope" })).status, 401);
  const t0 = Date.now();
  assert.equal((await client()("/api/auth/login", { email, password: "nope nope nope" })).status, 401);
  assert.ok(Date.now() - t0 >= 900, "5th failure is delayed");
  // unknown email: same answer
  assert.equal((await client()("/api/auth/login", { email: `nobody-${stamp}@example.com`, password: "x" })).data.error, "Email or password is incorrect.");

  // forgot -> reset (also lifts the lockout and signs out other sessions)
  const forgot = await client()("/api/auth/forgot", { email });
  assert.ok(forgot.data.devLink);
  const unknown = await client()("/api/auth/forgot", { email: `nobody-${stamp}@example.com` });
  assert.equal(unknown.status, 200);
  const token = new URL(forgot.data.devLink).searchParams.get("token");
  const other = client();
  assert.equal((await other("/api/auth/reset", { token, password: "short" })).status, 400);
  assert.equal((await other("/api/auth/reset", { token, password: "new horse battery staple" })).status, 200);
  assert.equal((await other("/api/auth/reset", { token, password: "new horse battery staple" })).status, 400, "token works once");
  assert.equal((await fay("/api/profile")).status, 401, "old session signed out");
  assert.equal((await fay("/api/auth/login", { email, password: "new horse battery staple" })).status, 200);

  // change password
  assert.equal((await fay("/api/account/password", { current: "wrong", next: "another long phrase" })).status, 401);
  assert.equal((await fay("/api/account/password", { current: "new horse battery staple", next: "another long phrase" })).status, 200);

  // delete: owned campaign with a co-organizer passes to them; one with pledges and no one else is closed
  const c1 = await fay("/api/campaigns", { name: `Fay One ${stamp}`, zips: ["11234"], goalCents: 100000 });
  const c2 = await fay("/api/campaigns", { name: `Fay Two ${stamp}`, zips: ["11236"], goalCents: 100000 });
  const gus = client(); await signup(gus, "Gus");
  const inv = await fay(`/api/campaigns/${c1.data.slug}/invites`, {});
  await gus(`/api/join/${inv.data.link.split("/join/")[1]}`, {});
  await gus(`/api/campaigns/${c2.data.slug}/pledges`, { amountCents: 5000 });
  assert.equal((await fay("/api/account/delete", { password: "another long phrase", confirm: "nope" })).status, 400);
  assert.equal((await fay("/api/account/delete", { password: "wrong", confirm: "DELETE" })).status, 401);
  assert.equal((await fay("/api/account/delete", { password: "another long phrase", confirm: "DELETE" })).status, 200);
  assert.equal((await fay("/api/profile")).status, 401);
  assert.equal((await client()("/api/auth/login", { email, password: "another long phrase" })).status, 401);
  const one = await client()(`/api/campaigns/${c1.data.slug}`);
  assert.equal(one.data.campaign.owner_name, "Gus");
  const two = await client()(`/api/campaigns/${c2.data.slug}`);
  assert.equal(two.data.campaign.status, "closed");
});
