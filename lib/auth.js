import { betterAuth } from "better-auth"
import { mongodbAdapter } from "better-auth/adapters/mongodb"
import clientPromise from "@/lib/mongodb"

const client = await clientPromise
const db = client.db(process.env.MONGODB_DB)

export const auth = betterAuth({
  database: mongodbAdapter(db, {
    client,
  }),

  emailAndPassword: {
    enabled: true,
  },
})