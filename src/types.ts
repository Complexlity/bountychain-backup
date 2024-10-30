import { z } from "zod";
import { insertBountiesSchema, completeBountySchema } from "./schema";

export type CreateBountySchema = z.infer<typeof insertBountiesSchema>;
export type CompleteBountySchema = z.infer<typeof completeBountySchema>;
