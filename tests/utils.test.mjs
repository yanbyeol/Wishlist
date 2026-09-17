import test from "node:test";
import assert from "node:assert/strict";
import {
  formatWon,
  getGroupGiftStatusLabel,
  getOrderStatusLabel,
  sanitizeCallbackPath,
} from "../lib/utils/format.js";
import {
  isValidEmail,
  isValidImageUrl,
  isValidOtpCode,
  parseAddressFormData,
  parseNonNegativeInteger,
  parsePositiveInteger,
} from "../lib/utils/validation.js";
import { hasGroupGiftStarted } from "../lib/utils/group-gift.js";

test("금액을 한국 원화 문자열로 표시한다", () => {
  assert.equal(formatWon(240000), "240,000원");
  assert.equal(formatWon(null), "0원");
});

test("로그인 콜백은 앱 내부 절대 경로만 허용한다", () => {
  assert.equal(sanitizeCallbackPath("/wishlist"), "/wishlist");
  assert.equal(sanitizeCallbackPath("//malicious.example"), "/");
  assert.equal(sanitizeCallbackPath("https://malicious.example"), "/");
});

test("주문과 공동선물 상태를 읽기 쉬운 문구로 바꾼다", () => {
  assert.equal(getOrderStatusLabel("awaiting_address"), "배송지 입력 대기");
  assert.equal(getOrderStatusLabel("unknown"), "처리 중");
  assert.equal(getGroupGiftStatusLabel("completed"), "선물 준비 완료");
  assert.equal(getGroupGiftStatusLabel("funding"), "함께 선물 진행 중");
  assert.equal(getGroupGiftStatusLabel("unknown"), "처리 중");
});

test("공동선물 시작 여부는 최초 누적 참여 금액부터 참이 된다", () => {
  assert.equal(hasGroupGiftStarted({ status: "funding", currentAmount: 0 }), false);
  assert.equal(hasGroupGiftStarted({ status: "funding", currentAmount: 10000 }), true);
  assert.equal(hasGroupGiftStarted({ status: "funded", currentAmount: 10000 }), true);
  assert.equal(hasGroupGiftStarted({ status: "completed", currentAmount: 10000 }), true);
  assert.equal(hasGroupGiftStarted({ status: "cancelled", currentAmount: 10000 }), false);
});

test("상품 가격과 수량에 사용할 정수만 파싱한다", () => {
  assert.equal(parsePositiveInteger("12,000"), 12000);
  assert.equal(parsePositiveInteger("0"), null);
  assert.equal(parsePositiveInteger("1.5"), null);
  assert.equal(parseNonNegativeInteger("0"), 0);
  assert.equal(parseNonNegativeInteger("-1"), null);
});

test("이메일과 이미지 주소 형식을 검증한다", () => {
  assert.equal(isValidEmail("friend@example.com"), true);
  assert.equal(isValidEmail("friend@invalid"), false);
  assert.equal(isValidImageUrl("https://example.com/gift.jpg"), true);
  assert.equal(isValidImageUrl("/images/gift.jpg"), true);
  assert.equal(isValidImageUrl("javascript:alert(1)"), false);
});

test("이메일 간편 인증은 숫자 6자리만 허용한다", () => {
  assert.equal(isValidOtpCode("012345"), true);
  assert.equal(isValidOtpCode("12345"), false);
  assert.equal(isValidOtpCode("12345a"), false);
});

test("배송지 검증 실패 시 정리된 입력값을 함께 반환한다", () => {
  const values = new Map([
    ["label", " 집 "],
    ["recipientName", " 김민지 "],
    ["phone", "잘못된 번호"],
    ["postalCode", "12345"],
    ["address1", "테스트시 선물로 123"],
    ["address2", "101호"],
    ["isDefault", "on"],
  ]);
  const parsed = parseAddressFormData(
    { get: (name) => values.get(name) },
    { includeLabel: true },
  );

  assert.equal(parsed.error, "연락처를 숫자와 하이픈을 사용해 입력해 주세요.");
  assert.equal(parsed.fields.label, "집");
  assert.equal(parsed.fields.recipientName, "김민지");
  assert.equal(parsed.fields.phone, "잘못된 번호");
  assert.equal(parsed.fields.isDefault, true);
});
