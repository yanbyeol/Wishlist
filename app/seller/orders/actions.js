"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ORDER_STATUS_OPTIONS } from "@/lib/constants";
import { listSellerOrders, updateSellerOrderStatus } from "@/lib/orders";
import { getSellerOrderStatuses, getSellerOrdersReturnPath } from "@/lib/seller-order-filter";
import { requireMember } from "@/lib/session";

export async function querySellerOrdersAction(statuses) {
  // 인증 리다이렉트는 조회 오류로 처리하지 않습니다.
  const user = await requireMember("/seller/orders");
  const selectedStatuses = getSellerOrderStatuses(statuses);

  try {
    const orders = await listSellerOrders(user.id, selectedStatuses);
    return { orders, error: "" };
  } catch {
    return { error: "주문을 조회하지 못했습니다. 다시 조회해 주세요." };
  }
}

export async function updateOrderStatusAction(formData) {
  const user = await requireMember("/seller/orders");
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "");
  const filterStatuses = formData.getAll("filterStatus");
  const allowedStatuses = ORDER_STATUS_OPTIONS.map((option) => option.value);

  if (!allowedStatuses.includes(status)) {
    redirect(getSellerOrdersReturnPath(filterStatuses, "invalid-status"));
  }

  const updated = await updateSellerOrderStatus(orderId, user.id, status);
  revalidatePath("/seller/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/mypage/gifts");
  redirect(getSellerOrdersReturnPath(filterStatuses, updated ? "updated" : "blocked"));
}
