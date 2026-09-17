"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProductCard from "@/components/product-card";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import ProductSearchForm from "./product-search-form";
import { getProductFilters, getProductFilterPath } from "./product-filter";
import { queryProductsAction } from "./product-query-actions";

export default function HomeProductBoard({ initialProducts, initialFilters, user, wishlistedIds }) {
  const [queryState, setQueryState] = useState(null);
  const latestRequest = useRef(0);
  const filterForm = useRef(null);

  // 위시리스트 변경 등으로 새 서버 데이터가 오면 이전 부분 조회 결과보다 우선합니다.
  const currentState = queryState?.initialProducts === initialProducts ? queryState : null;
  // 페이지 이동의 새 서버 조건은 브라우저 주소가 반영되기 전에도 즉시 적용합니다.
  const filters = currentState && typeof window !== "undefined"
    ? getProductFilters(new URLSearchParams(window.location.search))
    : initialFilters;
  const products = currentState?.products ?? initialProducts;
  const isLoading = currentState?.isLoading ?? false;
  const error = currentState?.error ?? "";
  const wishlisted = new Set(wishlistedIds);
  const returnPath = getProductFilterPath(filters);

  useEffect(() => {
    function restoreFilters() {
      const form = filterForm.current;
      if (window.location.pathname !== "/" || !form) return;
      const urlFilters = getProductFilters(new URLSearchParams(window.location.search));

      // 뒤로 가기에서는 입력 중인 검색어 대신 주소에 저장된 조건으로 조회합니다.
      form.elements.namedItem("category").value = urlFilters.category;
      form.elements.namedItem("q").value = urlFilters.keyword;
      form.elements.namedItem("sort").value = urlFilters.sort;
      form.elements.namedItem("excludeSoldOut").checked = urlFilters.excludeSoldOut;
      form.requestSubmit();
    }

    const urlFilters = getProductFilters(new URLSearchParams(window.location.search));
    // 상세 화면에서 돌아와 부분 조회 결과가 사라졌으면 URL 조건으로 복원합니다.
    if (getProductFilterPath(urlFilters) !== getProductFilterPath(initialFilters)) restoreFilters();

    window.addEventListener("popstate", restoreFilters);
    return () => {
      window.removeEventListener("popstate", restoreFilters);
      latestRequest.current += 1;
    };
  }, [initialProducts, initialFilters]);

  function submitFilters(event) {
    event.preventDefault();
    const submittedFilters = getProductFilters(new URLSearchParams(new FormData(event.currentTarget)));
    const urlFilters = getProductFilters(new URLSearchParams(window.location.search));
    const path = getProductFilterPath(submittedFilters);

    if (path !== getProductFilterPath(urlFilters)) {
      window.history.pushState(null, "", `${path}${window.location.hash}`);
    }

    const requestId = ++latestRequest.current;
    setQueryState((previous) => ({
      initialProducts,
      products: previous?.initialProducts === initialProducts ? previous.products : initialProducts,
      isLoading: true,
      error: "",
    }));

    startTransition(async () => {
      try {
        const result = await queryProductsAction({
          category: submittedFilters.category,
          q: submittedFilters.keyword,
          sort: submittedFilters.sort,
          excludeSoldOut: submittedFilters.excludeSoldOut ? "1" : "",
        });
        if (requestId !== latestRequest.current) return;
        setQueryState((previous) => ({
          initialProducts,
          products: result.error ? previous.products : result.products,
          isLoading: false,
          error: result.error,
        }));
      } catch {
        if (requestId !== latestRequest.current) return;
        setQueryState((previous) => ({
          ...previous,
          isLoading: false,
          error: "상품을 조회하지 못했습니다. 검색 버튼으로 다시 조회해 주세요.",
        }));
      }
    });
  }

  return (
    <>
      <section className="category-strip" aria-label="상품 카테고리">
        <div className="container category-list">
          <Link href={getProductFilterPath({ ...filters, category: "" })} prefetch={false} scroll={false} className={!filters.category ? "active" : ""}>전체</Link>
          {PRODUCT_CATEGORIES.map((category) => (
            <Link key={category} href={getProductFilterPath({ ...filters, category })} prefetch={false} scroll={false} className={filters.category === category ? "active" : ""}>{category}</Link>
          ))}
        </div>
      </section>

      <section className="container products-section" id="products">
        <div className="section-heading">
          <div>
            <p className="eyebrow">선물 큐레이션</p>
            <h2>{filters.category || "마음을 전하기 좋은 선물"}</h2>
          </div>
          <ProductSearchForm
            formRef={filterForm}
            onSubmit={submitFilters}
            category={filters.category}
            keyword={filters.keyword}
            sort={filters.sort}
            excludeSoldOut={filters.excludeSoldOut}
            isLoading={isLoading}
            error={error}
          />
        </div>

        <div aria-busy={isLoading}>
          {products.length ? (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  user={user}
                  isWishlisted={wishlisted.has(product.id)}
                  isOwned={product.sellerId === user?.id}
                  returnPath={returnPath}
                />
              ))}
            </div>
          ) : (
            <div className="inline-empty">
              <p>조건에 맞는 상품이 아직 없어요.</p>
              <Link href="/" prefetch={false} className="text-link">전체 상품 보기</Link>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
