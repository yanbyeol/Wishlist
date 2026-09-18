"use client";

import { useEffect, useRef } from "react";

export default function ProductSearchForm({
  formRef,
  onSubmit,
  category,
  keyword,
  sort,
  excludeSoldOut,
  isLoading,
  error,
}) {
  const keywordInput = useRef(null);

  useEffect(() => {
    if (keywordInput.current) keywordInput.current.value = keyword;
  }, [keyword]);

  function submitFilters(event) {
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="product-filter-form" action="/#products" method="get">
      <input type="hidden" name="category" value={category} />
      <div className="search-form">
        <label>
          <span className="sr-only">상품 검색</span>
          <input
            ref={keywordInput}
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
          <select name="sort" value={sort} onChange={submitFilters}>
            <option value="default">기본</option>
            <option value="newest">최신 등록순</option>
            <option value="price_asc">낮은 가격순</option>
            <option value="price_desc">높은 가격순</option>
          </select>
        </label>
        <label className="checkbox-field product-stock-filter">
          <input
            type="checkbox"
            name="excludeSoldOut"
            value="1"
            checked={excludeSoldOut}
            onChange={submitFilters}
          />
          <span>품절상품 제외</span>
        </label>
      </div>
      <p className={`form-message${error ? " error-message" : ""}`} role={error ? "alert" : "status"}>
        {isLoading ? "조회 중…" : error}
      </p>
    </form>
  );
}
