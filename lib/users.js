import { getDatabase } from "@/lib/mongodb";
import { documentIdFilter, normalizeId } from "@/lib/utils/mongo";

let userEmailIndexSetupPromise;

export function normalizeUserEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export async function ensureUniqueUserEmailIndex() {
  const db = await getDatabase();

  if (!userEmailIndexSetupPromise) {
    userEmailIndexSetupPromise = db.collection("user").createIndex(
      { email: 1 },
      {
        name: "user_email_unique",
        unique: true,
        partialFilterExpression: { email: { $type: "string" } },
      },
    ).catch((error) => {
      userEmailIndexSetupPromise = null;
      throw error;
    });
  }

  await userEmailIndexSetupPromise;
}

function presentUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: normalizeId(user._id),
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  };
}

export async function findUserById(userId) {
  const db = await getDatabase();
  const user = await db.collection("user").findOne(documentIdFilter(userId));
  return presentUser(user);
}

export async function findUserByEmail(email) {
  const db = await getDatabase();
  const user = await db.collection("user").findOne({
    email: normalizeUserEmail(email),
  });
  return presentUser(user);
}
