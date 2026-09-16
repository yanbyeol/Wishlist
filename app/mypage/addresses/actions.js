"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAddress,
  deleteAddressOwned,
  setDefaultAddressOwned,
  updateAddressOwned,
} from "@/lib/addresses";
import { requireUser } from "@/lib/session";
import { parseAddressFormData } from "@/lib/utils/validation";

export async function createAddressAction(previousState, formData) {
  const user = await requireUser("/mypage/addresses");
  const parsed = parseAddressFormData(formData, { includeLabel: true });

  if (parsed.error) {
    return { message: parsed.error, fields: parsed.fields };
  }

  try {
    await createAddress(user.id, parsed.fields);
  } catch {
    return {
      message: "배송지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      fields: parsed.fields,
    };
  }

  revalidatePath("/mypage");
  revalidatePath("/mypage/addresses");
  redirect("/mypage/addresses?notice=created");
}

export async function updateAddressAction(previousState, formData) {
  const user = await requireUser("/mypage/addresses");
  const addressId = String(formData.get("addressId") ?? "");
  const parsed = parseAddressFormData(formData, { includeLabel: true });

  if (parsed.error) {
    return { message: parsed.error, fields: parsed.fields };
  }

  let updated;

  try {
    updated = await updateAddressOwned(addressId, user.id, parsed.fields);
  } catch {
    return {
      message: "배송지를 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      fields: parsed.fields,
    };
  }

  if (!updated) {
    return { message: "수정할 배송지를 찾을 수 없습니다.", fields: parsed.fields };
  }

  revalidatePath("/mypage/addresses");
  redirect("/mypage/addresses?notice=updated");
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
