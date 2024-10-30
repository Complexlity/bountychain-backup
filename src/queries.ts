import { eq, and } from "drizzle-orm";
import { z } from "zod";
import db from "./db";
import {
  insertBountiesSchema,
  bounties,
  submissions,
  insertSubmissionsSchema,
  completeBountySchema,
} from "./schema";
import { kvStore as redis } from "./redis";
import {
  BOUNTY_COMPLETE_SET_KEY,
  BOUNTY_KEY_PREFIX,
  BOUNTY_SET_KEY,
} from "./constants";

type CreateBountySchema = z.infer<typeof insertBountiesSchema>;
type CreateSubmissionSchema = z.infer<typeof insertSubmissionsSchema>;

type CompleteBountySchema = z.infer<typeof completeBountySchema>;

export async function createBounty(newBounty: CreateBountySchema) {
  insertBountiesSchema.parse(newBounty);
  const [insertted] = await db.insert(bounties).values(newBounty).returning();
  return insertted;
}

export async function completeBounty(bountyId: string, submissionId: number) {
  await db
    .update(bounties)
    .set({ status: "complete" })
    .where(eq(bounties.id, bountyId))
    .returning();
  //Where bountyId = submissions.bountyId and submissionId = submissions.id
  await db
    .update(submissions)
    .set({ isComplete: true })
    .where(
      and(eq(submissions.bountyId, bountyId), eq(submissions.id, submissionId))
    )
    .returning();
  return true;
}

// Type definition for Bounty
interface Bounty {
  id: string;
  creator: string;
  title: string;
  description: string;
  amount: number;
  status: string | undefined;
}

/**
 * Store a bounty in Redis using multi for atomic operations
 * @param bounty The bounty to store
 * @returns true if successful
 */
export async function createBountyBackup(
  bounty: CreateBountySchema
): Promise<boolean> {
  // Store the bounty object with its ID as part of the key
  const bountyKey = `${BOUNTY_KEY_PREFIX}${bounty.id}`;

  // Use multi to ensure atomic transaction
  const multi = redis.multi();

  // Store the complete bounty object
  multi.hset(bountyKey, bounty);

  // Add the bounty ID to a set for easy retrieval of all bounties
  multi.sadd(BOUNTY_SET_KEY, bounty.id);

  // Execute all commands atomically
  const [setResult, addResult] = await multi.exec();

  // Verify both operations succeeded
  return setResult !== null && addResult !== null;
}
/**
 * Store a bounty in Redis using multi for atomic operations
 * @param bounty The bounty to store
 * @returns true if successful
 */
export async function completeBountyBackup(
  data: CompleteBountySchema
): Promise<boolean> {
  // Store the bounty object with its ID as part of the key
  const bountyKey = `${BOUNTY_KEY_PREFIX}${data.bountyId}`;

  // Use multi to ensure atomic transaction
  const multi = redis.multi();

  // Store the complete bounty object
  multi.hset(bountyKey, data);

  // Add the bounty ID to a set for easy retrieval of all bounties
  multi.sadd(BOUNTY_COMPLETE_SET_KEY, data.bountyId);

  // Execute all commands atomically
  const [setResult, addResult] = await multi.exec();

  // Verify both operations succeeded
  return setResult !== null && addResult !== null;
}
