"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancelGroupGift,
  contributeToGroupGift,
  createGroupGift,
  extendGroupGift,
  findOpenGroupGiftForProduct,
  getGroupGiftById,
  retryGroupGiftPayment,
} from "@/lib/group-gifts";
import {
  requestGuestGroupGiftOtp,
  verifyGuestGroupGiftOtp,
} from "@/lib/group-gift-otp";
import { getProductById } from "@/lib/products";
import { getCurrentUser, requireUser } from "@/lib/session";
import { findUserByEmail, findUserById } from "@/lib/users";
import { sanitizeCallbackPath } from "@/lib/utils/format";
import {
  getGroupGiftPath,
  getSharedWishlistReturnPath,
} from "@/lib/utils/group-gift-navigation";
import { isValidEmail, parsePositiveInteger } from "@/lib/utils/validation";
import { isProductInWishlist } from "@/lib/wishlists";

export async function createGroupGiftAction(previousState, formData) {
  const productId = String(formData.get("productId") ?? "");
  const recipientId = String(formData.get("recipientId") ?? "");
  const from = sanitizeCallbackPath(formData.get("from"), "/");
  const returnTo = getSharedWishlistReturnPath(formData.get("returnTo"));
  const user = await requireUser(from);
  const title = String(formData.get("title") ?? "").trim();

  if (title.length < 2 || title.length > 60) {
    return { message: "함께 선물하기 제목은 2자 이상 60자 이하로 입력해 주세요." };
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
    redirect(getGroupGiftPath(existing.id, returnTo));
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
    return { message: "함께 선물하기를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath(from);
  redirect(getGroupGiftPath(groupGift.id, returnTo));
}

async function recipientMatchesEmail(groupGift, email) {
  const emailUser = await findUserByEmail(email);
  return emailUser?.id === groupGift.recipientId;
}

export async function requestGroupGiftOtpAction(groupGiftId, previousState, formData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!isValidEmail(email)) {
    return { message: "올바른 이메일을 입력해 주세요.", error: true, email };
  }

  const [user, groupGift] = await Promise.all([
    getCurrentUser(),
    getGroupGiftById(groupGiftId),
  ]);

  if (user) {
    return { message: "로그인 세션으로 바로 참여할 수 있습니다.", error: false };
  }

  if (!groupGift || groupGift.status !== "funding") {
    return { message: "현재 함께 선물하기에 참여할 수 없습니다.", error: true, email };
  }

  if (await recipientMatchesEmail(groupGift, email)) {
    return { message: "선물을 받는 사람은 참여할 수 없습니다.", error: true, email };
  }

  try {
    const result = await requestGuestGroupGiftOtp(groupGiftId, email);
    const message = result.demoCode
      ? `개발용 인증번호는 ${result.demoCode}입니다.`
      : `${result.email}로 인증번호를 보냈습니다.`;

    return {
      requested: true,
      email: result.email,
      message,
      error: false,
    };
  } catch (error) {
    return {
      message: String(error?.message ?? "인증번호를 보내지 못했습니다."),
      error: true,
      email,
    };
  }
}

export async function verifyGroupGiftOtpAction(groupGiftId, previousState, formData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const returnTo = getSharedWishlistReturnPath(formData.get("returnTo"));
  const groupGift = await getGroupGiftById(groupGiftId);

  if (!groupGift || groupGift.status !== "funding") {
    return { message: "현재 함께 선물하기에 참여할 수 없습니다.", error: true, email };
  }

  if (await recipientMatchesEmail(groupGift, email)) {
    return { message: "선물을 받는 사람은 참여할 수 없습니다.", error: true, email };
  }

  try {
    await verifyGuestGroupGiftOtp(groupGiftId, email, code);
  } catch (error) {
    return {
      message: String(error?.message ?? "이메일 인증을 완료하지 못했습니다."),
      error: true,
      email,
    };
  }

  revalidatePath(`/group-gifts/${groupGiftId}`);
  redirect(getGroupGiftPath(groupGiftId, returnTo));
}

export async function contributeGroupGiftAction(groupGiftId, previousState, formData) {
  const user = await getCurrentUser();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const amount = parsePositiveInteger(formData.get("amount"));

  if (!user) {
    return { message: "로그인 또는 이메일 인증을 완료해 주세요." };
  }

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
    return { message: "함께 선물하기 정보를 찾을 수 없습니다." };
  }

  if (groupGift.recipientId === user.id) {
    return { message: "선물을 받는 사람은 함께 선물하기에 참여할 수 없습니다." };
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

  return { message: "", success: true };
}

export async function retryGroupGiftPaymentAction(groupGiftId, previousState, formData) {
  const user = await getCurrentUser();

  if (!user) {
    return { message: "로그인 또는 이메일 인증을 완료해 주세요." };
  }

  let order;

  try {
    order = await retryGroupGiftPayment(groupGiftId, {
      userId: user.id,
    });
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

export async function extendGroupGiftAction(groupGiftId, previousState, formData) {
  const user = await requireUser(`/group-gifts/${groupGiftId}`);
  const endDate = String(formData.get("endDate") ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { message: "새 종료일을 선택해 주세요.", error: true };
  }

  const nextExpiresAt = new Date(`${endDate}T23:59:59.999+09:00`);

  try {
    await extendGroupGift(groupGiftId, user.id, nextExpiresAt);
  } catch (error) {
    return {
      message: String(error?.message ?? "모집 기간을 연장하지 못했습니다."),
      error: true,
    };
  }

  revalidatePath(`/group-gifts/${groupGiftId}`);
  revalidatePath("/");
  revalidatePath("/wishlist");
  return { message: "모집 기간을 연장했습니다.", error: false, success: true };
}

export async function cancelGroupGiftAction(groupGiftId) {
  const user = await requireUser(`/group-gifts/${groupGiftId}`);

  try {
    await cancelGroupGift(groupGiftId, user.id);
  } catch (error) {
    return {
      message: String(error?.message ?? "함께 선물하기를 종료하지 못했습니다."),
      error: true,
    };
  }

  revalidatePath(`/group-gifts/${groupGiftId}`);
  revalidatePath("/");
  revalidatePath("/wishlist");
  return { message: "함께 선물하기 모집을 종료했습니다.", error: false, success: true };
}
