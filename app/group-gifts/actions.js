"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  contributeToGroupGift,
  createGroupGift,
  findOpenGroupGiftForProduct,
  getGroupGiftById,
  retryGroupGiftPayment,
} from "@/lib/group-gifts";
import { getProductById } from "@/lib/products";
import { requireUser } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { sanitizeCallbackPath } from "@/lib/utils/format";
import { parsePositiveInteger } from "@/lib/utils/validation";
import { isProductInWishlist } from "@/lib/wishlists";

export async function createGroupGiftAction(previousState, formData) {
  const productId = String(formData.get("productId") ?? "");
  const recipientId = String(formData.get("recipientId") ?? "");
  const from = sanitizeCallbackPath(formData.get("from"), "/");
  const user = await requireUser(from);
  const title = String(formData.get("title") ?? "").trim();

  if (title.length < 2 || title.length > 60) {
    return { message: "같이 선물 제목은 2자 이상 60자 이하로 입력해 주세요." };
  }

  const [product, recipient, isWishlisted] = await Promise.all([
    getProductById(productId),
    findUserById(recipientId),
    isProductInWishlist(recipientId, productId),
  ]);

  if (!product || product.status === "archived" || product.quantity < 1) {
    return { message: "상품이 품절되었거나 더 이상 판매하지 않습니다." };
  }

  if (!recipient || !isWishlisted) {
    return { message: "공유 위시리스트에서 상품을 다시 확인해 주세요." };
  }

  if (recipient.id === user.id) {
    return { message: "내 위시리스트 상품은 나에게 선물하기를 이용해 주세요." };
  }

  const existing = await findOpenGroupGiftForProduct(recipient.id, product.id);

  if (existing) {
    redirect(`/group-gifts/${existing.id}`);
  }

  let groupGift;

  try {
    groupGift = await createGroupGift({
      organizerId: user.id,
      recipientId: recipient.id,
      product,
      title,
    });
  } catch {
    return { message: "같이 선물하기를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(from);
  redirect(`/group-gifts/${groupGift.id}`);
}

export async function contributeGroupGiftAction(groupGiftId, previousState, formData) {
  const user = await requireUser(`/group-gifts/${groupGiftId}`);
  const nickname = String(formData.get("nickname") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const amount = parsePositiveInteger(formData.get("amount"));

  if (nickname.length < 2 || nickname.length > 20) {
    return { message: "닉네임은 2자 이상 20자 이하로 입력해 주세요." };
  }

  if (!amount) {
    return { message: "참여 금액은 1원 이상의 정수로 입력해 주세요." };
  }

  if (message.length > 300) {
    return { message: "축하 메시지는 300자 이하로 입력해 주세요." };
  }

  const groupGift = await getGroupGiftById(groupGiftId);

  if (!groupGift) {
    return { message: "같이 선물 정보를 찾을 수 없습니다." };
  }

  if (groupGift.recipientId === user.id) {
    return { message: "선물을 받는 사람은 같이 선물 금액에 참여할 수 없습니다." };
  }

  let result;

  try {
    result = await contributeToGroupGift({
      groupGiftId,
      userId: user.id,
      nickname,
      amount,
      message,
    });
  } catch (error) {
    return { message: String(error?.message ?? "참여를 완료하지 못했습니다.") };
  }

  revalidatePath(`/group-gifts/${groupGiftId}`);
  revalidatePath("/");
  revalidatePath("/wishlist");

  if (result.order) {
    revalidatePath("/mypage/gifts");
    revalidatePath("/seller/orders");
    redirect(`/orders/${result.order.id}`);
  }

  redirect(`/group-gifts/${groupGiftId}`);
}

export async function retryGroupGiftPaymentAction(groupGiftId, previousState) {
  const user = await requireUser(`/group-gifts/${groupGiftId}`);
  let order;

  try {
    order = await retryGroupGiftPayment(groupGiftId, user.id);
  } catch (error) {
    return { message: String(error?.message ?? "목업 결제를 다시 처리하지 못했습니다.") };
  }

  if (!order) {
    return { message: "현재 다시 처리할 수 없는 상태입니다." };
  }

  revalidatePath(`/group-gifts/${groupGiftId}`);
  revalidatePath("/mypage/gifts");
  revalidatePath("/seller/orders");
  redirect(`/orders/${order.id}`);
}
