"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { sanitizeCallbackPath } from "@/lib/utils/format";
import { toggleWishlistProduct } from "@/lib/wishlists";

export async function toggleWishlistAction(formData) {
  const productId = String(formData.get("productId") ?? "");
  const returnPath = sanitizeCallbackPath(formData.get("returnPath"), "/");
  const user = await requireUser(returnPath);

  if (!productId) {
    return;
  }

  await toggleWishlistProduct(user, productId);
  revalidatePath(returnPath);
  revalidatePath("/wishlist");
}
