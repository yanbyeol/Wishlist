import test from "node:test";
import assert from "node:assert/strict";
import { getProductFilters, getProductFilterPath } from "../app/product-filter.js";

test("메인 상품 조건은 서버 쿼리와 브라우저 URL에서 같은 기본값을 사용한다", () => {
  const expected = { category: "", keyword: "", sort: "newest", excludeSoldOut: false };
  assert.deepEqual(getProductFilters(undefined), expected);
  assert.deepEqual(getProductFilters(new URLSearchParams()), expected);
});

test("검색어 공백을 정리하고 카테고리·네 가지 정렬·품절 제외를 함께 검증한다", () => {
  for (const sort of ["newest", "price_asc", "price_desc", "popular"]) {
    const query = { category: "리빙", q: "  머그 & 커피  ", sort, excludeSoldOut: "1" };
    const expected = { category: "리빙", keyword: "머그 & 커피", sort, excludeSoldOut: true };
    assert.deepEqual(getProductFilters(query), expected);
    assert.deepEqual(getProductFilters(new URLSearchParams(query)), expected);
  }
});

test("객체·배열·중복 쿼리와 허용하지 않은 정렬은 서버와 브라우저에서 같은 값으로 정리한다", () => {
  const expected = { category: "", keyword: "", sort: "newest", excludeSoldOut: false };
  assert.deepEqual(getProductFilters({ category: { $ne: "" }, q: ["머그"], sort: "invalid", excludeSoldOut: true }), expected);
  assert.deepEqual(getProductFilters({ category: ["리빙", "디지털"], q: ["머그", "커피"], sort: ["popular", "price_asc"], excludeSoldOut: ["1", "1"] }), expected);
  assert.deepEqual(getProductFilters(new URLSearchParams("category=리빙&category=디지털&q=머그&q=커피&sort=popular&sort=price_asc&excludeSoldOut=1&excludeSoldOut=1")), expected);
});

test("메인 복귀 주소는 적용한 검색 조건을 인코딩하고 기본 조건은 생략한다", () => {
  const filters = getProductFilters({ category: "리빙", q: "머그 & 커피", sort: "price_asc", excludeSoldOut: "1" });
  const url = new URL(getProductFilterPath(filters), "http://localhost");
  assert.equal(url.pathname, "/");
  assert.deepEqual(getProductFilters(url.searchParams), filters);
  assert.equal(getProductFilterPath(getProductFilters({})), "/");
});

test("카테고리 변경과 빈 검색은 나머지 선택 조건을 보존한다", () => {
  const filters = getProductFilters({ q: "머그", sort: "popular", excludeSoldOut: "1" });
  const changedCategory = new URL(getProductFilterPath({ ...filters, category: "리빙" }), "http://localhost");
  assert.deepEqual(getProductFilters(changedCategory.searchParams), { ...filters, category: "리빙" });
  const emptySearch = new URL(getProductFilterPath({ ...filters, keyword: "" }), "http://localhost");
  assert.equal(emptySearch.searchParams.has("q"), false);
  assert.equal(emptySearch.searchParams.get("sort"), "popular");
  assert.equal(emptySearch.searchParams.get("excludeSoldOut"), "1");
});
