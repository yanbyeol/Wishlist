import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { getMongoClient } from "@/lib/mongodb";

const client = getMongoClient();
const db = client.db(process.env.MONGODB_DB);
const useMongoTransactions = process.env.MONGODB_TRANSACTIONS === "true";

export const auth = betterAuth({
  database: mongodbAdapter(db, {
    client,
    // 단독 MongoDB는 트랜잭션을 지원하지 않는다. replica set 또는 mongos에서만 활성화한다.
    transaction: useMongoTransactions,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  plugins: [nextCookies()],
});
