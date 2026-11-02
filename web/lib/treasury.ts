/**
 * Treasury application: "Trump Accounts Qualified Class Contribution Application"
 * (Treasury draft dated June 10, 2026), prepared from a signed coalition agreement.
 *
 * MOCK MODE: nothing is sent to Treasury. "Sending" stores the filled application, writes
 * the cover email to the `outbox` table (shown in the app), and moves the coalition along.
 * Treasury's side (approval, payment instructions, distribution) can be simulated so the
 * whole flow can be tried end to end. Set MOCK_TREASURY=0 to turn the simulator off.
 *
 * Important: the June 2026 draft form covers Nationwide, Birth-Year and State classes only.
 * It says a donor funding everyone in a Qualified Geographic Area (IRC 530A(f)(3)(B)), which
 * is what a ZIP-code coalition is, must contact Treasury separately. So the class details go
 * in Attachment A and no class box on the form is checked.
 */
import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "./db";
import { HttpError } from "./http";
import { PLATFORM, platformPlaceholders, type Platform } from "./platform";
import type { User } from "./auth";
import type { buildDocument, Person } from "./coalition";

type Sql = ReturnType<typeof db>;
type AgreementContent = Awaited<ReturnType<typeof buildDocument>>;
export const TREASURY_TO = process.env.TREASURY_SUBMISSION_EMAIL || "trumpaccounts-applications@treasury.gov.mock";
export const mockTreasuryEnabled = () => process.env.MOCK_TREASURY !== "0";

export type Application = {
  form: string; prepared_at: string; mock: boolean; placeholders: string[];
  section1: Platform;
  section2: { amount_cents: number; class_type: "qualified_geographic_area"; note: string };
  section3: { recognition: boolean; recognition_name: string | null };
  section4: { representations: string[]; signed_name: string; signature: string; title: string; date: string; certified: boolean };
  attachment_a: { zip_codes: AgreementContent["qualified_class"]["zip_codes"]; ages: string; birth_years: string;
                  est_beneficiaries_in_class: number; est_beneficiaries_in_area: number; meets_5000_minimum: boolean };
  attachment_b: { coalition: string; agreement_version: number; agreement_hash: string;
                  campaigns: { campaign: string; organizers: string[]; pledged_cents: number }[];
                  people: { name: string; role: string; pledged_cents: number; signed_name: string; signed_at: string }[] };
};

export const ENTITY_TYPES: Record<string, string> = {
  "501c3": "501(c)(3) Tax-exempt organization", state: "State or District of Columbia",
  subdivision: "Political subdivision of a State", tribal: "Indian Tribal Government",
};
const REPRESENTATIONS = [
  "All information provided in this Application is accurate and complete.",
  "The entity listed in this Application is a Qualified Donor.",
  "Submission of this Application does not constitute acceptance by Treasury of any contribution or the formation of a binding agreement.",
  "I have reviewed the Trump Accounts Qualified Class Contribution Agreement. A final agreement will be executed by both parties after Treasury receives and reviews this Application.",
];

/** Anyone named in the coalition agreement (organizers and donors) can see and manage the application. */
async function partyOf(poolId: string, userId: string) {
  const [m] = await db()`select 1 from coalition_people(${poolId}) where user_id = ${userId}`;
  if (!m) throw new HttpError(403, "Only people in this coalition can do that.");
}

async function poolStatus(poolId: string) {
  const [p] = await db()<{ status: string; name: string }[]>`select status, name from pools where id = ${poolId}`;
  if (!p) throw new HttpError(404, "Coalition not found.");
  return p;
}

export const roleLabel = (p: Pick<Person, "organizer_of" | "owner_of" | "pledged_cents">) =>
  [p.owner_of.length ? "Organizer (started " + p.owner_of.join(", ") + ")" : p.organizer_of.length ? "Co-organizer of " + p.organizer_of.join(", ") : "",
   p.pledged_cents > 0 ? "Donor" : ""].filter(Boolean).join("; ") || "Member";

/**
 * Fills the application from the signed agreement. Hometown Seed's 501(c)(3) is the
 * Qualified Donor (Sections 1 and 4, see lib/platform.ts). The amount is the total
 * everyone signed for. Runs automatically when the last person signs; organizers can
 * then change the public-recognition choice (Section 3).
 */
