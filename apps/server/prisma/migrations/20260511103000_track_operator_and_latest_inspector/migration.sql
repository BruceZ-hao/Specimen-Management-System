ALTER TABLE "sample_steps" ADD COLUMN "operator_user_id" INTEGER;
ALTER TABLE "sample_steps" ADD COLUMN "latest_inspector_user_id" INTEGER;
ALTER TABLE "sample_steps" ADD COLUMN "latest_inspection_at" DATETIME;

CREATE INDEX "sample_steps_operator_user_id_idx" ON "sample_steps"("operator_user_id");
CREATE INDEX "sample_steps_latest_inspector_user_id_idx" ON "sample_steps"("latest_inspector_user_id");
