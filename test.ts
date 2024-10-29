import z from "zod";

const schema = z
  .object({
    username: z.string(),
    password: z.string(),
  })
  .strict();

const data = {
  username: "John",
  password: "123456",
  email: "john@example.com",
};

const result = schema.parse(data);
console.log({ result });
