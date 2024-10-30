import { Hono } from "hono";
import { StatusCode } from "hono/utils/http-status";
import { Address, decodeEventLog } from "viem";
import { BOUNTY_CONTRACT_ADDRESS, bountyAbi } from "./constants";
import {
  completeBounty,
  completeBountyBackup,
  createBounty,
  createBountyBackup,
} from "./queries";
import { completeBountySchema, insertBountiesSchema } from "./schema";
import { isZeroAddress } from "./utils";
import { getPublicClient, supportedChainIds } from "./viem";
import { onError, notFound } from "stoker/middlewares";
import { pinoLogger } from "./pino-logger";
const app = new Hono();

app.use(pinoLogger());
app.notFound(notFound);
app.onError(onError);

//arbitrum sepolia
const activeChain: supportedChainIds[number] = 421614;

app.get("/", async (c) => {
  return c.json({ message: "Active and Strong" });
});

app.post("/bounties/complete", async (c) => {
  //Try to insert to db directly if main server main have gone down for some reason
  const formData = await c.req.json();
  const res = await completeHandler(formData);

  if (res) c.json({ message: res.message }, res.status);

  const backup = await completeBountyBackup(formData).catch((e) => {
    return false;
  });

  if (!backup)
    return c.json({ message: "Could not backup completion data" }, 500);

  return c.json({ message: "Successfully backed up completion data" });
});

app.post("/bounties", async (c) => {
  const body = await c.req.json();
  const res = await createHandler(body);
  if (res) c.json({ message: res.message }, res.status);

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
    return { message: "Invalid formData", status: 429 };
  }

  const bountyDetails = await getPublicClient(activeChain).readContract({
    address: BOUNTY_CONTRACT_ADDRESS,
    abi: bountyAbi,
    functionName: "getBountyInfo",
    args: [body.id as Address],
  });
  if (
    !bountyDetails ||
    isZeroAddress(bountyDetails[0] || bountyDetails[3] < 0)
  ) {
    return { message: "Bounty not found", status: 404 };
  }
  //try to send to db if error is in main server
  const newBounty = await createBounty(parsedBody).catch((e) => {
    return null;
  });
  if (newBounty) return { message: "Bounty added successfully", status: 200 };
  return null;
}

async function completeHandler(
  formData: any
): Promise<{ message: string; status: StatusCode } | null> {
  const { error, data } = completeBountySchema.safeParse(formData);
  if (error) return { message: "Invalid formData", status: 429 };
  const { hash, bountyId, submissionId } = data;
  const txReceipt = await getPublicClient(activeChain).getTransactionReceipt({
    hash,
  });
  const logs = txReceipt.logs;
  const decoded = decodeEventLog({
    abi: bountyAbi,
    data: logs[0].data,
    topics: logs[0].topics,
  });
  if (
    decoded.eventName === "BountyPaid" &&
    "args" in decoded &&
    decoded.args &&
    "bountyId" in decoded.args &&
    !isZeroAddress(decoded.args.bountyId)
  ) {
    const result = await completeBounty(bountyId, submissionId).catch(
      (e) => null
    );
    if (result) return { message: "Bounty added successfully", status: 200 };
    return null;
  }
  return { message: "Bounty payment details not found", status: 400 };
}

export default {
  port: 3001,
  fetch: app.fetch,
};
