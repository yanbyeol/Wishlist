import { getDatabase } from "@/lib/mongodb";
import { documentIdFilter, normalizeId } from "@/lib/utils/mongo";

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
    email: String(email).trim().toLowerCase(),
  });
  return presentUser(user);
}
