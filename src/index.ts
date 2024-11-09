import { Hono } from "hono";
import { StatusCode } from "hono/utils/http-status";
import * as HttpStatusCodes from "stoker/http-status-codes";
import { notFound, onError } from "stoker/middlewares";
import { Address, decodeEventLog } from "viem";
import { bountyAbiNative } from "./constants";
import db from "./db";
import { pinoLogger } from "./pino-logger";
import {
  completeBounty,
  completeBountyBackup,
  createBounty,
  createBountyBackup,
  processBackupBounties,
} from "./queries";
import { completeBountySchema, insertBountiesSchema } from "./schema";
import { isZeroAddress } from "./utils";
import { getPublicClient, SupportedChainKey, supportedChains } from "./viem";
import env from "./env";
import { CronJob } from "cron";
const app = new Hono();

const job = new CronJob(
  // Run every hour at minute 0
  "0 * * * *",
  processBackupBounties,
  null,
  true,
  "utc"
);

const activeChain = env.ACTIVE_CHAIN;
app.use(pinoLogger());
app.notFound(notFound);
app.onError(onError);

app.get("/", async (c) => {
  return c.json({ message: "Active and Strong" });
});

app.get("/bounties", async (c) => {
  const bounties = await db.query.bounties.findMany();
  return c.json(bounties);
});
app.get("/bounty/:bountyId/submissions", async (c) => {
  const bountyId = c.req.param("bountyId");
  const submissions = await db.query.submissions.findMany({
    where(fields, operators) {
      return operators.eq(fields.bountyId, bountyId);
    },
  });
  return c.json(submissions);
});

app.post("/bounties/complete", async (c) => {
  //Try to insert to db directly if main server main have gone down for some reason
  const formData = await c.req.json();
  const res = await completeHandler(formData);

  if (res) {
    return c.json({ message: res.message }, res.status);
  }
  const backup = await completeBountyBackup(formData).catch((e) => {
    return false;
  });

  if (!backup)
    return c.json({ message: "Could not backup completion data" }, 500);

  return c.json({ message: "Successfully backed up completion data" });
});

app.post("/bounties", async (c) => {
  const body = await c.req.json();
  console.log({ body });
  const res = await createHandler(body);

  if (res) {
    return c.json({ message: res.message }, res.status);
  }

  const bountyBackup = await createBountyBackup(body).catch((e) => {
    return false;
  });

  if (!bountyBackup)
    return c.json({ message: "Could not backup bounty data" }, 500);

  return c.json({ message: "Successfully backedup bounty data" });
});

async function createHandler(
  body: any
): Promise<{ message: string; status: StatusCode } | null> {
  const { error, data: parsedBody } = insertBountiesSchema.safeParse(body);
  if (error) {
    return {
      message: "Invalid formData",
      status: HttpStatusCodes.UNPROCESSABLE_ENTITY,
    };
  }

  const publicClient = getPublicClient(activeChain);
  const type =
    (parsedBody.token as keyof (typeof supportedChains)[typeof activeChain]["contracts"]) ??
    "eth";
  const { address: contractAddress, abi: bountyAbi } =
    supportedChains[activeChain].contracts[type];
  const bountyDetails = await publicClient.readContract({
    address: contractAddress,
    abi: bountyAbi,
    functionName: "getBountyInfo",
    args: [parsedBody.id as Address],
  });
  if (
    !bountyDetails ||
    isZeroAddress(bountyDetails[0])
  ) {
    return { message: "Bounty not found", status: HttpStatusCodes.NOT_FOUND };
  }
  //try to send to db if error is in main server
  try {
    const newBounty = await createBounty(parsedBody);

    if (newBounty) return { message: "Bounty added successfully", status: 200 };
    return null;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      return {
        message: `Bounty with id "${parsedBody.id}" already exists`,
        status: HttpStatusCodes.CONFLICT,
      };
    }
    return null;
  }
}

async function completeHandler(
  formData: any
): Promise<{ message: string; status: StatusCode } | null> {
  const { error, data } = completeBountySchema.safeParse(formData);
  if (error)
    return {
      message: "Invalid formData",
      status: HttpStatusCodes.UNPROCESSABLE_ENTITY,
    };
  const { hash, bountyId, submissionId, tokenType } = data;
  const txReceipt = await getPublicClient(activeChain).getTransactionReceipt({
    hash,
  });
  const logs = txReceipt.logs;
  const type =
    (tokenType as keyof (typeof supportedChains)[SupportedChainKey]["contracts"]) ??
    "eth";
  const { abi: bountyAbi } = supportedChains[activeChain].contracts[type];
  let decoded;
  for (const log of logs) {
    try {
      decoded = decodeEventLog({
        abi: bountyAbi,
        data: log.data,
        eventName: "BountyPaid",
        topics: log.topics,
      });
    } catch (error) {
      console.log(error);
      console.log("I errrored");
    }
  }
  if (
    decoded &&
    "bountyId" in decoded.args &&
    !isZeroAddress(decoded.args.bountyId)
  ) {
    const result = await completeBounty(bountyId, submissionId).catch((e) => {
      console.log("I errored");
      return null;
    });
    if (result) return { message: "Bounty added successfully", status: 200 };
    return null;
  }
  return { message: "Bounty payment details not found", status: 400 };
}

export default {
  port: 3001,
  fetch: app.fetch,
};