export async function prepareApplication(sql: Sql, poolId: string, recognition?: { recognition: boolean; recognition_name: string | null }) {
  const [doc] = await sql<{ id: string; version: number; content: AgreementContent; content_hash: string }[]>`
    select id, version, content, content_hash from coalition_documents where pool_id = ${poolId} and status = 'active' order by version desc limit 1`;
  if (!doc) throw new HttpError(400, "No signed agreement found.");
  const sigs = new Map((await sql<{ user_id: string; signed_name: string; signed_at: string }[]>`
    select user_id, signed_name, signed_at::text from document_signatures where document_id = ${doc.id}`).map((r) => [r.user_id, r]));
  const c = doc.content;
  const [prev] = await sql<{ application: Application | null }[]>`
    select application from treasury_submissions where pool_id = ${poolId} order by created_at desc limit 1`;
  const rec = recognition ?? prev?.application?.section3 ?? { recognition: true, recognition_name: c.coalition.name };
  const amount = c.money.total_pledged_cents;
  const today = new Date().toISOString().slice(0, 10);
  const app: Application = {
    form: "Trump Accounts Qualified Class Contribution Application (Treasury draft, updated June 10, 2026)",
    prepared_at: new Date().toISOString(), mock: mockTreasuryEnabled(), placeholders: platformPlaceholders(),
    section1: { ...PLATFORM },
    section2: { amount_cents: amount, class_type: "qualified_geographic_area",
      note: "Qualified Geographic Area class under IRC 530A(f)(3)(B). This class type is not listed on the draft form; details are in Attachment A, as the form's instructions direct." },
    section3: { recognition: rec.recognition, recognition_name: rec.recognition ? rec.recognition_name : null },
    section4: { representations: REPRESENTATIONS, signed_name: PLATFORM.rep_name, signature: PLATFORM.rep_name, title: PLATFORM.rep_title,
      date: today, certified: true },
    attachment_a: { zip_codes: c.qualified_class.zip_codes, ages: c.qualified_class.ages, birth_years: c.qualified_class.birth_years,
      est_beneficiaries_in_class: c.qualified_class.est_beneficiaries_in_class, est_beneficiaries_in_area: c.qualified_class.est_beneficiaries_in_area,
      meets_5000_minimum: c.qualified_class.meets_5000_minimum },
    attachment_b: { coalition: c.coalition.name, agreement_version: doc.version, agreement_hash: doc.content_hash,
      campaigns: c.parties.map((x) => ({ campaign: x.campaign, organizers: x.organizers.map((o) => `${o.name} (${o.role})`), pledged_cents: x.pledged_cents })),
      people: (c.people ?? []).map((p) => ({ name: p.name, role: roleLabel(p), pledged_cents: p.pledged_cents,
        signed_name: sigs.get(p.user_id)?.signed_name ?? "(account deleted)", signed_at: sigs.get(p.user_id)?.signed_at ?? "" })) },
  };
  const hash = crypto.createHash("sha256").update(JSON.stringify(app)).digest("hex");
  const perChild = c.qualified_class.est_beneficiaries_in_class ? Math.floor(amount / c.qualified_class.est_beneficiaries_in_class) : 0;
  const [row] = await sql<{ id: string }[]>`select id from treasury_submissions where pool_id = ${poolId} and status in ('draft', 'rejected') order by created_at desc limit 1`;
  if (row) {
    await sql`update treasury_submissions set application = ${sql.json(app as never)}, application_hash = ${hash}, amount_cents = ${amount},
              per_child_cents = ${perChild}, est_beneficiaries = ${c.qualified_class.est_beneficiaries_in_class},
              zctas = ${c.qualified_class.zip_codes.map((z) => z.zcta)}::char(5)[], status = 'draft', mock = ${app.mock} where id = ${row.id}`;
  } else {
    await sql`insert into treasury_submissions (pool_id, zctas, min_age, max_age, est_beneficiaries, amount_cents, per_child_cents, application, application_hash, mock, notes)
              select ${poolId}, ${c.qualified_class.zip_codes.map((z) => z.zcta)}::char(5)[], p.min_age, p.max_age, ${c.qualified_class.est_beneficiaries_in_class},
                     ${amount}, ${perChild}, ${sql.json(app as never)}, ${hash}, ${app.mock}, ${"From coalition agreement v" + doc.version}
              from pools p where p.id = ${poolId}`;
  }
  return { hash };
}

