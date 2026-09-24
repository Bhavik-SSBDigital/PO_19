-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "is_ssb_digital" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tokens" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '30 days');

-- CreateTable
CREATE TABLE "sync_batch_log" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "line_item_count" INTEGER NOT NULL DEFAULT 0,
    "header_count" INTEGER NOT NULL DEFAULT 0,
    "rc_count" INTEGER NOT NULL DEFAULT 0,
    "rc_cached" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_batch_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_batch_log_batch_id_key" ON "sync_batch_log"("batch_id");

-- CreateIndex
CREATE INDEX "sync_batch_log_processed_at_idx" ON "sync_batch_log"("processed_at");
