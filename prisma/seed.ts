import { prisma } from "../src/lib/db";
import { createContract } from "../src/lib/contracts";
import {
  startWorkflow,
  submitDecision,
} from "../src/lib/workflow";
import { createSignatureRequests, signDocument } from "../src/lib/signing";
import { addObligation } from "../src/lib/obligations";

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function reset() {
  await prisma.auditEvent.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.workflowTemplate.deleteMany();
  await prisma.contractTemplate.deleteMany();
  await prisma.user.deleteMany();
}

const NDA_BODY = `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into between
{{company}} and {{counterparty}} ("the Parties").

1. CONFIDENTIAL INFORMATION. Each Party may disclose confidential and
   proprietary information to the other Party solely for the purpose of
   evaluating a potential business relationship.

2. OBLIGATIONS. The receiving Party shall (a) hold Confidential Information in
   strict confidence, and (b) not disclose it to third parties.

3. TERM. This Agreement remains in effect for two (2) years from the Effective
   Date.

4. GOVERNING LAW. This Agreement is governed by the laws of the State of
   Delaware.`;

const MSA_BODY = `MASTER SERVICES AGREEMENT

This Master Services Agreement governs the provision of services by
{{company}} ("Provider") to {{counterparty}} ("Client").

1. SERVICES. Provider will perform the services described in one or more
   Statements of Work executed under this Agreement.

2. FEES. Client shall pay the fees set out in each Statement of Work within
   thirty (30) days of invoice.

3. TERM & RENEWAL. The initial term is twelve (12) months and renews
   automatically for successive twelve (12) month terms unless either Party
   gives sixty (60) days' notice of non-renewal.

4. LIMITATION OF LIABILITY. Neither Party's aggregate liability shall exceed
   the fees paid in the twelve (12) months preceding the claim.`;

const SOW_BODY = `STATEMENT OF WORK

This Statement of Work is issued under the Master Services Agreement between
{{company}} and {{counterparty}}.

1. SCOPE. Provider will deliver the platform implementation described in
   Exhibit A.

2. MILESTONES. Delivery milestones and acceptance criteria are set out in
   Exhibit B.

3. FEES. Total fixed fee of {{value}}, invoiced 50% on kickoff and 50% on
   acceptance.`;