/** Organizers and donors choose how Treasury may recognize the gift (Section 3), before it's sent. */
export async function updateRecognition(user: User, poolId: string, b: { recognition?: unknown; recognition_name?: unknown }) {
  await partyOf(poolId, user.id);
  const p = await poolStatus(poolId);
  if (!["approved", "rejected"].includes(p.status)) throw new HttpError(400, "The application can be changed after everyone signs and before it's sent.");
  const recognition = b.recognition === true;
  const name = String(b.recognition_name ?? "").trim().slice(0, 120);
  if (recognition && !name) throw new HttpError(400, "Give the name Treasury should use for public recognition, or choose not to authorize it.");
  const sql = db();
  await prepareApplication(sql, poolId, { recognition, recognition_name: recognition ? name : null });
  if (p.status === "rejected") await sql`update pools set status = 'approved' where id = ${poolId}`;
  return { ok: true };
}

export async function getSubmission(poolId: string) {
  const [s] = await db()<{ id: string; status: string; application: Application | null; application_hash: string | null; treasury_reference: string | null;
                           submitted_at: string | null; decided_at: string | null; payment: Record<string, string> | null; mock: boolean; amount_cents: number }[]>`
    select id, status, application, application_hash, treasury_reference, submitted_at::text, decided_at::text, payment, mock, amount_cents::float8 as amount_cents
    from treasury_submissions where pool_id = ${poolId} order by created_at desc limit 1`;
  return s ?? null;
}

