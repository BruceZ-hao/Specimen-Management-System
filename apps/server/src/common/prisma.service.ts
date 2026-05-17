import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect()
    await this.applyLegacySampleSchemaFixes()
  }

  private async applyLegacySampleSchemaFixes() {
    const sampleOrders = await this.getTableColumns('sample_orders')
    const sampleSteps = await this.getTableColumns('sample_steps')
    const sampleAttachments = await this.getTableColumns('sample_attachments')

    const needsSampleOrdersMigration =
      sampleOrders.length > 0 &&
      (!this.hasColumn(sampleOrders, 'operator_user_id') ||
        !this.hasColumn(sampleOrders, 'inspector_user_id') ||
        !this.hasColumn(sampleOrders, 'report_storage_path'))

    const needsSampleStepsMigration =
      sampleSteps.length > 0 &&
      (this.hasColumn(sampleSteps, 'assignee_user_id') ||
        !this.hasColumn(sampleSteps, 'operator_user_id') ||
        !this.hasColumn(sampleSteps, 'latest_inspector_user_id') ||
        !this.hasColumn(sampleSteps, 'latest_inspection_at'))

    const needsSampleAttachmentsMigration =
      sampleAttachments.length > 0 && !this.hasColumn(sampleAttachments, 'sample_step_id')

    if (
      !needsSampleOrdersMigration &&
      !needsSampleStepsMigration &&
      !needsSampleAttachmentsMigration
    ) {
      return
    }

    const sampleOrdersTargetTable = needsSampleOrdersMigration ? 'sample_orders_new' : 'sample_orders'
    const sampleStepsTargetTable = needsSampleStepsMigration ? 'sample_steps_new' : 'sample_steps'

    await this.$executeRawUnsafe('PRAGMA foreign_keys = OFF')

    try {
      await this.$transaction(async (tx) => {
        if (needsSampleOrdersMigration) {
          await tx.$executeRawUnsafe(`
            CREATE TABLE "sample_orders_new" (
              "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
              "sample_no" TEXT NOT NULL,
              "project_name" TEXT NOT NULL,
              "operator_user_id" INTEGER,
              "inspector_user_id" INTEGER,
              "customer_name" TEXT,
              "material" TEXT,
              "press_tonnage" TEXT,
              "start_date" DATETIME,
              "report_storage_path" TEXT NOT NULL,
              "remark" TEXT,
              "status" TEXT NOT NULL DEFAULT 'draft',
              "created_by" INTEGER NOT NULL,
              "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updated_at" DATETIME NOT NULL,
              CONSTRAINT "sample_orders_new_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
              CONSTRAINT "sample_orders_new_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
              CONSTRAINT "sample_orders_new_inspector_user_id_fkey" FOREIGN KEY ("inspector_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
            )
          `)

          const operatorExpr = this.hasColumn(sampleOrders, 'operator_user_id')
            ? '"operator_user_id"'
            : 'NULL'
          const inspectorExpr = this.hasColumn(sampleOrders, 'inspector_user_id')
            ? '"inspector_user_id"'
            : 'NULL'
          const reportPathExpr = this.hasColumn(sampleOrders, 'report_storage_path')
            ? `COALESCE(NULLIF("report_storage_path", ''), 'uploads/reports')`
            : `'uploads/reports'`

          await tx.$executeRawUnsafe(`
            INSERT INTO "sample_orders_new" (
              "id",
              "sample_no",
              "project_name",
              "operator_user_id",
              "inspector_user_id",
              "customer_name",
              "material",
              "press_tonnage",
              "start_date",
              "report_storage_path",
              "remark",
              "status",
              "created_by",
              "created_at",
              "updated_at"
            )
            SELECT
              "id",
              "sample_no",
              "project_name",
              ${operatorExpr},
              ${inspectorExpr},
              "customer_name",
              "material",
              "press_tonnage",
              "start_date",
              ${reportPathExpr},
              "remark",
              "status",
              "created_by",
              "created_at",
              "updated_at"
            FROM "sample_orders"
          `)
        }

        if (needsSampleStepsMigration) {
          await tx.$executeRawUnsafe(`
            CREATE TABLE "sample_steps_new" (
              "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
              "sample_order_id" INTEGER NOT NULL,
              "step_name" TEXT NOT NULL,
              "step_order" INTEGER NOT NULL,
              "operator_user_id" INTEGER,
              "status" TEXT NOT NULL DEFAULT 'pending',
              "started_at" DATETIME,
              "completed_at" DATETIME,
              "latest_inspector_user_id" INTEGER,
              "latest_inspection_at" DATETIME,
              "remark" TEXT,
              "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updated_at" DATETIME NOT NULL,
              CONSTRAINT "sample_steps_new_sample_order_id_fkey" FOREIGN KEY ("sample_order_id") REFERENCES "${sampleOrdersTargetTable}" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
              CONSTRAINT "sample_steps_new_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
              CONSTRAINT "sample_steps_new_latest_inspector_user_id_fkey" FOREIGN KEY ("latest_inspector_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
            )
          `)

          const operatorExpr = this.hasColumn(sampleSteps, 'operator_user_id')
            ? '"operator_user_id"'
            : this.hasColumn(sampleSteps, 'assignee_user_id')
              ? '"assignee_user_id"'
              : 'NULL'
          const latestInspectorExpr = this.hasColumn(sampleSteps, 'latest_inspector_user_id')
            ? '"latest_inspector_user_id"'
            : 'NULL'
          const latestInspectionAtExpr = this.hasColumn(sampleSteps, 'latest_inspection_at')
            ? '"latest_inspection_at"'
            : 'NULL'

          await tx.$executeRawUnsafe(`
            INSERT INTO "sample_steps_new" (
              "id",
              "sample_order_id",
              "step_name",
              "step_order",
              "operator_user_id",
              "status",
              "started_at",
              "completed_at",
              "latest_inspector_user_id",
              "latest_inspection_at",
              "remark",
              "created_at",
              "updated_at"
            )
            SELECT
              "id",
              "sample_order_id",
              "step_name",
              "step_order",
              ${operatorExpr},
              "status",
              "started_at",
              "completed_at",
              ${latestInspectorExpr},
              ${latestInspectionAtExpr},
              "remark",
              "created_at",
              "updated_at"
            FROM "sample_steps"
          `)
        }

        if (needsSampleAttachmentsMigration) {
          await tx.$executeRawUnsafe(`
            CREATE TABLE "sample_attachments_new" (
              "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
              "sample_order_id" INTEGER NOT NULL,
              "sample_step_id" INTEGER,
              "file_name" TEXT NOT NULL,
              "file_path" TEXT NOT NULL,
              "file_type" TEXT NOT NULL,
              "uploaded_by" INTEGER NOT NULL,
              "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT "sample_attachments_new_sample_order_id_fkey" FOREIGN KEY ("sample_order_id") REFERENCES "${sampleOrdersTargetTable}" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
              CONSTRAINT "sample_attachments_new_sample_step_id_fkey" FOREIGN KEY ("sample_step_id") REFERENCES "${sampleStepsTargetTable}" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
              CONSTRAINT "sample_attachments_new_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
            )
          `)

          const sampleStepExpr = this.hasColumn(sampleAttachments, 'sample_step_id')
            ? '"sample_step_id"'
            : 'NULL'

          await tx.$executeRawUnsafe(`
            INSERT INTO "sample_attachments_new" (
              "id",
              "sample_order_id",
              "sample_step_id",
              "file_name",
              "file_path",
              "file_type",
              "uploaded_by",
              "created_at"
            )
            SELECT
              "id",
              "sample_order_id",
              ${sampleStepExpr},
              "file_name",
              "file_path",
              "file_type",
              "uploaded_by",
              "created_at"
            FROM "sample_attachments"
          `)
        }

        if (needsSampleAttachmentsMigration) {
          await tx.$executeRawUnsafe(`DROP TABLE "sample_attachments"`)
          await tx.$executeRawUnsafe(`ALTER TABLE "sample_attachments_new" RENAME TO "sample_attachments"`)
        }

        if (needsSampleStepsMigration) {
          await tx.$executeRawUnsafe(`DROP TABLE "sample_steps"`)
          await tx.$executeRawUnsafe(`ALTER TABLE "sample_steps_new" RENAME TO "sample_steps"`)
        }

        if (needsSampleOrdersMigration) {
          await tx.$executeRawUnsafe(`DROP TABLE "sample_orders"`)
          await tx.$executeRawUnsafe(`ALTER TABLE "sample_orders_new" RENAME TO "sample_orders"`)
        }

        await tx.$executeRawUnsafe(
          `CREATE UNIQUE INDEX IF NOT EXISTS "sample_orders_sample_no_key" ON "sample_orders"("sample_no")`,
        )
        await tx.$executeRawUnsafe(
          `CREATE UNIQUE INDEX IF NOT EXISTS "sample_steps_sample_order_id_step_order_key" ON "sample_steps"("sample_order_id", "step_order")`,
        )
      })
    } finally {
      await this.$executeRawUnsafe('PRAGMA foreign_keys = ON')
    }
  }

  private async getTableColumns(tableName: string) {
    return this.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info("${tableName}")`)
  }

  private hasColumn(columns: Array<{ name: string }>, columnName: string) {
    return columns.some((column) => column.name === columnName)
  }
}
