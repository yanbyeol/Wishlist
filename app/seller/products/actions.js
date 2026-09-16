"use server";

import { listProductsBySeller } from "@/lib/products";
import { getSellerProductStatuses } from "@/lib/seller-product-filter";
import { requireUser } from "@/lib/session";

export async function querySellerProductsAction(statuses) {
  const user = await requireUser("/seller/products");
  const selectedStatuses = getSellerProductStatuses(statuses);

  try {
    const products = await listProductsBySeller(user.id, selectedStatuses);
    return { products, error: "" };
  } catch {
    return { error: "상품을 조회하지 못했습니다. 다시 조회해 주세요." };
  }
}
