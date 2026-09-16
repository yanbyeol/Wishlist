import { ORDER_STATUS_OPTIONS } from "./constants.js";

export function getSellerOrderStatuses(value) {
  const requestedStatuses = Array.isArray(value) ? value : [value];
  const selectedStatuses = ORDER_STATUS_OPTIONS
    .map((option) => option.value)
    .filter((status) => requestedStatuses.includes(status));

  // 빈 값이나 허용하지 않은 값만 전달되어도 최소 한 가지 상태를 유지합니다.
  return selectedStatuses.length > 0 ? selectedStatuses : ["awaiting_address", "preparing"];
}

export function getSellerOrdersReturnPath(filterValues, notice) {
  const query = new URLSearchParams();
  for (const status of getSellerOrderStatuses(filterValues)) {
    query.append("status", status);
  }
  if (notice) query.set("notice", notice);
  return `/seller/orders?${query.toString()}`;
}
