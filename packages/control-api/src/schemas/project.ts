import { z } from "zod";

export const projectCreateSchema = z.object({
  name: z.string(),
  organizationReference: z.string(),
});

export const projectUpdateSchema = z.object({
  name: z.string(),
});

export interface ProjectError {
  error: string;
  details: string;
}