async function main() {
  console.log("Resetting database…");
  await reset();

  console.log("Creating users…");
  const alice = await prisma.user.create({
    data: { name: "Alice Admin", email: "alice@acme.example", role: "ADMIN", title: "General Counsel" },
  });
  const larry = await prisma.user.create({
    data: { name: "Larry Legal", email: "larry@acme.example", role: "LEGAL", title: "Contracts Attorney" },
  });
  const nina = await prisma.user.create({
    data: { name: "Nina Counsel", email: "nina@acme.example", role: "LEGAL", title: "Staff Attorney" },
  });
  const mona = await prisma.user.create({
    data: { name: "Mona Manager", email: "mona@acme.example", role: "MANAGER", title: "VP Operations" },
  });
  const marcus = await prisma.user.create({
    data: { name: "Marcus Manager", email: "marcus@acme.example", role: "MANAGER", title: "Director, Procurement" },
  });
  const sam = await prisma.user.create({
    data: { name: "Sam Signer", email: "sam@acme.example", role: "SIGNER", title: "CEO" },
  });
  await prisma.user.create({
    data: { name: "Vic Viewer", email: "vic@acme.example", role: "VIEWER", title: "Auditor" },
  });

  console.log("Creating contract templates…");
  await prisma.contractTemplate.createMany({
    data: [
      { name: "Mutual NDA", category: "NDA", description: "Standard two-way non-disclosure agreement.", body: NDA_BODY },
      { name: "Master Services Agreement", category: "MSA", description: "Framework agreement for ongoing services.", body: MSA_BODY },
      { name: "Statement of Work", category: "SOW", description: "Project-specific scope under an MSA.", body: SOW_BODY },
    ],
  });

  console.log("Creating workflow templates…");
  // 1) Standard: legal review (any) -> manager approval (all) -> signature
  const standard = await prisma.workflowTemplate.create({
    data: {
      name: "Standard Review & Sign",
      description: "Legal review, then manager approval, then signature. The default path for most contracts.",
      isDefault: true,
      steps: {
        create: [
          { order: 1, name: "Legal Review", type: "REVIEW", assigneeRole: "LEGAL", completionRule: "ANY", allowReject: true },
          { order: 2, name: "Manager Approval", type: "APPROVAL", assigneeRole: "MANAGER", completionRule: "ALL", allowReject: true },
          { order: 3, name: "Signature", type: "SIGNATURE", completionRule: "ALL", allowReject: false },
        ],
      },
    },
  });

  // 2) Fast-track: single legal review -> signature
  await prisma.workflowTemplate.create({
    data: {
      name: "Fast-Track NDA",
      description: "A single legal reviewer approves, then it goes straight to signature. For low-risk NDAs.",
      steps: {
        create: [
          { order: 1, name: "Legal Review", type: "REVIEW", assigneeRole: "LEGAL", completionRule: "ANY", allowReject: true },
          { order: 2, name: "Signature", type: "SIGNATURE", completionRule: "ALL", allowReject: false },
        ],
      },
    },
  });

  // 3) High-value: all legal + all managers + admin approval -> signature
  const highValue = await prisma.workflowTemplate.create({
    data: {
      name: "High-Value Multi-Approval",
      description: "Every attorney reviews, every manager approves, then an executive approves, then signature. For high-dollar or high-risk deals.",
      steps: {
        create: [
          { order: 1, name: "Full Legal Review", type: "REVIEW", assigneeRole: "LEGAL", completionRule: "ALL", allowReject: true },
          { order: 2, name: "Management Approval", type: "APPROVAL", assigneeRole: "MANAGER", completionRule: "ALL", allowReject: true },
          { order: 3, name: "Executive Approval", type: "APPROVAL", assigneeRole: "ADMIN", completionRule: "ALL", allowReject: true },
          { order: 4, name: "Signature", type: "SIGNATURE", completionRule: "ALL", allowReject: false },
        ],
      },
    },
  });

  const sys = { id: alice.id, name: "Alice Admin" };

  // --- Contract A: DRAFT (no workflow yet) -------------------------------
  console.log("Seeding contracts…");
  await createContract(
    {
      title: "Acme × Globex — Mutual NDA",
      description: "NDA to explore a data-sharing partnership.",
      counterparty: "Globex Corporation",
      category: "NDA",
      createdById: larry.id,
      ownerId: larry.id,
      body: NDA_BODY.replace("{{company}}", "Acme, Inc.").replace("{{counterparty}}", "Globex Corporation"),
    },
    { id: larry.id, name: larry.name }
  );

  // --- Contract B: IN_REVIEW (standard workflow, sitting at legal) --------
  const inReview = await createContract(
    {
      title: "Acme × Initech — Master Services Agreement",
      description: "Ongoing platform services engagement.",
      counterparty: "Initech LLC",
      category: "MSA",
      value: 240000,
      effectiveDate: days(7),
      expirationDate: days(372),
      createdById: mona.id,
      ownerId: mona.id,
      body: MSA_BODY.replace("{{company}}", "Acme, Inc.").replace("{{counterparty}}", "Initech LLC"),
    },
    { id: mona.id, name: mona.name }
  );
  await startWorkflow(inReview.id, standard.id, { id: mona.id, name: mona.name });
  // leave it waiting at Legal Review.

  // --- Contract C: IN_REVIEW at manager approval (legal already reviewed) -
  const atApproval = await createContract(
    {
      title: "Acme × Umbrella — SOW #1",
      description: "Implementation project under the Umbrella MSA.",
      counterparty: "Umbrella Co.",
      category: "SOW",
      value: 85000,
      effectiveDate: days(3),
      expirationDate: days(120),
      createdById: mona.id,
      ownerId: mona.id,
      body: SOW_BODY.replace("{{company}}", "Acme, Inc.").replace("{{counterparty}}", "Umbrella Co.").replace("{{value}}", "$85,000"),
    },
    { id: mona.id, name: mona.name }
  );
  const cInstance = await startWorkflow(atApproval.id, standard.id, { id: mona.id, name: mona.name });
  {
    // Larry reviews (ANY rule → advances to Manager Approval).
    const legalStep = await prisma.workflowStepInstance.findFirstOrThrow({
      where: { instanceId: cInstance, order: 1 },
    });
    await submitDecision({
      stepId: legalStep.id,
      userId: larry.id,
      decision: "REVIEWED",
      comment: "Terms look standard. Approved to proceed.",
      actor: { id: larry.id, name: larry.name },
    });
  }
  // Now waiting on Mona + Marcus (ALL). Marcus approves; Mona still pending.
  {
    const mgrStep = await prisma.workflowStepInstance.findFirstOrThrow({
      where: { instanceId: cInstance, order: 2 },
    });
    await submitDecision({
      stepId: mgrStep.id,
      userId: marcus.id,
      decision: "APPROVED",
      comment: "Budget approved.",
      actor: { id: marcus.id, name: marcus.name },
    });
  }

  // --- Contract D: OUT_FOR_SIGNATURE (approved, partially signed) ---------
  const forSig = await createContract(
    {
      title: "Acme × Soylent — Vendor NDA",
      description: "NDA ahead of a supplier evaluation.",
      counterparty: "Soylent Industries",
      category: "NDA",
      createdById: larry.id,
      ownerId: larry.id,
      body: NDA_BODY.replace("{{company}}", "Acme, Inc.").replace("{{counterparty}}", "Soylent Industries"),
    },
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
  // Now OUT_FOR_SIGNATURE — send to two signers, first one signs.
  await createSignatureRequests(
    forSig.id,
    [
      { signerName: "Sam Signer", signerEmail: "sam@acme.example" },
      { signerName: "Gordon Gekko", signerEmail: "gordon@soylent.example" },
    ],
    sys
  );
  {
    const first = await prisma.signature.findFirstOrThrow({ where: { contractId: forSig.id, order: 0 } });
    await signDocument({ token: first.token, signatureData: "Sam Signer", signatureType: "TYPED", ipAddress: "203.0.113.10" });
  }

  // --- Contract E: EXECUTED (fully signed) with obligations ---------------
  const executed = await createContract(
    {
      title: "Acme × Wonka — Master Services Agreement",
      description: "Confectionery logistics platform services.",
      counterparty: "Wonka Industries",
      category: "MSA",
      value: 480000,
      effectiveDate: days(-15),
      expirationDate: days(350),
      createdById: mona.id,
      ownerId: mona.id,
      body: MSA_BODY.replace("{{company}}", "Acme, Inc.").replace("{{counterparty}}", "Wonka Industries"),
    },
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
  await createSignatureRequests(
    executed.id,
    [
      { signerName: "Sam Signer", signerEmail: "sam@acme.example" },
      { signerName: "Willy Wonka", signerEmail: "willy@wonka.example" },
    ],
    sys
  );
  {
    const sigs = await prisma.signature.findMany({ where: { contractId: executed.id }, orderBy: { order: "asc" } });
    for (const s of sigs) {
      await signDocument({ token: s.token, signatureData: s.signerName, signatureType: "TYPED", ipAddress: "203.0.113.20" });
    }
  }
  // Enforcement: obligations on the executed contract.
  await addObligation(executed.id, { title: "Quarterly service fee", description: "Invoice #1 of 4 due.", type: "PAYMENT", dueDate: days(12), ownerId: mona.id }, sys);
  await addObligation(executed.id, { title: "Renewal decision", description: "60-day non-renewal notice window opens.", type: "RENEWAL", dueDate: days(290), ownerId: mona.id }, sys);
  await addObligation(executed.id, { title: "Contract expiration", description: "Term ends; confirm renewal or wind-down.", type: "EXPIRATION", dueDate: days(350), ownerId: mona.id }, sys);
  // One deliberately overdue obligation to exercise the enforcement view.
  await addObligation(executed.id, { title: "SOC 2 report delivery", description: "Vendor must provide current SOC 2 Type II report.", type: "COMPLIANCE", dueDate: days(-3), ownerId: larry.id }, sys);

  const counts = {
    users: await prisma.user.count(),
    contracts: await prisma.contract.count(),
    workflows: await prisma.workflowTemplate.count(),
    obligations: await prisma.obligation.count(),
    auditEvents: await prisma.auditEvent.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
