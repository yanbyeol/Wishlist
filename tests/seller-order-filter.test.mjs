import test from "node:test";
import assert from "node:assert/strict";
import { getSellerOrderStatuses, getSellerOrdersReturnPath } from "../lib/seller-order-filter.js";

test("필터가 없으면 배송지 입력 대기와 상품 준비 중만 선택한다", () => {
  assert.deepEqual(getSellerOrderStatuses(undefined), ["awaiting_address", "preparing"]);
});

test("단일 상태와 여러 상태를 허용하고 중복은 제거한다", () => {
  assert.deepEqual(getSellerOrderStatuses("shipped"), ["shipped"]);
  assert.deepEqual(getSellerOrderStatuses(["delivered", "shipped", "shipped"]), ["shipped", "delivered"]);
});

test("허용하지 않은 상태는 제외하고 유효한 선택은 유지한다", () => {
  assert.deepEqual(getSellerOrderStatuses(["invalid", "delivered", ""]), ["delivered"]);
});

test("빈 값이나 잘못된 값만 전달되면 최소 선택을 기본 두 상태로 보장한다", () => {
  for (const value of [[], "", [""], "invalid", null, { $ne: null }]) {
    assert.deepEqual(getSellerOrderStatuses(value), ["awaiting_address", "preparing"]);
  }
});

test("네 가지 상태를 모두 선택할 수 있다", () => {
  const statuses = ["awaiting_address", "preparing", "shipped", "delivered"];
  assert.deepEqual(getSellerOrderStatuses(statuses), statuses);
});

test("상태 저장의 성공과 실패 모두 기존 필터가 포함된 내부 URL로 돌아간다", () => {
  for (const notice of ["updated", "blocked", "invalid-status"]) {
    const url = new URL(getSellerOrdersReturnPath(["shipped", "delivered"], notice), "http://localhost");
    assert.equal(url.pathname, "/seller/orders");
    assert.deepEqual(url.searchParams.getAll("status"), ["shipped", "delivered"]);
    assert.equal(url.searchParams.get("notice"), notice);
  }
});

test("복귀 URL도 잘못된 필터를 검증하고 빈 선택은 허용하지 않는다", () => {
  const url = new URL(getSellerOrdersReturnPath(["https://example.com", "invalid"], "updated"), "http://localhost");
  assert.equal(url.origin, "http://localhost");
  assert.equal(url.pathname, "/seller/orders");
  assert.deepEqual(url.searchParams.getAll("status"), ["awaiting_address", "preparing"]);
});
