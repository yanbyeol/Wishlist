"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAddress,
  deleteAddressOwned,
  setDefaultAddressOwned,
} from "@/lib/addresses";
import { requireUser } from "@/lib/session";

function readAddressFields(formData) {
  const fields = {
    label: String(formData.get("label") ?? "").trim(),
    recipientName: String(formData.get("recipientName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    postalCode: String(formData.get("postalCode") ?? "").trim(),
    address1: String(formData.get("address1") ?? "").trim(),
    address2: String(formData.get("address2") ?? "").trim(),
    isDefault: formData.get("isDefault") === "on",
  };

  if (fields.label.length < 1 || fields.label.length > 20) {
    return { error: "배송지 이름은 1자 이상 20자 이하로 입력해 주세요." };
  }

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

export async function createAddressAction(previousState, formData) {
  const user = await requireUser("/mypage/addresses");
  const parsed = readAddressFields(formData);

  if (parsed.error) {
    return { message: parsed.error };
  }

  try {
    await createAddress(user.id, parsed.fields);
  } catch {
    return { message: "배송지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/mypage");
  revalidatePath("/mypage/addresses");
  redirect("/mypage/addresses?notice=created");
}

export async function deleteAddressAction(formData) {
  const user = await requireUser("/mypage/addresses");
  const addressId = String(formData.get("addressId") ?? "");
  const deleted = await deleteAddressOwned(addressId, user.id);

  revalidatePath("/mypage");
  revalidatePath("/mypage/addresses");
  redirect(`/mypage/addresses?notice=${deleted ? "deleted" : "not-found"}`);
}

export async function setDefaultAddressAction(formData) {
  const user = await requireUser("/mypage/addresses");
  const addressId = String(formData.get("addressId") ?? "");
  const updated = await setDefaultAddressOwned(addressId, user.id);

  revalidatePath("/mypage/addresses");
  redirect(`/mypage/addresses?notice=${updated ? "default" : "not-found"}`);
}
