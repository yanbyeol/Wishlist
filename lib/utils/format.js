export function formatWon(value) {
  const amount = Number(value) || 0;
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

export function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export function sanitizeCallbackPath(value, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export function getOrderStatusLabel(status) {
  const labels = {
    awaiting_address: "배송지 입력 대기",
    preparing: "상품 준비 중",
    shipped: "배송 중",
    delivered: "배송 완료",
    cancelled: "취소됨",
  };

  return labels[status] ?? "처리 중";
}
