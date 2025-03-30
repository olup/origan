import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

export const config = z.object({
  DATABASE_HOST: z.string(),
  DATABASE_PORT: z
    .string()
    .default("5432")
    .refine((p) => Number.parseInt(p) > 0 && Number.parseInt(p) <= 65535),
  DATABASE_USER: z.string(),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string(),
});

type Env = z.infer<typeof config>;
export const env = config.parse(process.env);

export const db_url = `postgres://${env.DATABASE_USER}:${env.DATABASE_PASSWORD}@${env.DATABASE_HOST}:${env.DATABASE_PORT}/${env.DATABASE_NAME}`;
