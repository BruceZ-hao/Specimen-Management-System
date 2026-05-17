-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "sample_orders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sample_no" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "customer_name" TEXT,
    "material" TEXT,
    "press_tonnage" TEXT,
    "start_date" DATETIME,
    "remark" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "sample_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sample_attachments" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sample_order_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sample_attachments_sample_order_id_fkey" FOREIGN KEY ("sample_order_id") REFERENCES "sample_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sample_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sample_steps" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sample_order_id" INTEGER NOT NULL,
    "step_name" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "assignee_user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "remark" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "sample_steps_sample_order_id_fkey" FOREIGN KEY ("sample_order_id") REFERENCES "sample_orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sample_steps_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "step_operation_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sample_step_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "operator_user_id" INTEGER NOT NULL,
    "action_time" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "step_operation_logs_sample_step_id_fkey" FOREIGN KEY ("sample_step_id") REFERENCES "sample_steps" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "step_operation_logs_operator_user_id_fkey" FOREIGN KEY ("operator_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sample_orders_sample_no_key" ON "sample_orders"("sample_no");

-- CreateIndex
CREATE UNIQUE INDEX "sample_steps_sample_order_id_step_order_key" ON "sample_steps"("sample_order_id", "step_order");
