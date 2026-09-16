import { SELLER_PRODUCT_STATUS_OPTIONS } from "./constants.js";

export function getSellerProductStatuses(value) {
  const requestedStatuses = Array.isArray(value) ? value : [value];
  const selectedStatuses = SELLER_PRODUCT_STATUS_OPTIONS
    .map((option) => option.value)
    .filter((status) => requestedStatuses.includes(status));

  // 필터가 없거나 유효하지 않으면 기존처럼 모든 등록 상품을 표시합니다.
  return selectedStatuses.length > 0
    ? selectedStatuses
    : SELLER_PRODUCT_STATUS_OPTIONS.map((option) => option.value);
}

export function getSellerProductsReturnPath(filterValues, notice) {
  const query = new URLSearchParams();
  for (const status of getSellerProductStatuses(filterValues)) {
    query.append("status", status);
  }
  if (notice) query.set("notice", notice);
  return `/seller/products?${query.toString()}`;
}
