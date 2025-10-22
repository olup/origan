ALTER TABLE "auth_sessions" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP COLUMN "access_token";--> statement-breakpoint
ALTER TABLE "auth_sessions" DROP COLUMN "refresh_token";