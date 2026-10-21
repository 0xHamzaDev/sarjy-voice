DROP INDEX "users_name_key_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "memory_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "users_name_key_idx" ON "users" USING btree ("name_key");