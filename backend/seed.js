import db, { prisma } from "./lib/prisma.js";

/**
 * Inserts one sample PO audit result (+ a verification workflow in
 * "assigned" status, + one workflow step) so getPOAuditResults /
 * getPOAuditResult have something real to return for a demo.
 *
 * Run after createAdmin.js:
 *   node seed.js
 */
async function seed() {
  await db();

  const adminUser = await prisma.user.findFirst({ where: { username: "admin" } });
  if (!adminUser) {
    throw new Error("No admin user found - run `node createAdmin.js` first.");
  }

  const auditResult = await prisma.auditResult.create({
    data: {
      type: "PO",
      po_number: "4500123456",
      po_type: "ZLRM",
      po_status: "",
      po_material_number: "4500123456-10",
      vendor_code: "V-100234",
      nameOfVendor: "Acme Engineering Pvt Ltd",
      material_code: "MAT-9981",
      material_disc: "Hex Bolt M12x50",
      plant: "P100",
      fiscalYear: "2026",
      po_created_date: new Date("2026-05-12"),
      po_delivery_date: new Date("2026-06-01"),
      pr_create_date: new Date("2026-05-10"),
      payment_term: "Z101",
      inco_term: "EXW",
      po_qty: 500,
      pr_quantity: 500,
      auditedOn: new Date(),
      results: [
        { pointNo: "1", verified: true, remarks: [], not_applicable: false, missing_data: false, manual_verification: false, advance: false },
        { pointNo: "2", verified: true, remarks: [], not_applicable: false, missing_data: false, manual_verification: false, advance: false },
        { pointNo: "6", verified: false, remarks: ["PO qty exceeds PR qty by 8%, tolerance 5%"], not_applicable: false, missing_data: false, manual_verification: false, advance: false },
      ],
    },
  });

  const workflow = await prisma.verificationWorkflow.create({
    data: {
      auditResultId: auditResult.id,
      currentStatus: "assigned",
      assignedTo: adminUser.id,
    },
  });

  await prisma.verificationWorkflowStep.create({
    data: {
      verificationWorkflowId: workflow.id,
      action: "assigned",
      userId: adminUser.id,
      details: { note: "Auto-assigned by seed script for demo purposes" },
    },
  });

  console.log("✅ Seeded 1 demo PO audit result:", auditResult.po_number);
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
