DROP INDEX "memories_user_idx";--> statement-breakpoint
DROP INDEX "users_name_key_idx";--> statement-breakpoint
CREATE INDEX "memories_user_recent_idx" ON "memories" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "turns_user_idx" ON "turns" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "name_key";