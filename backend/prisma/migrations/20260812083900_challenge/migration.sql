-- AlterTable
ALTER TABLE "po_header_results" ADD COLUMN     "remarks_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remarks_locked_at" TIMESTAMP(3),
ADD COLUMN     "remarks_locked_by" TEXT;

-- AlterTable
ALTER TABLE "tokens" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '30 days');

-- CreateTable
CREATE TABLE "po_header_remarks" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "point_no" INTEGER NOT NULL,
    "remark" TEXT NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "po_header_remarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "po_header_remarks_po_number_idx" ON "po_header_remarks"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "po_header_remarks_po_number_point_no_submitted_by_key" ON "po_header_remarks"("po_number", "point_no", "submitted_by");

-- AddForeignKey
ALTER TABLE "po_header_remarks" ADD CONSTRAINT "po_header_remarks_po_number_fkey" FOREIGN KEY ("po_number") REFERENCES "po_header_results"("po_number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_header_remarks" ADD CONSTRAINT "po_header_remarks_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
