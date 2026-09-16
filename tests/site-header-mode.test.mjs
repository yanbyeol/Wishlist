import test from "node:test";
import assert from "node:assert/strict";
import { getModeFromPath } from "../components/site-header-mode.js";

test("판매 홈과 판매자 하위 경로를 판매자 모드로 판별한다", () => {
  for (const path of ["/seller", "/seller/", "/seller/products", "/seller/orders", "/seller/orders/123"]) {
    assert.equal(getModeFromPath(path), "seller", path);
  }
});

test("기존 상품 등록과 수정 경로는 판매자 모드를 유지한다", () => {
  for (const path of ["/products/new", "/products/new/", "/products/123/edit", "/products/123/edit/"]) {
    assert.equal(getModeFromPath(path), "seller", path);
  }
});

test("사용자 화면과 비슷한 이름의 경로를 판매자로 오인하지 않는다", () => {
  for (const path of ["/", "/wishlist", "/mypage", "/mypage/gifts", "/products/123", "/orders/123", "/login", "/seller-other", "/sellers", "/products/123/edit/other"]) {
    assert.equal(getModeFromPath(path), "user", path);
  }
});

test("모드 판별 결과는 이전 호출이나 다른 탭의 경로에 영향받지 않는다", () => {
  assert.equal(getModeFromPath("/seller"), "seller");
  assert.equal(getModeFromPath("/wishlist"), "user");
  assert.equal(getModeFromPath("/seller/orders"), "seller");
  assert.equal(getModeFromPath("/"), "user");
});
