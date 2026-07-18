import { prisma } from "../src/lib/db";
import { createContract } from "../src/lib/contracts";
import { startWorkflow, submitDecision } from "../src/lib/workflow";
import { createSignatureRequests, signDocument } from "../src/lib/signing";
import { addObligation } from "../src/lib/obligations";
import { proposeRedline } from "../src/lib/redline";
import { renderTemplate } from "../src/lib/template";
import { hashPassword } from "../src/lib/password";

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function reset() {
  await prisma.session.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.reminderLog.deleteMany();
  await prisma.systemState.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.emailMessage.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.signature.deleteMany();
  await prisma.workflowStepAction.deleteMany();
  await prisma.workflowStepInstance.deleteMany();
  await prisma.workflowInstance.deleteMany();
  await prisma.obligation.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.contract.updateMany({ data: { currentVersionId: null } });
  await prisma.contractVersion.updateMany({ data: { basedOnVersionId: null } });
  await prisma.contractVersion.deleteMany();
  await prisma.contract.updateMany({ data: { amendsContractId: null } });
  await prisma.contract.deleteMany();
  await prisma.contractTemplate.deleteMany();
  await prisma.clause.deleteMany();
  await prisma.workflowTemplate.deleteMany();
  await prisma.counterparty.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

// --- Template bodies with merge fields (used by the generation engine) ------

const NDA_TPL = `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of {{ today | date }} between {{ org.legalName }} and {{ counterparty.legalName }} (each a "Party").

1. CONFIDENTIAL INFORMATION. Each Party may disclose confidential and
   proprietary information to the other solely to evaluate a potential business
   relationship.

2. OBLIGATIONS. The receiving Party shall (a) hold Confidential Information in
   strict confidence, and (b) not disclose it to third parties.

3. TERM. This Agreement remains in effect for {{ term | default:"two (2) years" }}
   from the Effective Date.

4. GOVERNING LAW. This Agreement is governed by the laws of {{ org.jurisdiction | default:"the State of Delaware" }}.`;

const MSA_TPL = `MASTER SERVICES AGREEMENT

This Master Services Agreement is entered into as of {{ today | date }} between
{{ org.legalName }} ("Provider") and {{ counterparty.legalName }} ("Client").

1. SERVICES. Provider will perform the services described in one or more
   Statements of Work executed under this Agreement.

2. FEES. {{#if contract.value}}The total contract value is {{ contract.value | money }}. {{/if}}Client shall pay invoices within thirty (30) days.

3. TERM & RENEWAL. The initial term is twelve (12) months and renews for
   successive twelve (12) month terms unless either Party gives sixty (60) days'
   notice of non-renewal.

4. LIMITATION OF LIABILITY. Neither Party's aggregate liability shall not exceed
   the fees paid in the twelve (12) months preceding the claim.

5. GOVERNING LAW. Governed by the laws of {{ org.jurisdiction | default:"the State of Delaware" }}.`;

const SOW_TPL = `STATEMENT OF WORK

Issued under the Master Services Agreement between {{ org.legalName }} and
{{ counterparty.legalName }}, dated {{ today | date }}.

1. SCOPE. {{ scope | default:"The platform implementation described in Exhibit A." }}

2. MILESTONES. Delivery milestones and acceptance criteria are set out in
   Exhibit B.

3. FEES. Total fixed fee of {{ contract.value | money }}, invoiced 50% on
   kickoff and 50% on acceptance.`;

async function main() {
  console.log("Resetting database…");
  await reset();

  console.log("Creating organization…");
  const org = {
    name: "Acme, Inc.",
    legalName: "Acme, Inc.",
    address: "1 Market Street, San Francisco, CA 94105",
    email: "legal@acme.example",
    signatoryName: "Sam Signer",
    signatoryTitle: "Chief Executive Officer",
    jurisdiction: "the State of Delaware",
  };
  await prisma.organization.create({ data: org });

  console.log("Creating users…");
  const alice = await prisma.user.create({ data: { name: "Alice Admin", email: "alice@acme.example", role: "ADMIN", title: "General Counsel" } });
  const larry = await prisma.user.create({ data: { name: "Larry Legal", email: "larry@acme.example", role: "LEGAL", title: "Contracts Attorney" } });
  const nina = await prisma.user.create({ data: { name: "Nina Counsel", email: "nina@acme.example", role: "LEGAL", title: "Staff Attorney" } });
  const mona = await prisma.user.create({ data: { name: "Mona Manager", email: "mona@acme.example", role: "MANAGER", title: "VP Operations" } });
  const marcus = await prisma.user.create({ data: { name: "Marcus Manager", email: "marcus@acme.example", role: "MANAGER", title: "Director, Procurement" } });
  const sam = await prisma.user.create({ data: { name: "Sam Signer", email: "sam@acme.example", role: "SIGNER", title: "CEO" } });
  await prisma.user.create({ data: { name: "Vic Viewer", email: "vic@acme.example", role: "VIEWER", title: "Auditor" } });

  // Demo credentials: every seeded user logs in with the password "password".
  await prisma.user.updateMany({ data: { passwordHash: hashPassword("password") } });

  console.log("Creating counterparties…");
  const globex = await prisma.counterparty.create({ data: { name: "Globex Corporation", legalName: "Globex Corporation", address: "500 Globex Plaza, Cypress Creek", contactName: "Hank Scorpio", contactEmail: "hank@globex.example", jurisdiction: "the State of New York" } });
  const initech = await prisma.counterparty.create({ data: { name: "Initech LLC", legalName: "Initech, LLC", address: "4120 Freidrich Ln, Austin, TX", contactName: "Bill Lumbergh", contactEmail: "bill@initech.example" } });
  const umbrella = await prisma.counterparty.create({ data: { name: "Umbrella Co.", legalName: "Umbrella Corporation", contactName: "Albert Wesker", contactEmail: "wesker@umbrella.example" } });
  const soylent = await prisma.counterparty.create({ data: { name: "Soylent Industries", legalName: "Soylent Industries, Inc.", contactName: "Gordon Gekko", contactEmail: "gordon@soylent.example" } });
  const wonka = await prisma.counterparty.create({ data: { name: "Wonka Industries", legalName: "Wonka Industries, Ltd.", contactName: "Willy Wonka", contactEmail: "willy@wonka.example" } });

  console.log("Creating contract templates…");
  await prisma.contractTemplate.createMany({
    data: [
      { name: "Mutual NDA", category: "NDA", description: "Standard two-way non-disclosure agreement.", body: NDA_TPL },
      { name: "Master Services Agreement", category: "MSA", description: "Framework agreement for ongoing services.", body: MSA_TPL },
      { name: "Statement of Work", category: "SOW", description: "Project-specific scope under an MSA.", body: SOW_TPL },
    ],
  });

  console.log("Creating clause library…");
  await prisma.clause.createMany({
    data: [
      {
        name: "Limitation of Liability (12-month cap)",
        category: "Liability",
        description: "Standard cap at fees paid in the trailing twelve months.",
        body: "LIMITATION OF LIABILITY. Except for breaches of confidentiality or a Party's indemnification obligations, neither Party's aggregate liability arising out of or related to this Agreement shall exceed the fees paid or payable in the twelve (12) months preceding the event giving rise to the claim. In no event shall either Party be liable for indirect, incidental, special, or consequential damages.",
      },
      {
        name: "Governing Law",
        category: "General",
        description: "Uses the organization's jurisdiction merge field.",
        body: "GOVERNING LAW. This Agreement shall be governed by and construed in accordance with the laws of {{ org.jurisdiction | default:\"the State of Delaware\" }}, without regard to its conflict-of-laws principles.",
      },
      {
        name: "Termination for Convenience (30 days)",
        category: "Termination",
        description: "Either party may exit with thirty days' written notice.",
        body: "TERMINATION FOR CONVENIENCE. Either Party may terminate this Agreement for any reason upon thirty (30) days' prior written notice to the other Party. Fees accrued through the effective date of termination remain payable.",
      },
      {
        name: "Force Majeure",
        category: "General",
        description: "Standard excuse for events beyond reasonable control.",
        body: "FORCE MAJEURE. Neither Party shall be liable for any failure or delay in performance (other than payment obligations) caused by events beyond its reasonable control, including acts of God, natural disasters, war, terrorism, labor disputes, or governmental action, provided the affected Party promptly notifies the other and uses reasonable efforts to resume performance.",
      },
    ],
  });

  console.log("Creating workflow templates…");
  const standard = await prisma.workflowTemplate.create({
    data: {
      name: "Standard Review & Sign",
      description: "Legal review, then manager approval, then signature. The default path for most contracts.",
      isDefault: true,
      steps: { create: [
        { order: 1, name: "Legal Review", type: "REVIEW", assigneeRole: "LEGAL", completionRule: "ANY", allowReject: true },
        { order: 2, name: "Manager Approval", type: "APPROVAL", assigneeRole: "MANAGER", completionRule: "ALL", allowReject: true },
        { order: 3, name: "Signature", type: "SIGNATURE", completionRule: "ALL", allowReject: false },
      ] },
    },
  });
  await prisma.workflowTemplate.create({
    data: {
      name: "Fast-Track NDA",
      description: "A single legal reviewer approves, then it goes straight to signature. For low-risk NDAs.",
      steps: { create: [
        { order: 1, name: "Legal Review", type: "REVIEW", assigneeRole: "LEGAL", completionRule: "ANY", allowReject: true },
        { order: 2, name: "Signature", type: "SIGNATURE", completionRule: "ALL", allowReject: false },
      ] },
    },
  });
  await prisma.workflowTemplate.create({
    data: {
      name: "High-Value Multi-Approval",
      description: "Every attorney reviews, every manager approves, then an executive approves, then signature. For high-dollar or high-risk deals.",
      steps: { create: [
        { order: 1, name: "Full Legal Review", type: "REVIEW", assigneeRole: "LEGAL", completionRule: "ALL", allowReject: true },
        { order: 2, name: "Management Approval", type: "APPROVAL", assigneeRole: "MANAGER", completionRule: "ALL", allowReject: true },
        { order: 3, name: "Executive Approval", type: "APPROVAL", assigneeRole: "ADMIN", completionRule: "ALL", allowReject: true },
        { order: 4, name: "Signature", type: "SIGNATURE", completionRule: "ALL", allowReject: false },
      ] },
    },
  });

  const sys = { id: alice.id, name: "Alice Admin" };

  // Render a template body against real data (mirrors the generation engine).
  function render(
    tpl: string,
    cp: { name: string; legalName: string | null; jurisdiction?: string | null },
    extra: Record<string, unknown> = {}
  ) {
    return renderTemplate(tpl, {
      org,
      counterparty: { name: cp.name, legalName: cp.legalName ?? cp.name, jurisdiction: cp.jurisdiction ?? "" },
      contract: { value: (extra.value as number) ?? null, currency: "USD" },
      today: new Date().toISOString(),
      ...extra,
    });
  }

  console.log("Seeding contracts…");
  // A) DRAFT — no workflow (a candidate for "generate document" in the UI).
  await createContract(
    { title: "Acme × Globex — Mutual NDA", description: "NDA to explore a data-sharing partnership.", counterparty: globex.name, counterpartyId: globex.id, category: "NDA", createdById: larry.id, ownerId: larry.id, body: render(NDA_TPL, globex) },
    { id: larry.id, name: larry.name }
  );

  // B) IN_REVIEW at legal — plus a proposed redline to demonstrate negotiation.
  const inReview = await createContract(
    { title: "Acme × Initech — Master Services Agreement", description: "Ongoing platform services engagement.", counterparty: initech.name, counterpartyId: initech.id, category: "MSA", value: 240000, effectiveDate: days(7), expirationDate: days(372), createdById: mona.id, ownerId: mona.id, body: render(MSA_TPL, initech, { value: 240000 }) },
    { id: mona.id, name: mona.name }
  );
  await startWorkflow(inReview.id, standard.id, { id: mona.id, name: mona.name });
  // Larry proposes a redline tightening the liability cap.
  const redlineBody = render(MSA_TPL, initech, { value: 240000 }).replace(
    "the fees paid in the twelve (12) months preceding the claim.",
    "the fees paid in the six (6) months preceding the claim, except for breaches of confidentiality or misuse of Confidential Information."
  );
  await proposeRedline(inReview.id, redlineBody, "Tighten liability cap to 6 months; carve out confidentiality breaches.", { id: larry.id, name: larry.name });

  // C) IN_REVIEW at manager approval (legal already reviewed).
  const atApproval = await createContract(
    { title: "Acme × Umbrella — SOW #1", description: "Implementation project under the Umbrella MSA.", counterparty: umbrella.name, counterpartyId: umbrella.id, category: "SOW", value: 85000, effectiveDate: days(3), expirationDate: days(120), createdById: mona.id, ownerId: mona.id, body: render(SOW_TPL, umbrella, { value: 85000, scope: "Rollout of the analytics platform across three business units." }) },
    { id: mona.id, name: mona.name }
  );
  const cInstance = await startWorkflow(atApproval.id, standard.id, { id: mona.id, name: mona.name });
  {
    const legalStep = await prisma.workflowStepInstance.findFirstOrThrow({ where: { instanceId: cInstance, order: 1 } });
    await submitDecision({ stepId: legalStep.id, userId: larry.id, decision: "REVIEWED", comment: "Terms look standard. Approved to proceed.", actor: { id: larry.id, name: larry.name } });
    const mgrStep = await prisma.workflowStepInstance.findFirstOrThrow({ where: { instanceId: cInstance, order: 2 } });
    await submitDecision({ stepId: mgrStep.id, userId: marcus.id, decision: "APPROVED", comment: "Budget approved.", actor: { id: marcus.id, name: marcus.name } });
  }

  // D) OUT_FOR_SIGNATURE (approved, partially signed).
  const forSig = await createContract(
    { title: "Acme × Soylent — Vendor NDA", description: "NDA ahead of a supplier evaluation.", counterparty: soylent.name, counterpartyId: soylent.id, category: "NDA", createdById: larry.id, ownerId: larry.id, body: render(NDA_TPL, soylent) },
    { id: larry.id, name: larry.name }
  );
  const dInstance = await startWorkflow(forSig.id, standard.id, { id: larry.id, name: larry.name });
  {
    const legalStep = await prisma.workflowStepInstance.findFirstOrThrow({ where: { instanceId: dInstance, order: 1 } });
    await submitDecision({ stepId: legalStep.id, userId: nina.id, decision: "REVIEWED", actor: { id: nina.id, name: nina.name } });
    const mgrStep = await prisma.workflowStepInstance.findFirstOrThrow({ where: { instanceId: dInstance, order: 2 } });
    await submitDecision({ stepId: mgrStep.id, userId: mona.id, decision: "APPROVED", actor: { id: mona.id, name: mona.name } });
    await submitDecision({ stepId: mgrStep.id, userId: marcus.id, decision: "APPROVED", actor: { id: marcus.id, name: marcus.name } });
  }
  await createSignatureRequests(forSig.id, [
    { signerName: "Sam Signer", signerEmail: "sam@acme.example" },
    { signerName: "Gordon Gekko", signerEmail: "gordon@soylent.example" },
  ], sys);
  {
    const first = await prisma.signature.findFirstOrThrow({ where: { contractId: forSig.id, order: 0 } });
    await signDocument({ token: first.token, signatureData: "Sam Signer", signatureType: "TYPED", ipAddress: "203.0.113.10" });
  }

  // E) EXECUTED (fully signed) with obligations.
  const executed = await createContract(
    { title: "Acme × Wonka — Master Services Agreement", description: "Confectionery logistics platform services.", counterparty: wonka.name, counterpartyId: wonka.id, category: "MSA", value: 480000, effectiveDate: days(-15), expirationDate: days(350), createdById: mona.id, ownerId: mona.id, body: render(MSA_TPL, wonka, { value: 480000 }) },
    { id: mona.id, name: mona.name }
  );
  const eInstance = await startWorkflow(executed.id, standard.id, { id: mona.id, name: mona.name });
  {
    const legalStep = await prisma.workflowStepInstance.findFirstOrThrow({ where: { instanceId: eInstance, order: 1 } });
    await submitDecision({ stepId: legalStep.id, userId: larry.id, decision: "REVIEWED", actor: { id: larry.id, name: larry.name } });
    const mgrStep = await prisma.workflowStepInstance.findFirstOrThrow({ where: { instanceId: eInstance, order: 2 } });
    await submitDecision({ stepId: mgrStep.id, userId: mona.id, decision: "APPROVED", actor: { id: mona.id, name: mona.name } });
    await submitDecision({ stepId: mgrStep.id, userId: marcus.id, decision: "APPROVED", actor: { id: marcus.id, name: marcus.name } });
  }
  await createSignatureRequests(executed.id, [
    { signerName: "Sam Signer", signerEmail: "sam@acme.example" },
    { signerName: "Willy Wonka", signerEmail: "willy@wonka.example" },
  ], sys);
  {
    const sigs = await prisma.signature.findMany({ where: { contractId: executed.id }, orderBy: { order: "asc" } });
    for (const s of sigs) {
      await signDocument({ token: s.token, signatureData: s.signerName, signatureType: "TYPED", ipAddress: "203.0.113.20" });
    }
  }
  await addObligation(executed.id, { title: "Quarterly service fee", description: "Invoice #1 of 4 due.", type: "PAYMENT", dueDate: days(12), ownerId: mona.id }, sys);
  await addObligation(executed.id, { title: "Renewal decision", description: "60-day non-renewal notice window opens.", type: "RENEWAL", dueDate: days(290), ownerId: mona.id }, sys);
  await addObligation(executed.id, { title: "Contract expiration", description: "Term ends; confirm renewal or wind-down.", type: "EXPIRATION", dueDate: days(350), ownerId: mona.id }, sys);
  await addObligation(executed.id, { title: "SOC 2 report delivery", description: "Vendor must provide current SOC 2 Type II report.", type: "COMPLIANCE", dueDate: days(-3), ownerId: larry.id }, sys);

  const counts = {
    org: await prisma.organization.count(),
    users: await prisma.user.count(),
    counterparties: await prisma.counterparty.count(),
    contracts: await prisma.contract.count(),
    contractTemplates: await prisma.contractTemplate.count(),
    workflows: await prisma.workflowTemplate.count(),
    obligations: await prisma.obligation.count(),
    proposedRedlines: await prisma.contractVersion.count({ where: { status: "PROPOSED" } }),
    auditEvents: await prisma.auditEvent.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
