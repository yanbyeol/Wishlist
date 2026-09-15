"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ORDER_STATUS_OPTIONS } from "@/lib/constants";
import { updateSellerOrderStatus } from "@/lib/orders";
import { requireUser } from "@/lib/session";

export async function updateOrderStatusAction(formData) {
  const user = await requireUser("/seller/orders");
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "");
  const allowedStatuses = ORDER_STATUS_OPTIONS.map((option) => option.value);

  if (!allowedStatuses.includes(status)) {
    redirect("/seller/orders?notice=invalid-status");
  }

  const updated = await updateSellerOrderStatus(orderId, user.id, status);
  revalidatePath("/seller/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/mypage/gifts");
  redirect(`/seller/orders?notice=${updated ? "updated" : "blocked"}`);
}
