"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptGiftWithAddress, getGiftByAcceptanceToken } from "@/lib/orders";
import { requireUser } from "@/lib/session";

function readShippingAddress(formData) {
  const fields = {
    recipientName: String(formData.get("recipientName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    postalCode: String(formData.get("postalCode") ?? "").trim(),
    address1: String(formData.get("address1") ?? "").trim(),
    address2: String(formData.get("address2") ?? "").trim(),
  };

  if (fields.recipientName.length < 2 || fields.recipientName.length > 30) {
    return { error: "받는 분 이름은 2자 이상 30자 이하로 입력해 주세요." };
  }

  if (!/^[0-9+() -]{8,20}$/.test(fields.phone)) {
    return { error: "연락처를 숫자와 하이픈을 사용해 입력해 주세요." };
  }

  if (!/^[0-9A-Za-z -]{3,10}$/.test(fields.postalCode)) {
    return { error: "우편번호를 확인해 주세요." };
  }

  if (fields.address1.length < 4 || fields.address1.length > 100) {
    return { error: "기본 주소는 4자 이상 100자 이하로 입력해 주세요." };
  }

  if (fields.address2.length > 100) {
    return { error: "상세 주소는 100자 이하로 입력해 주세요." };
  }

  return { fields };
}

export async function acceptGiftAction(token, previousState, formData) {
  const callback = `/gifts/accept/${token}`;
  const user = await requireUser(callback);
  const gift = await getGiftByAcceptanceToken(token);

  if (!gift || gift.order.recipientId !== user.id) {
    return { message: "이 선물을 수락할 권한이 없습니다." };
  }

  if (gift.card.acceptedAt) {
    return { message: "이미 배송지를 입력한 선물입니다." };
  }

  const parsed = readShippingAddress(formData);

  if (parsed.error) {
    return { message: parsed.error };
  }

  let order;

  try {
    order = await acceptGiftWithAddress(token, user.id, parsed.fields);
  } catch {
    return { message: "배송지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  if (!order) {
    return { message: "이미 처리되었거나 만료된 선물 링크입니다." };
  }

  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/mypage/gifts");
  revalidatePath("/seller/orders");
  redirect(`/orders/${order.id}`);
}
