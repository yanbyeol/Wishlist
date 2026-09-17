"use server";

import { listProducts } from "@/lib/products";
import { getProductFilters } from "./product-filter";

export async function queryProductsAction(query) {
  const filters = getProductFilters(query);

  try {
    // 공개 상품 조회는 로그인이나 세션 쿠키 갱신 없이 처리합니다.
    const products = await listProducts({
      category: filters.category,
      query: filters.keyword,
      sort: filters.sort,
      excludeSoldOut: filters.excludeSoldOut,
    });
    return { products, error: "" };
  } catch {
    return { error: "상품을 조회하지 못했습니다. 검색 버튼으로 다시 조회해 주세요." };
  }
}
