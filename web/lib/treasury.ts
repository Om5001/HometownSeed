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
import type { User } from "./auth";
import type { buildDocument } from "./coalition";

type AgreementContent = Awaited<ReturnType<typeof buildDocument>>;
export const TREASURY_TO = process.env.TREASURY_SUBMISSION_EMAIL || "trumpaccounts-applications@treasury.gov.mock";
export const mockTreasuryEnabled = () => process.env.MOCK_TREASURY !== "0";

export type DonorInput = {
  entity_name: string; entity_address: string; ein: string;
  entity_type: "501c3" | "state" | "subdivision" | "tribal";
  rep_name: string; rep_title: string; rep_address: string; rep_email: string; rep_phone: string;
  amount_cents: number;
  recognition: boolean; recognition_name: string;
  signature: string; certify: boolean;
};

export type Application = {
  form: string; prepared_at: string; mock: boolean;
  section1: Omit<DonorInput, "amount_cents" | "recognition" | "recognition_name" | "signature" | "certify">;
  section2: { amount_cents: number; class_type: "qualified_geographic_area"; note: string };
  section3: { recognition: boolean; recognition_name: string | null };
  section4: { representations: string[]; signed_name: string; signature: string; title: string; date: string; certified: boolean };
  attachment_a: { zip_codes: AgreementContent["qualified_class"]["zip_codes"]; ages: string; birth_years: string;
                  est_beneficiaries_in_class: number; est_beneficiaries_in_area: number; meets_5000_minimum: boolean };
  attachment_b: { coalition: string; agreement_version: number; agreement_hash: string; parties: { campaign: string; organizers: string[]; pledged_cents: number }[];
                  signatures: { campaign: string; signed_name: string; approved_at: string }[] };
};

export const ENTITY_TYPES: Record<DonorInput["entity_type"], string> = {
  "501c3": "501(c)(3) Tax-exempt organization", state: "State or District of Columbia",
  subdivision: "Political subdivision of a State", tribal: "Indian Tribal Government",
};
const REPRESENTATIONS = [
  "All information provided in this Application is accurate and complete.",
  "The entity listed in this Application is a Qualified Donor.",
  "Submission of this Application does not constitute acceptance by Treasury of any contribution or the formation of a binding agreement.",
  "I have reviewed the Trump Accounts Qualified Class Contribution Agreement. A final agreement will be executed by both parties after Treasury receives and reviews this Application.",
];

