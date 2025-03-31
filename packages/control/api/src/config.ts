import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

export const config = z.object({
  DATABASE_URL: z.string(),
  BUCKET_URL: z.string(),
  BUCKET_ACCESS_KEY: z.string(),
  BUCKET_SECRET_KEY: z.string(),
  BUCKET_NAME: z.string(),
});

type Env = z.infer<typeof config>;
export const env = config.parse(process.env);
export const db_url = env.DATABASE_URL;
