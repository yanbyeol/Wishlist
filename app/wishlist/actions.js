"use server";

import { revalidatePath } from "next/cache";
import { GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE } from "@/lib/constants";
import { requireUser } from "@/lib/session";
import { sanitizeCallbackPath } from "@/lib/utils/format";
import { toggleWishlistProduct } from "@/lib/wishlists";

export async function toggleWishlistAction(previousState, formData) {
  const productId = String(formData.get("productId") ?? "");
  const returnPath = sanitizeCallbackPath(formData.get("returnPath"), "/");
  const user = await requireUser(returnPath);

  if (!productId) {
    return { added: false };
  }

  const result = await toggleWishlistProduct(user, productId);

  if (result.removalBlocked) {
    return {
      ...result,
      message: GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE,
    };
  }

  revalidatePath(returnPath);
  revalidatePath("/wishlist");
  return { ...result, message: "" };
}
