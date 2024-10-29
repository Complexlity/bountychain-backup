import { z } from "zod";
import { isAddress } from "viem"; // Assuming you're using viem for address validation

const Dialect = z.enum(["sqlite", "turso"]);
type Dialect = Prettify<z.infer<typeof Dialect>>;

const EnvSchema = z
  .object({
    NODE_ENV: z.string().default("development"),
    REDIS_URL: z.string().url(),
    REDIS_TOKEN: z.string().min(1),
    DATABASE_URL: z.string().url(),
    DATABASE_AUTH_TOKEN: z.string().optional(),
    DIALECT: Dialect.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.NODE_ENV === "production" && !input.DATABASE_AUTH_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.invalid_type,
        expected: "string",
        received: "undefined",
        path: ["DATABASE_AUTH_TOKEN"],
        message: "Must be set when NODE_ENV is 'production'",
      });
    }
  })
  .transform((env) => ({
    ...env,
    DIALECT: env.NODE_ENV === "production" ? "turso" : "sqlite",
  }))
  .refine((env): env is Prettify<typeof env & { DIALECT: Dialect }> => true);
export type env = z.infer<typeof EnvSchema>;

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

const { data: env, error } = EnvSchema.safeParse(process.env);

if (error) {
  console.error("❌ Invalid env:");
  console.error(JSON.stringify(error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export default env!;
