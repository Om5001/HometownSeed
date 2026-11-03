// End-to-end API smoke test. Run against a running app: BASE_URL=http://localhost:3000 npm run test:api
import test from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL;
const skip = !BASE && "BASE_URL not set";
const stamp = Date.now().toString(36);

function client() {
  let cookie = "";
  const fn = async (path, body) => {
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
  fn.cookie = () => cookie;
  return fn;
}

const PW = "correct horse battery";
const path = (link) => { const u = new URL(link, "http://x"); return u.pathname + u.search; };
const tokenOf = (link) => new URL(link, "http://x").searchParams.get("token");
async function signup(c, name, verify = true) {
  const r = await c("/api/auth/signup", { email: `${name.toLowerCase()}-${stamp}@example.com`, name, password: PW });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.user.email_verified, false);
  if (verify) {
    assert.ok(r.data.verification.devLink.startsWith("/verify?token="), "dev link is relative");
    const v = await c("/api/auth/verify", { token: tokenOf(r.data.verification.devLink) });
    assert.equal(v.status, 200);
    assert.equal((await c("/api/auth/verify", { token: tokenOf(r.data.verification.devLink) })).status, 200, "second click still OK");
  }
  return r.data;
}

test("campaign lifecycle: create, pledge, match, pool, invite", { skip }, async () => {
  const ana = client(), ben = client(), cy = client();
  const pw = PW;
  await signup(ana, "Ana", false);
  assert.equal((await ana("/api/campaigns", { name: "Too soon", zips: ["11234"], goalCents: 100000 })).status, 403, "unverified can't create");
  const resend = await ana("/api/auth/resend", {});
  assert.equal((await ana("/api/auth/verify", { token: tokenOf(resend.data.verification.devLink) })).status, 200);
  assert.equal((await ana("/api/auth/verify", { token: "not-a-token" })).status, 400);
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
  const token = tokenOf(forgot.data.devLink);
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

test("goal types, run options, and the coalition tracker", { skip }, async () => {
  const hal = client(), ivy = client(), joe = client();
  await signup(hal, "Hal"); await signup(ivy, "Ivy"); await signup(joe, "Joe");

  // goal per child: total follows the kid count
  const pc = await hal("/api/campaigns", { name: `Per Child ${stamp}`, zips: ["11234"], goalType: "per_child", goalPerChildCents: 2500, openToMatching: true, inviteFriends: true });
  assert.equal(pc.status, 201, JSON.stringify(pc.data));
  const pcv = (await hal(`/api/campaigns/${pc.data.slug}`)).data.campaign;
  assert.equal(pcv.goal_type, "per_child");
  assert.equal(Math.round(pcv.goal_pc), 2500);
  assert.equal(pcv.goal, Math.round(pcv.kids * 2500));
  assert.equal(pcv.open_to_matching, true); assert.equal(pcv.invite_friends, true);

  // open goal, matching only
  const open = await ivy("/api/campaigns", { name: `Open Goal ${stamp}`, zips: ["11236"], goalType: "open", openToMatching: true, inviteFriends: false });
  assert.equal(open.status, 201);
  assert.equal((await ivy(`/api/campaigns/${open.data.slug}`)).data.campaign.goal, null);

  // on its own: can't pool
  const solo = await joe("/api/campaigns", { name: `Solo ${stamp}`, zips: ["11210"], goalType: "total", goalCents: 500000, openToMatching: false, inviteFriends: false });
  assert.equal((await joe(`/api/campaigns/${solo.data.slug}/pool-requests`, { toSlug: pc.data.slug })).status, 400);
  assert.equal((await hal(`/api/campaigns/${pc.data.slug}/pool-requests`, { toSlug: solo.data.slug })).status, 400);
  assert.equal((await hal("/api/campaigns", { name: "Bad", zips: ["11234"], goalType: "per_child", goalPerChildCents: 0 })).status, 400);

  // pledges, then pool Hal + Ivy
  await joe(`/api/campaigns/${pc.data.slug}/pledges`, { amountCents: 50000 });
  await joe(`/api/campaigns/${open.data.slug}/pledges`, { amountCents: 70000 });
  const req = await hal(`/api/campaigns/${pc.data.slug}/pool-requests`, { toSlug: open.data.slug });
  assert.equal(req.status, 201, JSON.stringify(req.data));
  assert.equal((await ivy(`/api/pool-requests/${req.data.id}`, { action: "accept" })).status, 200);

  // step 2: both confirm
  assert.equal((await joe(`/api/campaigns/${pc.data.slug}/coalition`, {})).status, 403, "non-organizer can't confirm");
  const c1 = await hal(`/api/campaigns/${pc.data.slug}/coalition`, {});
  assert.equal(c1.data.status, "forming");
  const c2 = await ivy(`/api/campaigns/${open.data.slug}/coalition`, {});
  assert.equal(c2.data.status, "confirmed");
  const poolId = c2.data.poolId;

  // the agreement names everyone (organizers and the donor) and is private to them
  const page = await hal(`/coalitions/${poolId}`);
  assert.match(page.data, /Coalition agreement/);
  assert.match(page.data, /Hal/); assert.match(page.data, /Ivy/); assert.match(page.data, /Joe/);
  assert.match(page.data, /\$1,200/);  // 500 + 700 pledged
  assert.match(page.data, /Hometown Seed Foundation/);
  const out = client(); await signup(out, "Oz");
  assert.match((await out(`/coalitions/${poolId}`)).data, /This agreement is private/);
  assert.match((await joe(`/coalitions/${poolId}`)).data, /Sign or leave/, "the donor signs too");
  const docId = (page.data.match(/"documentId\\?":\\?"([0-9a-f-]{36})/) || [])[1];
  assert.ok(docId, "document id on the page");

  // pledges pause while it's out for signature
  const paused = await out(`/api/campaigns/${pc.data.slug}/pledges`, { amountCents: 1000 });
  assert.equal(paused.status, 400); assert.match(paused.data.error, /paused/);

  // step 2 (cont.): everyone signs
  assert.equal((await hal(`/api/coalitions/${poolId}/approve`, { documentId: docId, name: "Hal H", agree: false })).status, 400);
  assert.equal((await out(`/api/coalitions/${poolId}/approve`, { documentId: docId, name: "Oz", agree: true })).status, 403);
  assert.equal((await hal(`/api/coalitions/${poolId}/approve`, { documentId: docId, name: "Hal H", agree: true })).data.waiting, 2);
  assert.equal((await ivy(`/api/coalitions/${poolId}/approve`, { documentId: docId, name: "Ivy I", agree: true })).data.waiting, 1);
  assert.equal((await joe(`/api/coalitions/${poolId}/approve`, { documentId: docId, name: "Joe J", agree: true })).data.status, "approved");
  const after = await hal(`/c/${pc.data.slug}`);
  assert.match(after.data, /Everyone signed/);

  // a new member resets the coalition to forming
  const kai = client(); await signup(kai, "Kai");
  const k = await kai("/api/campaigns", { name: `Late ${stamp}`, zips: ["11234"], goalType: "open" });
  const r2 = await kai(`/api/campaigns/${k.data.slug}/pool-requests`, { toSlug: pc.data.slug });
  assert.equal((await hal(`/api/pool-requests/${r2.data.id}`, { action: "accept" })).status, 200);
  assert.match((await hal(`/coalitions/${poolId}`)).data, /Forming/);
});

test("Treasury application: prepare, PDF, send (mock), approve, pay, distribute", { skip }, async () => {
  const lea = client(), max = client(), outsider = client();
  await signup(lea, "Lea"); await signup(max, "Max"); await signup(outsider, "Ned");
  const c = await lea("/api/campaigns", { name: `Treasury Run ${stamp}`, zips: ["11234"], goalType: "open" });
  await max(`/api/campaigns/${c.data.slug}/pledges`, { amountCents: 150000 });
  const conf = await lea(`/api/campaigns/${c.data.slug}/coalition`, {});
  assert.equal(conf.data.status, "confirmed", "a coalition of one is confirmed at once");
  const poolId = conf.data.poolId;
  const page = await lea(`/coalitions/${poolId}`);
  const docId = (page.data.match(/"documentId\\?":\\?"([0-9a-f-]{36})/) || [])[1];
  // the application is filled in automatically once everyone (organizer and donor) signs
  assert.equal((await lea(`/api/coalitions/${poolId}/submit`, {})).status, 400, "can't send before everyone signs");
  assert.equal((await lea(`/api/coalitions/${poolId}/approve`, { documentId: docId, name: "Lea L", agree: true })).data.status, "confirmed");
  assert.equal((await lea(`/api/coalitions/${poolId}/application`, { recognition: true, recognition_name: "X" })).status, 400, "not yet");
  assert.equal((await max(`/api/coalitions/${poolId}/approve`, { documentId: docId, name: "Max M", agree: true })).data.status, "approved");

  assert.equal((await outsider(`/api/coalitions/${poolId}/application`, { recognition: false })).status, 403);
  assert.equal((await lea(`/api/coalitions/${poolId}/application`, { recognition: true, recognition_name: "" })).status, 400);
  assert.equal((await max(`/api/coalitions/${poolId}/application`, { recognition: true, recognition_name: "Marine Park neighbors" })).status, 200, "donors can manage it too");
  const ready = await lea(`/coalitions/${poolId}`);
  assert.match(ready.data, /Hometown Seed Foundation/);
  assert.match(ready.data, /2(<!-- -->)? (<!-- -->)?people(<!-- -->)? signed/);

  const pdf = await fetch(BASE + `/api/coalitions/${poolId}/application/pdf`, { headers: { cookie: lea.cookie() } });
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.equal((await fetch(BASE + `/api/coalitions/${poolId}/application/pdf`, { headers: { cookie: outsider.cookie() } })).status, 403);

  const sent = await lea(`/api/coalitions/${poolId}/submit`, {});
  assert.match(sent.data.reference, /^MOCK-TA-\d{8}-[0-9A-F]{6}$/);
  assert.equal((await lea(`/api/campaigns/${c.data.slug}/delete`, { confirm: "DELETE" })).status, 400, "can't delete once it's with Treasury");
  assert.equal((await max(`/api/coalitions/${poolId}/leave`, { confirm: true })).status, 400, "can't leave once it's with Treasury");
  assert.equal((await lea(`/api/coalitions/${poolId}/payment`, { method: "ach", reference: "x", amount_cents: 150000 })).status, 400, "no payment before approval");
  assert.equal((await lea(`/api/coalitions/${poolId}/treasury-mock`, { action: "approve" })).data.status, "accepted");
  assert.equal((await lea(`/api/coalitions/${poolId}/payment`, { method: "wire", reference: "FED-123", amount_cents: 150000 })).data.status, "funded");
  assert.equal((await lea(`/api/coalitions/${poolId}/treasury-mock`, { action: "distribute" })).data.status, "distributed");
  const done = await lea(`/coalitions/${poolId}`);
  assert.match(done.data, /Distributed to children/);
  assert.match(done.data, /To Treasury: (<!-- -->)?Qualified Class Contribution Application/);
  assert.match((await lea(`/c/${c.data.slug}`)).data, /In kids/);
});

test("leaving a coalition and deleting a campaign", { skip }, async () => {
  const amy = client(), bo = client(), dot = client();
  await signup(amy, "Amy"); await signup(bo, "Bo"); await signup(dot, "Dot");
  const a = await amy("/api/campaigns", { name: `Leave A ${stamp}`, zips: ["11234"], goalType: "open", openToMatching: true });
  const b = await bo("/api/campaigns", { name: `Leave B ${stamp}`, zips: ["11236"], goalType: "open", openToMatching: true });
  await dot(`/api/campaigns/${a.data.slug}/pledges`, { amountCents: 20000 });
  await dot(`/api/campaigns/${b.data.slug}/pledges`, { amountCents: 30000 });
  const req = await amy(`/api/campaigns/${a.data.slug}/pool-requests`, { toSlug: b.data.slug });
  await bo(`/api/pool-requests/${req.data.id}`, { action: "accept" });
  await amy(`/api/campaigns/${a.data.slug}/coalition`, {});
  const conf = await bo(`/api/campaigns/${b.data.slug}/coalition`, {});
  assert.equal(conf.data.status, "confirmed");
  const poolId = conf.data.poolId;
  assert.match((await amy(`/coalitions/${poolId}`)).data, /version <!-- -->1|version 1/);

  // the donor leaves: pledges withdrawn, new version for the rest
  assert.equal((await dot(`/api/coalitions/${poolId}/leave`, {})).status, 400, "needs confirmation");
  const left = await dot(`/api/coalitions/${poolId}/leave`, { confirm: true });
  assert.equal(left.status, 200, JSON.stringify(left.data));
  assert.equal(left.data.status, "confirmed"); assert.equal(left.data.newAgreement, true);
  const v2 = await amy(`/coalitions/${poolId}`);
  assert.match(v2.data, /version <!-- -->2|version 2/);
  assert.doesNotMatch(v2.data.split("5. Signatures")[1], /Dot/);
  assert.match((await dot(`/coalitions/${poolId}`)).data, /This agreement is private/);
  assert.equal((await amy(`/api/campaigns/${a.data.slug}`)).data.campaign.raised, 0);
  assert.equal((await dot(`/api/coalitions/${poolId}/leave`, { confirm: true })).status, 403, "already out");

  // Bo takes his campaign out: Amy is a coalition of one, version 3
  assert.equal((await dot(`/api/campaigns/${b.data.slug}/leave-coalition`, { confirm: true })).status, 403);
  const out = await bo(`/api/campaigns/${b.data.slug}/leave-coalition`, { confirm: true });
  assert.equal(out.data.status, "confirmed");
  assert.equal((await bo(`/api/campaigns/${b.data.slug}`)).data.campaign.pool_id, null);
  const v3 = await amy(`/coalitions/${poolId}`);
  assert.match(v3.data, /version <!-- -->3|version 3/);
  const doc3 = (v3.data.match(/"documentId\\?":\\?"([0-9a-f-]{36})/) || [])[1];
  assert.equal((await amy(`/api/coalitions/${poolId}/approve`, { documentId: doc3, name: "Amy A", agree: true })).data.status, "approved");

  // Amy leaves too: her campaign goes with her and the coalition dissolves
  assert.equal((await amy(`/api/coalitions/${poolId}/leave`, { confirm: true })).data.status, "dissolved");
  assert.equal((await amy(`/api/campaigns/${a.data.slug}`)).data.campaign.pool_id, null);

  // deleting a campaign: owner only, typed confirmation
  assert.equal((await bo(`/api/campaigns/${b.data.slug}/delete`, { confirm: "nope" })).status, 400);
  assert.equal((await dot(`/api/campaigns/${b.data.slug}/delete`, { confirm: "DELETE" })).status, 403);
  assert.equal((await bo(`/api/campaigns/${b.data.slug}/delete`, { confirm: "delete" })).status, 200);
  assert.equal((await bo(`/api/campaigns/${b.data.slug}`)).status, 404);
});

test("nonprofits: register by EIN, choose as Qualified Donor, sign Section 4", { skip }, async () => {
  const org = client(), rep = client(), out = client();
  await signup(org, "Una"); await signup(out, "Vic");
  const r = await rep("/api/auth/signup", { email: `wes-${stamp}@example.com`, name: "Wes", password: PW, hasNonprofit: true });
  assert.equal(r.data.user.has_nonprofit, true);
  await rep("/api/auth/verify", { token: tokenOf(r.data.verification.devLink) });

  // lookup and register (IRS file)
  const look = await rep("/api/nonprofits/lookup?ein=00-0000123");
  assert.equal(look.data.org.source, "irs"); assert.equal(look.data.org.is501c3, true);
  assert.equal((await rep("/api/nonprofits", { ein: "000000456", title: "President" })).status, 400, "not a 501(c)(3)");
  assert.equal((await rep("/api/nonprofits", { ein: "000000123" })).status, 400, "title required");
  const reg = await rep("/api/nonprofits", { ein: "00-0000123", title: "Executive Director", phone: "718-555-0199" });
  assert.equal(reg.status, 201, JSON.stringify(reg.data)); assert.equal(reg.data.verified, "irs");
  assert.match((await rep("/account")).data, /501\(c\)\(3\)/);
  assert.match((await out("/nonprofits")).data, /TEST COMMUNITY FOUNDATION/);

  // coalition with the rep as a donor; organizer picks the rep's nonprofit
  const c = await org("/api/campaigns", { name: `Np Run ${stamp}`, zips: ["11234"], goalType: "open" });
  await rep(`/api/campaigns/${c.data.slug}/pledges`, { amountCents: 40000 });
  const conf = await org(`/api/campaigns/${c.data.slug}/coalition`, {});
  const poolId = conf.data.poolId;
  assert.equal((await rep(`/api/coalitions/${poolId}/donor`, { nonprofitId: reg.data.id })).status, 403, "donors can't choose");
  const ch = await org(`/api/coalitions/${poolId}/donor`, { nonprofitId: reg.data.id });
  assert.equal(ch.data.newAgreement, true);
  const page = await org(`/coalitions/${poolId}`);
  assert.match(page.data, /TEST COMMUNITY FOUNDATION, represented in this coalition by Wes/);
  const docId = (page.data.match(/"documentId\\?":\\?"([0-9a-f-]{36})/) || [])[1];
  await org(`/api/coalitions/${poolId}/approve`, { documentId: docId, name: "Una U", agree: true });
  assert.equal((await rep(`/api/coalitions/${poolId}/approve`, { documentId: docId, name: "Wes W", agree: true })).data.status, "approved");

  // the rep signs Section 4 before it can be sent
  assert.match((await org(`/api/coalitions/${poolId}/submit`, {})).data.error, /needs to sign Section 4/);
  assert.equal((await org(`/api/coalitions/${poolId}/donor-sign`, { name: "Una", certify: true })).status, 403);
  assert.equal((await rep(`/api/coalitions/${poolId}/donor-sign`, { name: "Someone", certify: true })).status, 400);
  assert.equal((await rep(`/api/coalitions/${poolId}/donor-sign`, { name: "Wes", certify: true })).status, 200);
  const sent = await org(`/api/coalitions/${poolId}/submit`, {});
  assert.match(sent.data.reference, /^MOCK-TA-/);
  const pdf = await fetch(BASE + `/api/coalitions/${poolId}/application/pdf`, { headers: { cookie: rep.cookie() } });
  assert.equal(pdf.status, 200);
});

test("demo account (temporary)", { skip }, async () => {
  const d = client();
  const r = await d("/api/auth/demo", {});
  if (r.status === 404) return;   // demo data not loaded (CI runs without it)
  assert.equal(r.status, 200);
  assert.equal(r.data.user.is_demo, true);
  assert.match((await d("/me")).data, /Amenia Kids Fund/);
  assert.equal((await d("/api/account/delete", { password: "x", confirm: "DELETE" })).status, 403);
  assert.equal((await d("/api/account/password", { current: "x", next: "another long phrase" })).status, 403);
  assert.equal((await client()("/api/auth/signup", { email: "demo@demo.hometownseed.org", name: "X", password: PW })).status, 400);
  const pm = await d("/api/demo/pledge-map");
  assert.ok(pm.data.pledges.some((p) => p.id === "dell"), "pledge map layer has Dell");
  assert.match(pm.data.rows, /12501,/);
  assert.equal(pm.data.pledges.find((p) => p.id === "dell").donor_type, "foundation");
  assert.match((await d("/nonprofits")).data, /Wassaic Project/);
  assert.match((await d("/zip/12545")).data, /Cary Institute of Ecosystem Studies/);
  const inbox = (await d("/api/messages")).data;
  assert.ok(inbox.some((c) => c.kind === "coalition"), "demo has a coalition chat");
  assert.match((await d("/me")).data, /Harlem Valley Seed/);
  const bis = pm.data.pledges.findIndex((p) => p.id === "bisignano");
  assert.ok(bis >= 0, "Bisignano is mapped");
  assert.match(pm.data.rows, new RegExp(`11234,[^;]*\\b${bis}:\\d+`), "Bisignano covers 11234");
  assert.match((await d("/zip/11234")).data, /Bisignano/);
  assert.match((await d("/zip/94110")).data, /Anonymous donor \(San Francisco\)/);
  assert.doesNotMatch((await d("/zip/12501")).data, /Bisignano/);
});

test("messaging: direct, campaign organizer, coalition chat, unread, block", { skip }, async () => {
  const ann = client(), bob = client(), cat = client(), out = client();
  await signup(ann, "Ann"); await signup(bob, "Bob"); await signup(cat, "Cat"); await signup(out, "Oli");
  const me = async (c) => (await c("/api/profile")).data;
  const bobId = (await bob("/api/auth/login", { email: `bob-${stamp}@example.com`, password: PW })).data.user.id;

  // Bob isn't discoverable yet (no profile, no campaign)
  assert.equal((await ann("/api/messages", { to: bobId, body: "Hi Bob" })).status, 403);
  await bob("/api/profile", { home_zip: "11234", target_zips: ["11234"], gift_types: ["cash"], per_child_cents: 2500 });
  assert.equal((await ann("/api/messages", { to: bobId, body: "" })).status, 400);
  const start = await ann("/api/messages", { to: bobId, body: "Hi Bob, want to pool for 11234?" });
  assert.equal(start.status, 201, JSON.stringify(start.data));
  const conv = start.data.id;
  assert.equal((await ann("/api/messages", { to: bobId, body: "Second note" })).data.id, conv, "same conversation reused");
  assert.equal((await bob("/api/messages/unread")).data.unread, 2);
  const list = await bob("/api/messages");
  assert.equal(list.data[0].title, "Ann"); assert.equal(list.data[0].unread, 2);
  assert.doesNotMatch(JSON.stringify(list.data), /@example\.com/, "no emails in conversations");
  const th = await bob(`/api/messages/${conv}`);
  assert.equal(th.data.messages.length, 2);
  assert.equal((await bob("/api/messages/unread")).data.unread, 0, "opening marks read");
  assert.equal((await bob(`/api/messages/${conv}`, { body: "Yes! Let's do it." })).status, 201);
  assert.equal((await ann(`/api/messages/${conv}?after=${th.data.messages[1].id}`)).data.messages[0].body, "Yes! Let's do it.");
  assert.equal((await out(`/api/messages/${conv}`)).status, 403, "outsiders can't read");
  assert.match((await ann(`/messages/${conv}`)).data, /pool for 11234/);

  // blocking
  const annId = (await ann("/api/auth/login", { email: `ann-${stamp}@example.com`, password: PW })).data.user.id;
  await bob(`/api/users/${annId}/block`, { block: true });
  assert.equal((await ann(`/api/messages/${conv}`, { body: "hello?" })).status, 403);
  await bob(`/api/users/${annId}/block`, { block: false });
  assert.equal((await ann(`/api/messages/${conv}`, { body: "hello again" })).status, 201);

  // message a campaign's organizer by slug, and the coalition chat
  const camp = await cat("/api/campaigns", { name: `Chat Camp ${stamp}`, zips: ["11236"], goalType: "open" });
  const toOrg = await out("/api/messages", { campaign: camp.data.slug, body: "Question about your campaign" });
  assert.equal(toOrg.status, 201);
  assert.equal((await cat("/api/messages")).data[0].subtitle, `About Chat Camp ${stamp}`);
  await ann(`/api/campaigns/${camp.data.slug}/pledges`, { amountCents: 2000 });
  const conf = await cat(`/api/campaigns/${camp.data.slug}/coalition`, {});
  assert.equal((await out(`/api/coalitions/${conf.data.poolId}/chat`, {})).status, 403);
  const chat = await cat(`/api/coalitions/${conf.data.poolId}/chat`, {});
  assert.equal((await cat(`/api/messages/${chat.data.id}`, { body: "Please sign the agreement, everyone!" })).status, 201);
  assert.ok((await ann("/api/messages/unread")).data.unread >= 1, "donor in the coalition sees the group message");
  assert.equal((await ann(`/api/messages/${chat.data.id}`)).data.kind, "coalition");
  void me;
});
