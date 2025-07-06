ALTER TABLE "deployment" DROP CONSTRAINT "deployment_track_id_track_id_fk";
--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_track_id_track_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."track"("id") ON DELETE set null ON UPDATE no action;