export function validateDonor(b: Partial<DonorInput>): DonorInput {
  const s = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
  const d = {
    entity_name: s(b.entity_name), entity_address: s(b.entity_address, 300), ein: s(b.ein, 20),
    entity_type: (["501c3", "state", "subdivision", "tribal"].includes(String(b.entity_type)) ? b.entity_type : "") as DonorInput["entity_type"],
    rep_name: s(b.rep_name, 100), rep_title: s(b.rep_title, 100), rep_address: s(b.rep_address, 300),
    rep_email: s(b.rep_email, 200).toLowerCase(), rep_phone: s(b.rep_phone, 40),
    amount_cents: Math.round(Number(b.amount_cents) || 0),
    recognition: !!b.recognition, recognition_name: s(b.recognition_name, 120),
    signature: s(b.signature, 100), certify: b.certify === true,
  };
  const missing = (["entity_name", "entity_address", "ein", "entity_type", "rep_name", "rep_title", "rep_address", "rep_email", "rep_phone", "signature"] as const)
    .filter((k) => !d[k]);
  if (missing.length) throw new HttpError(400, "Fill in every field in Sections 1 and 4 (missing: " + missing.join(", ").replace(/_/g, " ") + ").");
  if (!/^\d{2}-?\d{7}$/.test(d.ein)) throw new HttpError(400, "The EIN should look like 12-3456789.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.rep_email)) throw new HttpError(400, "Enter a valid email for the authorized representative.");
  if (d.amount_cents < 100) throw new HttpError(400, "Enter the proposed contribution amount.");
  if (d.recognition && !d.recognition_name) throw new HttpError(400, "Give the name Treasury should use for public recognition, or choose not to authorize it.");
  if (d.signature.toLowerCase() !== d.rep_name.toLowerCase()) throw new HttpError(400, "The signature must match the authorized representative's name.");
  if (!d.certify) throw new HttpError(400, "The authorized representative must certify the application.");
  d.ein = d.ein.includes("-") ? d.ein : d.ein.slice(0, 2) + "-" + d.ein.slice(2);
  return d;
}

async function organizerOf(poolId: string, userId: string) {
  const [m] = await db()`select 1 from campaigns c join campaign_members m on m.campaign_id = c.id
                         where c.pool_id = ${poolId} and m.user_id = ${userId}`;
  if (!m) throw new HttpError(403, "Only organizers in this coalition can do that.");
}

async function poolStatus(poolId: string) {
  const [p] = await db()<{ status: string; name: string }[]>`select status, name from pools where id = ${poolId}`;
  if (!p) throw new HttpError(404, "Coalition not found.");
  return p;
}

/** Fills the application from the signed agreement plus the donor's details. */
export async function prepareApplication(user: User, poolId: string, input: Partial<DonorInput>) {
  await organizerOf(poolId, user.id);
  const p = await poolStatus(poolId);
  if (!["approved", "rejected"].includes(p.status)) throw new HttpError(400, "The application can be prepared once every campaign has signed the coalition agreement, and before it's sent.");
  const d = validateDonor(input);
  const sql = db();
  const [doc] = await sql<{ id: string; version: number; content: AgreementContent; content_hash: string }[]>`
    select id, version, content, content_hash from coalition_documents where pool_id = ${poolId} and status = 'active' order by version desc limit 1`;
  if (!doc) throw new HttpError(400, "No signed agreement found.");
  const sigs = await sql<{ campaign: string; signed_name: string; approved_at: string }[]>`
    select c.name as campaign, a.signed_name, a.approved_at::text from document_approvals a join campaigns c on c.id = a.campaign_id
    where a.document_id = ${doc.id} order by a.approved_at`;
  const c = doc.content;
  const app: Application = {
    form: "Trump Accounts Qualified Class Contribution Application (Treasury draft, updated June 10, 2026)",
    prepared_at: new Date().toISOString(), mock: mockTreasuryEnabled(),
    section1: { entity_name: d.entity_name, entity_address: d.entity_address, ein: d.ein, entity_type: d.entity_type,
      rep_name: d.rep_name, rep_title: d.rep_title, rep_address: d.rep_address, rep_email: d.rep_email, rep_phone: d.rep_phone },
    section2: { amount_cents: d.amount_cents, class_type: "qualified_geographic_area",
      note: "Qualified Geographic Area class under IRC 530A(f)(3)(B). This class type is not listed on the draft form; details are in Attachment A, as the form's instructions direct." },
    section3: { recognition: d.recognition, recognition_name: d.recognition ? d.recognition_name : null },
    section4: { representations: REPRESENTATIONS, signed_name: d.rep_name, signature: d.signature, title: d.rep_title,
      date: new Date().toISOString().slice(0, 10), certified: true },
    attachment_a: { zip_codes: c.qualified_class.zip_codes, ages: c.qualified_class.ages, birth_years: c.qualified_class.birth_years,
      est_beneficiaries_in_class: c.qualified_class.est_beneficiaries_in_class, est_beneficiaries_in_area: c.qualified_class.est_beneficiaries_in_area,
      meets_5000_minimum: c.qualified_class.meets_5000_minimum },
    attachment_b: { coalition: c.coalition.name, agreement_version: doc.version, agreement_hash: doc.content_hash,
      parties: c.parties.map((x) => ({ campaign: x.campaign, organizers: x.organizers.map((o) => `${o.name} (${o.role})`), pledged_cents: x.pledged_cents })),
      signatures: sigs },
  };
  const hash = crypto.createHash("sha256").update(JSON.stringify(app)).digest("hex");
  const [row] = await sql<{ id: string }[]>`select id from treasury_submissions where pool_id = ${poolId} and status in ('draft', 'rejected') order by created_at desc limit 1`;
  if (row) {
    await sql`update treasury_submissions set application = ${sql.json(app as never)}, application_hash = ${hash}, amount_cents = ${d.amount_cents},
              per_child_cents = ${c.qualified_class.est_beneficiaries_in_class ? Math.floor(d.amount_cents / c.qualified_class.est_beneficiaries_in_class) : 0},
              status = 'draft', mock = ${app.mock} where id = ${row.id}`;
  } else {
    await sql`insert into treasury_submissions (pool_id, zctas, min_age, max_age, est_beneficiaries, amount_cents, per_child_cents, application, application_hash, mock)
              select ${poolId}, ${c.qualified_class.zip_codes.map((z) => z.zcta)}::char(5)[], p.min_age, p.max_age, ${c.qualified_class.est_beneficiaries_in_class},
                     ${d.amount_cents}, ${c.qualified_class.est_beneficiaries_in_class ? Math.floor(d.amount_cents / c.qualified_class.est_beneficiaries_in_class) : 0},
                     ${sql.json(app as never)}, ${hash}, ${app.mock}
              from pools p where p.id = ${poolId}`;
  }
  if (p.status === "rejected") await sql`update pools set status = 'approved' where id = ${poolId}`;
  return { hash };
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
  let page: PDFPage = pdf.addPage([W, H]), y = H - M;
  const clean = (t: string) => t.replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e\xa0-\xff]/g, "");
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M - 6; header(); };
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
  text(`Signature (typed, electronic): /s/ ${app.section4.signature}  |  Date: ${app.section4.date}`);

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
  for (const p of b.parties) text(`${p.campaign}: ${p.organizers.join(", ")}. Pledged ${usd(p.pledged_cents)}.`, { s: 9, x: M + 8 });
  gap(4); text("Signed by:", { f: bold, s: 9 });
  for (const s of b.signatures) text(`${s.campaign}: ${s.signed_name}, ${s.approved_at.slice(0, 16)}`, { s: 9, x: M + 8 });
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
  await organizerOf(poolId, user.id);
  const p = await poolStatus(poolId);
  if (p.status !== "approved") throw new HttpError(400, "Prepare the application after everyone signs, then send it.");
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
  await organizerOf(poolId, user.id);
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
  await organizerOf(poolId, user.id);
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
