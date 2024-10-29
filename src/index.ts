import { Hono } from "hono";
import db from "./db";
import env from "./env";
const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/bounties", async (c) => {
  console.log(env);
  const bounties = await db.query.bounties.findFirst();
  return c.json(bounties);
});

app.post("/bounties", async (c) => {
  const body = await c.req.json();
  console.log(process.env.HELLO);
});

export default {
  port: 3001,
  fetch: app.fetch,
};
