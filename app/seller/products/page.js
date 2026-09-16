import Link from "next/link";
import { connection } from "next/server";
import { listProductsBySeller } from "@/lib/products";
import { getSellerProductStatuses } from "@/lib/seller-product-filter";
import { requireUser } from "@/lib/session";
import SellerProductBoard from "./seller-product-board";

export const metadata = { title: "판매 상품 관리" };

export default async function SellerProductsPage({ searchParams }) {
  await connection();
  const user = await requireUser("/seller/products");
  const query = await searchParams;
  const selectedStatuses = getSellerProductStatuses(query.status);
  const products = await listProductsBySeller(user.id, selectedStatuses);
  const notice = typeof query.notice === "string" ? query.notice : "";

  return (
    <section className="container page-section">
      <div className="page-heading heading-with-action">
        <div><p className="eyebrow">판매 상품 관리</p><h1>상품 관리</h1><p>내가 등록한 상품과 재고를 관리합니다.</p></div>
        <Link href="/products/new" className="button button-primary">+ 상품 등록</Link>
      </div>
      <SellerProductBoard
        initialProducts={products}
        initialStatuses={selectedStatuses}
        initialNotice={notice}
      />
    </section>
  );
}
