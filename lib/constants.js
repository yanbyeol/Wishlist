export const PRODUCT_CATEGORIES = [
  "디지털",
  "리빙",
  "패션",
  "뷰티",
  "식품",
  "취미",
];

export const ORDER_STATUS_OPTIONS = [
  { value: "awaiting_address", label: "배송지 입력 대기" },
  { value: "preparing", label: "상품 준비 중" },
  { value: "shipped", label: "배송 중" },
  { value: "delivered", label: "배송 완료" },
];

export const SELLER_PRODUCT_STATUS_OPTIONS = [
  { value: "active", label: "판매 중" },
  { value: "sold_out", label: "품절" },
  { value: "archived", label: "판매 종료" },
];

export const GROUP_GIFT_DURATION_DAYS = 14;

export const GROUP_GIFT_WISHLIST_REMOVAL_MESSAGE =
  "공동선물이 진행 중인 상품은 위시리스트에서 삭제할 수 없어요.";
