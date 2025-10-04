CREATE TYPE "public"."certificate_status" AS ENUM('none', 'pending', 'valid', 'error');--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "is_custom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "certificate_status" "certificate_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "certificate_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "certificate_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domain" ADD COLUMN "last_certificate_error" text;