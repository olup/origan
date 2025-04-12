import { sql } from "drizzle-orm";
import { timestamp } from "drizzle-orm/pg-core/columns";

// columns.helpers.ts
export const timestamps = {
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .$onUpdate(() => sql`(now() AT TIME ZONE 'utc'::text)`)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
