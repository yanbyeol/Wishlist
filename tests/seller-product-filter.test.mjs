import test from "node:test";
import assert from "node:assert/strict";
import { getSellerProductStatuses, getSellerProductsReturnPath } from "../lib/seller-product-filter.js";

test("상품 상태 필터가 없으면 판매 중·품절·판매 종료를 모두 선택한다", () => {
  assert.deepEqual(getSellerProductStatuses(undefined), ["active", "sold_out", "archived"]);
});

test("상품 상태 필터는 단일·복수 값을 허용하고 중복을 제거한다", () => {
  assert.deepEqual(getSellerProductStatuses("sold_out"), ["sold_out"]);
  assert.deepEqual(getSellerProductStatuses(["archived", "active", "archived"]), ["active", "archived"]);
});

test("허용하지 않은 상품 상태는 제외하고 유효한 선택은 유지한다", () => {
  assert.deepEqual(getSellerProductStatuses(["invalid", "sold_out", ""]), ["sold_out"]);
});

test("빈 값이나 잘못된 값만 있으면 세 상품 상태를 모두 선택한다", () => {
  for (const value of [[], "", [""], "invalid", null, { sellerId: "other" }]) {
    assert.deepEqual(getSellerProductStatuses(value), ["active", "sold_out", "archived"]);
  }
});

test("상품관리 복귀 URL은 검증된 필터와 알림만 포함한다", () => {
  const url = new URL(getSellerProductsReturnPath(["sold_out", "invalid"], "archived"), "http://localhost");
  assert.equal(url.origin, "http://localhost");
  assert.equal(url.pathname, "/seller/products");
  assert.deepEqual(url.searchParams.getAll("status"), ["sold_out"]);
  assert.equal(url.searchParams.get("notice"), "archived");
});

test("잘못된 상품 상태만 있는 복귀 URL도 전체 상태를 기본값으로 사용한다", () => {
  const url = new URL(getSellerProductsReturnPath(["https://example.com", "invalid"], "not-found"), "http://localhost");
  assert.deepEqual(url.searchParams.getAll("status"), ["active", "sold_out", "archived"]);
  assert.equal(url.searchParams.get("notice"), "not-found");
});
