"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import Link from "next/link";
import DeleteProductForm from "./delete-product-form";
import { querySellerProductsAction } from "./actions";
import EmptyState from "@/components/empty-state";
import ProductImage from "@/components/product-image";
import StatusBadge from "@/components/status-badge";
import { SELLER_PRODUCT_STATUS_OPTIONS } from "@/lib/constants";
import { getSellerProductStatuses } from "@/lib/seller-product-filter";
import { formatWon } from "@/lib/utils/format";
import ProductStatusCheckboxes from "./product-status-checkboxes";
import styles from "./product-filter.module.css";

const notices = {
  deleted: "상품을 삭제했습니다.",
  archived: "주문 내역이 있는 상품이라 판매 종료 상태로 보관했습니다.",
  "not-found": "상품을 찾을 수 없거나 관리 권한이 없습니다.",
};

function getProductStatusLabel(status) {
  if (status === "active") return "판매 중";
  if (status === "sold_out") return "품절";
  return "판매 종료";
}

function getProductStatusTone(status) {
  if (status === "active") return "success";
  if (status === "sold_out") return "warm";
  return "neutral";
}

export default function SellerProductBoard({ initialProducts, initialStatuses, initialNotice }) {
  const [queryState, setQueryState] = useState(null);
  const latestRequest = useRef(0);
  const filterForm = useRef(null);

  const query = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const selectedStatuses = query ? getSellerProductStatuses(query.getAll("status")) : initialStatuses;
  const notice = notices[query ? query.get("notice") : initialNotice] ?? "";
  // 상품 삭제 등으로 새 서버 데이터가 오면 이전 부분 조회 결과보다 우선합니다.
  const currentState = queryState?.initialProducts === initialProducts ? queryState : null;
  const products = currentState?.products ?? initialProducts;
  const isLoading = currentState?.isLoading ?? false;
  const error = currentState?.error ?? "";
  const hasAllStatuses = selectedStatuses.length === SELLER_PRODUCT_STATUS_OPTIONS.length;

  useEffect(() => {
    function restoreFilter() {
      if (window.location.pathname === "/seller/products") filterForm.current?.requestSubmit();
    }

    const urlStatuses = getSellerProductStatuses(new URLSearchParams(window.location.search).getAll("status"));
    const hasSameInitialStatuses = urlStatuses.length === initialStatuses.length
      && urlStatuses.every((status, index) => status === initialStatuses[index]);

    // 상품 상세에서 뒤로 돌아온 경우 사라진 부분 조회 결과를 URL 기준으로 복원합니다.
    if (!hasSameInitialStatuses) restoreFilter();

    window.addEventListener("popstate", restoreFilter);
    return () => {
      window.removeEventListener("popstate", restoreFilter);
      latestRequest.current += 1;
    };
  }, [initialStatuses]);

  function submitFilter(event) {
    event.preventDefault();
    const statuses = getSellerProductStatuses(new URLSearchParams(window.location.search).getAll("status"));
    const requestId = ++latestRequest.current;
    setQueryState((previous) => ({
      initialProducts,
      products: previous?.initialProducts === initialProducts ? previous.products : initialProducts,
      isLoading: true,
      error: "",
    }));

    startTransition(async () => {
      try {
        const result = await querySellerProductsAction(statuses);
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
          error: "상품을 조회하지 못했습니다. 다시 조회해 주세요.",
        }));
      }
    });
  }

  return (
    <>
      <form ref={filterForm} action="/seller/products" method="get" onSubmit={submitFilter} className={styles.filter}>
        <ProductStatusCheckboxes selectedStatuses={selectedStatuses} />
        <button className={`button button-primary ${styles.queryButton}`} type="submit">다시 조회</button>
        <p id="product-filter-help" className={styles.help}>
          {!isLoading && !error && "최소 1개 상태를 선택해 주세요."}
          <span className={`${styles.feedback}${error ? " error-message" : ""}`} role={error ? "alert" : "status"}>
            {isLoading ? "조회 중…" : error}
          </span>
        </p>
      </form>
      {notice && <p className="notice-banner">{notice}</p>}
      <div aria-busy={isLoading}>
        {products.length > 0 ? (
          <div className="management-list">
            {products.map((product) => (
              <article className="management-item" key={product.id}>
                <ProductImage src={product.imageUrl} alt={product.name} />
                <div className="management-item-copy">
                  <div><p className="eyebrow">{product.category}</p><h2>{product.name}</h2></div>
                  <p>{formatWon(product.price)} · 재고 {product.quantity}개</p>
                </div>
                <StatusBadge tone={getProductStatusTone(product.status)}>{getProductStatusLabel(product.status)}</StatusBadge>
                {product.status !== "archived" ? (
                  <div className="inline-actions item-actions">
                    <Link href={`/products/${product.id}`} className="text-link">보기</Link>
                    <Link href={`/products/${product.id}/edit`} className="text-link">수정</Link>
                    <DeleteProductForm productId={product.id} filterStatuses={selectedStatuses} />
                  </div>
                ) : (
                  <p className="muted-copy">주문 기록 보관 중</p>
                )}
              </article>
            ))}
          </div>
        ) : hasAllStatuses ? (
          <EmptyState
            title="등록한 상품이 없어요"
            description="위시메이트에 소개하고 싶은 선물을 직접 등록해 보세요."
            href="/products/new"
            action="첫 상품 등록하기"
          />
        ) : (
          <EmptyState
            title="선택한 상태의 상품이 없어요"
            description="다른 상품 상태를 선택하거나 전체 상품을 확인해 주세요."
            href="/seller/products"
            action="전체 상품 보기"
          />
        )}
      </div>
    </>
  );
}
