"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { findStartedGroupGiftForProduct } from "@/lib/group-gifts";
import { createMockOrder } from "@/lib/orders";
import { getProductById } from "@/lib/products";
import { requireUser } from "@/lib/session";
import { findUserByEmail, findUserById } from "@/lib/users";
import { sanitizeCallbackPath } from "@/lib/utils/format";

export async function createOrderAction(previousState, formData) {
  const productId = String(formData.get("productId") ?? "");
  const mode = formData.get("mode") === "self" ? "self" : "single";
  const from = sanitizeCallbackPath(formData.get("from"), `/products/${productId}`);
  const user = await requireUser(from);
  const message = String(formData.get("message") ?? "").trim();

  if (message.length < 2 || message.length > 500) {
    return { message: "축하 메시지는 2자 이상 500자 이하로 입력해 주세요." };
  }

  const product = await getProductById(productId);

  if (!product || product.status === "archived" || product.quantity < 1) {
    return { message: "상품이 품절되었거나 더 이상 판매하지 않습니다." };
  }

  let recipient = user;

  if (mode !== "self") {
    const recipientId = String(formData.get("recipientId") ?? "");
    const recipientEmail = String(formData.get("recipientEmail") ?? "").trim().toLowerCase();
    recipient = recipientId
      ? await findUserById(recipientId)
      : await findUserByEmail(recipientEmail);

    if (!recipient) {
      return { message: "선물을 받을 회원을 찾을 수 없습니다. 가입한 이메일을 확인해 주세요." };
    }
  }

  const startedGroupGift = await findStartedGroupGiftForProduct(
    recipient.id,
    product.id,
  );

  if (startedGroupGift) {
    return {
      message: "공동선물이 진행 중인 상품은 혼자 선물할 수 없습니다. 공동선물 페이지에서 참여해 주세요.",
    };
  }

  let order;

  try {
    order = await createMockOrder({
      type: recipient.id === user.id ? "self" : "single",
      senderId: user.id,
      recipientId: recipient.id,
      productId: product.id,
      message,
    });
  } catch (error) {
    const knownMessage = String(error?.message ?? "");
    return {
      message: knownMessage.includes("품절") || knownMessage.includes("회원")
        ? knownMessage
        : "목업 결제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  revalidatePath("/", "layout");
  revalidatePath("/wishlist");
  revalidatePath("/mypage");
  revalidatePath("/mypage/gifts");
  revalidatePath("/seller/orders");
  redirect(`/orders/${order.id}`);
}
