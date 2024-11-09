import { relations } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { Address } from "viem";
import { z } from "zod";
import { supportedChains } from "./viem";

const sqliteBoolean = integer({ mode: "boolean" });

export const bounties = sqliteTable("bounty", {
  id: text().primaryKey().notNull().unique(),
  creator: text().notNull(),
  title: text().notNull(),
  description: text().notNull(),
  token: text().notNull().default("eth"),
  amount: real().notNull(),
  chainId: integer().notNull().default(supportedChains.arbitrum.chain.id),
  status: text().default("ongoing").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull()
    .$onUpdate(() => new Date()),
});

export const submissions = sqliteTable(
  "submissions",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    bountyId: text()
      .references(() => bounties.id)
      .notNull(),
    creator: text().notNull(),
    isComplete: sqliteBoolean.default(false).notNull(),
    submissionDescription: text().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    //One submission per address
    uniqueSubmission: unique().on(table.bountyId, table.creator),
  })
);

export const bountyRelations = relations(bounties, ({ many }) => ({
  submissions: many(submissions),
}));

export const submissionRelations = relations(submissions, ({ one }) => ({
  bounty: one(bounties, {
    fields: [submissions.bountyId],
    references: [bounties.id],
  }),
}));

export const selectBountiesSchema = createSelectSchema(bounties);

export const insertBountiesSchema = createInsertSchema(bounties, {
  title: (schema) => schema.title.min(1).max(255),
  description: (schema) => schema.description.min(1).max(1000),
  amount: (schema) => schema.amount.min(0),
  status: (schema) => schema.status.default("ongoing"),
  creator: (schema) => schema.creator,
})
  .required({
    id: true,
    title: true,
    description: true,
    amount: true,
    creator: true,
  })
  .omit({
    createdAt: true,
    updatedAt: true,
  });

export const selectSubmissionsSchema = createSelectSchema(submissions);

export const insertSubmissionsSchema = createInsertSchema(submissions, {
  submissionDescription: (schema) =>
    schema.submissionDescription.min(1).max(1000),
  isComplete: (schema) => schema.isComplete.default(false),
})
  .required({
    bountyId: true,
    creator: true,
    submissionDescription: true,
  })
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  });

export const completeBountySchema = z.object({
  hash: z
    .string()
    .startsWith("0x")
    .transform((val): Address => val as Address),
  bountyId: z
    .string()
    .startsWith("0x")
    .transform((val): Address => val as Address),
  submissionId: z.coerce.number(),
  tokenType: z.string(),
});