const usd = (c: number) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Renders the filled application + attachments as a PDF. */
export async function renderApplicationPdf(app: Application, hash: string, status: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Trump Accounts Qualified Class Contribution Application");
  pdf.setProducer("Hometown Seed");
  const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  let page: PDFPage = pdf.addPage([W, H]), y = H - M - 6;
  const clean = (t: string) => t.replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e\xa0-\xff]/g, "");
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M - 12; header(); };
  const need = (h: number) => { if (y - h < M) newPage(); };
  const text = (t: string, o: { f?: PDFFont; s?: number; x?: number; c?: [number, number, number] } = {}) => {
    const f = o.f ?? font, s = o.s ?? 10, x = o.x ?? M, maxW = W - M - x;
    const words = clean(t).split(/\s+/); let line = "";
    const flush = () => { need(s + 4); page.drawText(line, { x, y: y - s, size: s, font: f, color: rgb(...(o.c ?? [0.05, 0.1, 0.19])) }); y -= s + 4; line = ""; };
    for (const w of words) { const t2 = line ? line + " " + w : w; if (f.widthOfTextAtSize(t2, s) > maxW && line) { flush(); line = w; } else line = t2; }
    if (line) flush();
  };
  const gap = (n = 6) => { y -= n; };
  const rule = () => { need(8); page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.8, 0.83, 0.87) }); y -= 8; };
  const box = (checked: boolean, label: string) => {
    need(16);
    page.drawRectangle({ x: M + 6, y: y - 11, width: 9, height: 9, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.8 });
    if (checked) page.drawText("X", { x: M + 7.5, y: y - 10, size: 9, font: bold });
    page.drawText(clean(label), { x: M + 22, y: y - 10, size: 10, font });
    y -= 16;
  };
  const field = (label: string, value: string) => { text(`${label}: ${value}`, {}); };
  function header() {
    page.drawText(app.mock ? "MOCK - prepared by Hometown Seed - NOT SUBMITTED TO TREASURY" : "Prepared by Hometown Seed",
      { x: M, y: H - 30, size: 8, font: bold, color: rgb(0.75, 0.2, 0.18) });
    if (app.placeholders?.length) page.drawText(clean(`DRAFT: nonprofit details still to be filled in (${app.placeholders.join(", ")})`), { x: M, y: H - 49, size: 7, font: bold, color: rgb(0.75, 0.2, 0.18) });
    page.drawText(clean(`Application fingerprint ${hash.slice(0, 16)}... | status: ${status}`), { x: M, y: H - 40, size: 7, font, color: rgb(0.4, 0.45, 0.5) });
  }
  header();

  text("U.S. Department of the Treasury", { f: bold, s: 12 });
  text("Trump Accounts Qualified Class Contribution Application", { f: bold, s: 15 });
  text(`Form: ${app.form}`, { s: 8, c: [0.35, 0.4, 0.47] });
  gap(); rule();

  text("SECTION 1 - QUALIFIED DONOR INFORMATION", { f: bold, s: 11 }); gap(4);
  const s1 = app.section1;
  field("Name", s1.entity_name); field("Address", s1.entity_address); field("Employer Identification Number", s1.ein);
  text("Entity Type:"); for (const [k, v] of Object.entries(ENTITY_TYPES)) box(s1.entity_type === k, v);
  text("Authorized Representative:", { f: bold });
  field("Name and Title", `${s1.rep_name}, ${s1.rep_title}`); field("Address", s1.rep_address); text(`E-mail: ${s1.rep_email}  |  Phone: ${s1.rep_phone}`);
  gap(); rule();

  text("SECTION 2 - CONTRIBUTION DETAILS", { f: bold, s: 11 }); gap(4);
  field("Proposed Contribution Amount", usd(app.section2.amount_cents));
  text("Qualified Class Type (select ONLY one):");
  box(false, "Nationwide Class (America 250 Fund)"); box(false, "Birth-Year Class"); box(false, "State Class");
  text(`Requested: ${app.section2.note}`, { s: 9, c: [0.55, 0.35, 0.05] });
  gap(); rule();

  text("SECTION 3 - PUBLIC COMMUNICATIONS", { f: bold, s: 11 }); gap(4);
  box(app.section3.recognition, "I authorize Treasury to publicly recognize this contribution.");
  box(!app.section3.recognition, "I do NOT authorize Treasury to publicly recognize this contribution.");
  if (app.section3.recognition_name) field("Recognition name", app.section3.recognition_name);
  gap(); rule();

  text("SECTION 4 - REPRESENTATIONS", { f: bold, s: 11 }); gap(4);
  text("By submitting this Application and signing below, I, on behalf of the Qualified Donor, acknowledge and agree that:");
  app.section4.representations.forEach((r, i) => text(`(${String.fromCharCode(97 + i)}) ${r}`, { x: M + 12 }));
  gap(4);
  text("By signing below, I certify under penalties of perjury that I am an authorized representative of the entity identified as the Qualified Donor above, with the authority to make these representations and this contribution on behalf of the Qualified Donor.", { s: 9 });
  gap(6);
  need(2 * 16);
  text(`Authorized Representative Name: ${app.section4.signed_name}  |  Title: ${app.section4.title}`);
  text(`Signature (electronic, for the Qualified Donor): /s/ ${app.section4.signature}  |  Date: ${app.section4.date}`);

  newPage();
  const a = app.attachment_a;
  text("ATTACHMENT A - QUALIFIED GEOGRAPHIC AREA CLASS", { f: bold, s: 12 }); gap(4);
  text(`Trump Account beneficiaries in the Growth Period, ages ${a.ages} (born about ${a.birth_years}; Treasury sets exact birth years and the Measurement Date), residing in the ${a.zip_codes.length} ZIP code area(s) below. Estimated beneficiaries in the class: ${a.est_beneficiaries_in_class.toLocaleString("en-US")}. Estimated account beneficiaries in the area: ${a.est_beneficiaries_in_area.toLocaleString("en-US")} (${a.meets_5000_minimum ? "meets" : "does NOT meet"} the 5,000 minimum in IRC 530A(f)(3)(B)). Estimates: U.S. Census Bureau ACS 5-year data; Treasury determines residency from trustee records.`, { s: 9 });
  gap(6);
  const cols = [M, M + 60, M + 300, M + 410];
  const row = (cells: string[], f = font) => { need(14); cells.forEach((t, i) => page.drawText(clean(t), { x: cols[i], y: y - 9, size: 9, font: f })); y -= 14; };
  row(["ZIP", "Place", "Kids in class", "Median income"], bold);
  for (const z of a.zip_codes) row([z.zcta, z.place || "-", Math.round(z.kids).toLocaleString("en-US"), z.income ? "$" + z.income.toLocaleString("en-US") : "-"]);
  gap(10);
  const b = app.attachment_b;
  text("ATTACHMENT B - COALITION AGREEMENT", { f: bold, s: 12 }); gap(4);
  text(`Coalition: ${b.coalition}. Agreement version ${b.agreement_version}, SHA-256 ${b.agreement_hash}.`, { s: 9 });
  gap(4);
  for (const p of b.campaigns) text(`Campaign "${p.campaign}": organized by ${p.organizers.join(", ")}. Pledged ${usd(p.pledged_cents)}.`, { s: 9, x: M + 8 });
  gap(6); text("Everyone in the coalition, each of whom signed the agreement:", { f: bold, s: 9 }); gap(2);
  const pc = [M, M + 120, M + 330, M + 390];
  const prow = (cells: string[], f = font) => { need(13); cells.forEach((t, i) => page.drawText(clean(t).slice(0, i === 1 ? 50 : 44), { x: pc[i], y: y - 9, size: 8, font: f })); y -= 13; };
  prow(["Name", "Role", "Pledged", "Signed (typed name, UTC)"], bold);
  for (const x of b.people) prow([x.name, x.role, x.pledged_cents ? usd(x.pledged_cents) : "-", x.signed_at ? `/s/ ${x.signed_name}, ${x.signed_at.slice(0, 16)}` : x.signed_name]);
  gap(10);
  text(`Application fingerprint (SHA-256): ${hash}`, { s: 7, c: [0.4, 0.45, 0.5] });
  return pdf.save();
}

