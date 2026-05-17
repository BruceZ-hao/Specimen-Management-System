ALTER TABLE "sample_orders" ADD COLUMN "report_storage_path" TEXT NOT NULL DEFAULT 'uploads/reports';

ALTER TABLE "sample_attachments" ADD COLUMN "sample_step_id" INTEGER;

CREATE INDEX "sample_attachments_sample_step_id_idx" ON "sample_attachments"("sample_step_id");
