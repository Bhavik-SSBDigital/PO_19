-- AlterTable
ALTER TABLE "tokens" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '30 days');

-- CreateTable
CREATE TABLE "po_header_results" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "vendor_code" TEXT,
    "purchase_group" TEXT,
    "po_type" TEXT,
    "results" JSONB NOT NULL DEFAULT '[]',
    "auditedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "po_header_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "po_header_results_po_number_key" ON "po_header_results"("po_number");

-- CreateIndex
CREATE INDEX "po_header_results_po_number_idx" ON "po_header_results"("po_number");

-- CreateIndex
CREATE INDEX "po_header_results_purchase_group_idx" ON "po_header_results"("purchase_group");