async function outbox(poolId: string, m: { direction?: "out" | "in"; to: string; from: string; subject: string; body: string; attachment?: string }) {
  await db()`insert into outbox (pool_id, direction, to_address, from_address, subject, body, attachment_name)
             values (${poolId}, ${m.direction ?? "out"}, ${m.to}, ${m.from}, ${m.subject}, ${m.body}, ${m.attachment ?? null})`;
}

/** "Send" the application to Treasury (mock: recorded in the outbox, nothing leaves the app). */
export async function submitApplication(user: User, poolId: string) {
  await partyOf(poolId, user.id);
  const p = await poolStatus(poolId);
  if (!["approved", "rejected"].includes(p.status)) throw new HttpError(400, "The application is sent after everyone in the coalition signs.");
  if (!mockTreasuryEnabled() && platformPlaceholders().length)
    throw new HttpError(400, "Fill in Hometown Seed's nonprofit details first (missing: " + platformPlaceholders().join(", ") + ").");
  if (p.status === "rejected") await prepareApplication(db(), poolId);
  const s = await getSubmission(poolId);
  if (!s?.application) throw new HttpError(400, "Fill in the application first.");
  const ref = `${s.mock ? "MOCK-" : ""}TA-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const sql = db();
  await sql`update treasury_submissions set status = 'submitted', submitted_at = now(), treasury_reference = ${ref} where id = ${s.id}`;
  await sql`update pools set status = 'submitted' where id = ${poolId}`;
  const a = s.application;
  await outbox(poolId, {
    to: TREASURY_TO, from: a.section1.rep_email,
    subject: `Qualified Class Contribution Application: ${a.section1.entity_name} (${usd(a.section2.amount_cents)})`,
    body: `To the Trump Accounts program office,\n\nPlease find attached a Qualified Class Contribution Application from ${a.section1.entity_name} (EIN ${a.section1.ein}) for a proposed contribution of ${usd(a.section2.amount_cents)} to Trump Account beneficiaries in a Qualified Geographic Area of ${a.attachment_a.zip_codes.length} ZIP code area(s) (${a.attachment_a.zip_codes.map((z) => z.zcta).join(", ")}), ages ${a.attachment_a.ages}. Class details are in Attachment A.\n\nReference: ${ref}\nApplication fingerprint: ${s.application_hash}\n\n${a.section4.signed_name}\n${a.section4.title}, ${a.section1.entity_name}\n${a.section1.rep_phone}`,
    attachment: "Trump-Accounts-Contribution-Application.pdf",
  });
  return { reference: ref };
}

/** Simulates Treasury's side, for trying the flow before a real connection exists. */
export async function mockTreasury(user: User, poolId: string, action: "approve" | "reject" | "distribute") {
  if (!mockTreasuryEnabled()) throw new HttpError(404, "The Treasury simulator is off.");
  await partyOf(poolId, user.id);
  const p = await poolStatus(poolId);
  const s = await getSubmission(poolId);
  if (!s) throw new HttpError(400, "No application yet.");
  const sql = db();
  const from = "trumpaccounts@treasury.gov.mock", to = s.application?.section1.rep_email ?? "donor";
  if (action === "approve" || action === "reject") {
    if (p.status !== "submitted") throw new HttpError(400, "Treasury can only decide on a sent application.");
    const ok = action === "approve";
    await sql`update treasury_submissions set status = ${ok ? "accepted" : "rejected"}, decided_at = now() where id = ${s.id}`;
    await sql`update pools set status = ${ok ? "accepted" : "rejected"} where id = ${poolId}`;
    await outbox(poolId, { direction: "in", from, to,
      subject: ok ? `Approved: contribution application ${s.treasury_reference}` : `Not approved: contribution application ${s.treasury_reference}`,
      body: ok
        ? `Treasury has reviewed application ${s.treasury_reference} and approved it. The Qualified Class Contribution Agreement is attached for signature. Transfer ${usd(s.amount_cents)} by ACH or wire using the instructions in the agreement (SIMULATED: no real instructions).`
        : `Treasury has reviewed application ${s.treasury_reference} and cannot approve it as submitted. Please review the class details and resubmit (SIMULATED).` });
    return { status: ok ? "accepted" : "rejected" };
  }
  if (p.status !== "funded") throw new HttpError(400, "Treasury distributes after the payment arrives.");
  await sql`update treasury_submissions set status = 'distributed' where id = ${s.id}`;
  await sql`update pools set status = 'distributed' where id = ${poolId}`;
  await outbox(poolId, { direction: "in", from, to, subject: `Distributed: ${s.treasury_reference}`,
    body: `Treasury has distributed the contribution in equal shares to the Trump Accounts of eligible beneficiaries in the class (SIMULATED).` });
  return { status: "distributed" };
}

/** Step 4: the charity reports its ACH or wire payment to Treasury. */
export async function recordPayment(user: User, poolId: string, b: { method?: string; reference?: string; amount_cents?: number }) {
  await partyOf(poolId, user.id);
  const p = await poolStatus(poolId);
  if (p.status !== "accepted") throw new HttpError(400, "Send the money after Treasury approves the application.");
  const method = b.method === "wire" ? "wire" : "ach";
  const reference = String(b.reference || "").trim().slice(0, 60);
  const amount = Math.round(Number(b.amount_cents) || 0);
  if (!reference) throw new HttpError(400, "Enter the ACH trace number or wire reference.");
  if (amount < 100) throw new HttpError(400, "Enter the amount sent.");
  const s = await getSubmission(poolId);
  const sql = db();
  const payment = { method, reference, amount_cents: amount, sent_at: new Date().toISOString(), recorded_by: user.display_name };
  await sql`update treasury_submissions set status = 'funded', payment = ${sql.json(payment as never)} where id = ${s!.id}`;
  await sql`update pools set status = 'funded' where id = ${poolId}`;
  await sql`insert into ledger_entries (entry_type, pool_id, amount_cents, external_ref, memo)
            values ('grant_to_treasury', ${poolId}, ${-amount}, ${reference}, ${"Contribution " + (s!.treasury_reference ?? "")})`;
  await outbox(poolId, { to: TREASURY_TO, from: s!.application?.section1.rep_email ?? "donor",
    subject: `Payment sent: ${s!.treasury_reference}`,
    body: `${method.toUpperCase()} payment of ${usd(amount)} sent for contribution ${s!.treasury_reference}. Reference: ${reference}.` });
  return { status: "funded" };
}

export async function getOutbox(poolId: string) {
  return db()<{ id: string; direction: string; to_address: string; from_address: string; subject: string; body: string; attachment_name: string | null; status: string; created_at: string }[]>`
    select id, direction, to_address, from_address, subject, body, attachment_name, status, created_at::text
    from outbox where pool_id = ${poolId} order by created_at desc`;
}
