"use client";

import { useEffect } from "react";

export default function ProductSearchForm({
  category,
  keyword,
  sort,
  excludeSoldOut,
}) {
  useEffect(() => {
    if (window.location.hash === "#products") {
      document.getElementById("products")?.scrollIntoView({ block: "start" });
    }
  }, []);

  function submitFilters(event) {
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form className="product-filter-form" action="/#products" method="get">
      {category && <input type="hidden" name="category" value={category} />}
      <div className="search-form">
        <label>
          <span className="sr-only">상품 검색</span>
          <input
            name="q"
            defaultValue={keyword}
            placeholder="어떤 선물을 찾으세요?"
          />
        </label>
        <button className="button button-dark" type="submit">검색</button>
      </div>
      <div className="product-filter-controls">
        <label className="product-sort-field">
          <span>정렬</span>
          <select name="sort" defaultValue={sort} onChange={submitFilters}>
            <option value="newest">최신 등록순</option>
            <option value="price_asc">낮은 가격순</option>
            <option value="price_desc">높은 가격순</option>
            <option value="popular">인기상품순</option>
          </select>
        </label>
        <label className="checkbox-field product-stock-filter">
          <input
            type="checkbox"
            name="excludeSoldOut"
            value="1"
            defaultChecked={excludeSoldOut}
            onChange={submitFilters}
          />
          <span>품절상품 제외</span>
        </label>
      </div>
    </form>
  );
}
