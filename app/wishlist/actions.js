"use server";

import { revalidatePath } from "next/cache";
import { GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE } from "@/lib/constants";
import { requireMember } from "@/lib/session";
import { sanitizeCallbackPath } from "@/lib/utils/format";
import { setWishlistProduct } from "@/lib/wishlists";

export async function toggleWishlistAction(previousState, formData) {
  const productId = String(formData.get("productId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const returnPath = sanitizeCallbackPath(formData.get("returnPath"), "/");
  const user = await requireMember(returnPath);

  if (!productId || !["add", "remove"].includes(intent)) {
    return { added: false, message: "위시리스트 요청을 확인해 주세요." };
  }

  const result = await setWishlistProduct(user, productId, intent === "add");

  if (result.removalBlocked) {
    return {
      ...result,
      message: GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE,
    };
  }

  revalidatePath(returnPath);
  revalidatePath("/wishlist");
  return {
    ...result,
    message: result.alreadyExists ? "이미 위시리스트에 있는 상품입니다." : "",
  };
}
