"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProductCard from "@/components/product-card";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import ProductSearchForm from "./product-search-form";
import { getProductFilters, getProductFilterPath } from "./product-filter";
import { queryProductsAction } from "./product-query-actions";

const PRODUCTS_PER_PAGE = 8;

export default function HomeProductBoard({ initialProducts, initialFilters, user, wishlistedIds }) {
  const [queryState, setQueryState] = useState(null);
  const latestRequest = useRef(0);
  const filterForm = useRef(null);
  const restoredPage = useRef(null);

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
  const totalPages = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE));
  const currentPage = Math.min(filters.page, totalPages);
  const firstProductIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
  const visibleProducts = products.slice(firstProductIndex, firstProductIndex + PRODUCTS_PER_PAGE);

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
      restoredPage.current = urlFilters.page;
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
    const formFilters = getProductFilters(new URLSearchParams(new FormData(event.currentTarget)));
    const submittedFilters = {
      ...formFilters,
      // 검색·정렬·카테고리 변경은 첫 페이지에서 시작하고, 뒤로 가기만 URL의 페이지를 복원합니다.
      page: restoredPage.current ?? 1,
    };
    restoredPage.current = null;
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

  function moveToPage(page) {
    if (page === currentPage || page < 1 || page > totalPages) return;

    const path = getProductFilterPath({ ...filters, page });
    window.history.pushState(null, "", `${path}${window.location.hash}`);
    // 페이지 이동은 이미 조회한 상품 배열만 나누므로 서버 재조회가 필요하지 않습니다.
    setQueryState((previous) => ({
      initialProducts,
      products: previous?.initialProducts === initialProducts ? previous.products : initialProducts,
      isLoading: previous?.initialProducts === initialProducts ? previous.isLoading : false,
      error: previous?.initialProducts === initialProducts ? previous.error : "",
    }));
  }

  return (
    <>
      <section className="category-strip" aria-label="상품 카테고리">
        <div className="container category-list">
          <Link href={getProductFilterPath({ ...filters, category: "", page: 1 })} prefetch={false} scroll={false} className={!filters.category ? "active" : ""}>전체</Link>
          {PRODUCT_CATEGORIES.map((category) => (
            <Link key={category} href={getProductFilterPath({ ...filters, category, page: 1 })} prefetch={false} scroll={false} className={filters.category === category ? "active" : ""}>{category}</Link>
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
            <>
              <div className="product-grid">
                {visibleProducts.map((product) => (
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
              {totalPages > 1 ? (
                <nav className="product-pagination" aria-label="상품 목록 페이지">
                  <button type="button" onClick={() => moveToPage(currentPage - 1)} disabled={currentPage === 1}>
                    이전
                  </button>
                  <div className="product-pagination-pages">
                    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                      <button
                        key={page}
                        type="button"
                        className={page === currentPage ? "active" : ""}
                        aria-label={`${page}페이지`}
                        aria-current={page === currentPage ? "page" : undefined}
                        onClick={() => moveToPage(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => moveToPage(currentPage + 1)} disabled={currentPage === totalPages}>
                    다음
                  </button>
                </nav>
              ) : null}
            </>
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
