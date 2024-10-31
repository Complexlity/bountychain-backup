import { and, eq } from "drizzle-orm";
import {
  BOUNTY_COMPLETE_SET_KEY,
  BOUNTY_KEY_PREFIX,
  BOUNTY_SET_KEY,
} from "./constants";
import db from "./db";
import { kvStore, kvStore as redis } from "./redis";
import { bounties, insertBountiesSchema, submissions } from "./schema";
import { CompleteBountySchema, CreateBountySchema } from "./types";

export async function createBounty(newBounty: CreateBountySchema) {
  insertBountiesSchema.parse(newBounty);
  const [insertted] = await db.insert(bounties).values(newBounty).returning();
  return insertted;
}

export async function completeBounty(bountyId: string, submissionId: number) {
  await db
    .update(bounties)
    .set({ status: "complete" })
    .where(eq(bounties.id, bountyId));
  await db
    .update(submissions)
    .set({ isComplete: true })
    .where(
      and(eq(submissions.bountyId, bountyId), eq(submissions.id, submissionId))
    );
  return true;
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

export async function processBackupBounties() {
  try {
    await processCreateBounties();
  } catch (error) {
    console.error("Error processing create bounties:", error);
  }

  try {
    await processCompleteBounties();
  } catch (error) {
    console.error("Error processing complete bounties:", error);
  }
}

async function processCreateBounties() {
  console.log("Running for create...");
  // Get all bounty IDs from the set
  const bountyIds = await kvStore.smembers(BOUNTY_SET_KEY);
  console.log("Found length", bountyIds.length);
  return;

  // Process each bounty for creation
  for (const bountyId of bountyIds) {
    const bountyKey = `${BOUNTY_KEY_PREFIX}${bountyId}`;
    const bounty = (await kvStore.hgetall(bountyKey)) as CreateBountySchema;

    if (bounty) {
      try {
        // Try to create the bounty in the main database
        const newBounty = await createBounty(bounty);

        if (newBounty) {
          // Bounty was successfully created, remove it from the backup set
          await kvStore.srem(BOUNTY_SET_KEY, bountyId);
          await kvStore.hdel(bountyKey);
          console.log(`Successfully created bounty ${bountyId} from backup`);
        } else {
          console.error(`Failed to create bounty ${bountyId} from backup`);
        }
      } catch (error) {
        console.error(`Error creating bounty ${bountyId} from backup:`, error);
      }
    } else {
      console.error(`Bounty ${bountyId} not found in backup`);
    }
  }
}

async function processCompleteBounties() {
  console.log("Running for complete...");
  // Get completed bounty IDs from the set
  const completedBountyIds = await kvStore.smembers(BOUNTY_COMPLETE_SET_KEY);
  console.log("Found length", completedBountyIds.length);
  return;
  // Process each completed bounty
  for (const bountyId of completedBountyIds) {
    const bountyKey = `${BOUNTY_KEY_PREFIX}${bountyId}`;
    const bountyCompletionData = (await kvStore.hgetall(
      bountyKey
    )) as CompleteBountySchema;

    if (bountyCompletionData) {
      try {
        // Try to complete the bounty in the main database
        const result = await completeBounty(
          bountyCompletionData.bountyId,
          bountyCompletionData.submissionId
        );

        if (result) {
          // Bounty was successfully completed, remove it from the backup set
          await kvStore.srem(BOUNTY_COMPLETE_SET_KEY, bountyId);
          await kvStore.hdel(bountyKey);
          console.log(`Successfully completed bounty ${bountyId} from backup`);
        } else {
          console.error(`Failed to complete bounty ${bountyId} from backup`);
        }
      } catch (error) {
        console.error(
          `Error completing bounty ${bountyId} from backup:`,
          error
        );
      }
    } else {
      console.error(
        `Bounty completion data not found in backup for ${bountyId}`
      );
    }
  }
}
