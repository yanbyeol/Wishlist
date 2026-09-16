"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptGiftWithAddress, getGiftByAcceptanceToken } from "@/lib/orders";
import { requireUser } from "@/lib/session";
import { parseAddressFormData } from "@/lib/utils/validation";

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

  const parsed = parseAddressFormData(formData);

  if (parsed.error) {
    return { message: parsed.error, fields: parsed.fields };
  }

  let order;

  try {
    order = await acceptGiftWithAddress(token, user.id, parsed.fields);
  } catch {
    return {
      message: "배송지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      fields: parsed.fields,
    };
  }

  if (!order) {
    return { message: "이미 처리되었거나 만료된 선물 링크입니다." };
  }

  revalidatePath(`/orders/${order.id}`);
  revalidatePath("/mypage/gifts");
  revalidatePath("/seller/orders");
  redirect(`/orders/${order.id}`);
}
