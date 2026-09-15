import Link from "next/link";
import { connection } from "next/server";
import DeleteProductForm from "@/app/seller/products/delete-product-form";
import EmptyState from "@/components/empty-state";
import ProductImage from "@/components/product-image";
import StatusBadge from "@/components/status-badge";
import { listProductsBySeller } from "@/lib/products";
import { requireUser } from "@/lib/session";
import { formatWon } from "@/lib/utils/format";

export const metadata = { title: "판매 상품 관리" };

const notices = {
  deleted: "상품을 삭제했습니다.",
  archived: "주문 내역이 있는 상품이라 판매 종료 상태로 보관했습니다.",
  "not-found": "상품을 찾을 수 없거나 관리 권한이 없습니다.",
};

export default async function SellerProductsPage({ searchParams }) {
  await connection();
  const user = await requireUser("/seller/products");
  const [products, query] = await Promise.all([listProductsBySeller(user.id), searchParams]);
  const notice = typeof query.notice === "string" ? notices[query.notice] : "";

  return (
    <section className="container page-section">
      <div className="page-heading heading-with-action">
        <div><p className="eyebrow">판매 상품 관리</p><h1>상품 관리</h1><p>내가 등록한 상품과 재고를 관리합니다.</p></div>
        <Link href="/products/new" className="button button-primary">+ 상품 등록</Link>
      </div>
      {notice && <p className="notice-banner">{notice}</p>}

      {products.length > 0 ? (
        <div className="management-list">
          {products.map((product) => (
            <article className="management-item" key={product.id}>
              <ProductImage src={product.imageUrl} alt={product.name} />
              <div className="management-item-copy">
                <div><p className="eyebrow">{product.category}</p><h2>{product.name}</h2></div>
                <p>{formatWon(product.price)} · 재고 {product.quantity}개</p>
              </div>
              <StatusBadge tone={product.status === "active" ? "success" : product.status === "sold_out" ? "warm" : "neutral"}>
                {product.status === "active" ? "판매 중" : product.status === "sold_out" ? "품절" : "판매 종료"}
              </StatusBadge>
              <div className="inline-actions item-actions">
                <Link href={`/products/${product.id}`} className="text-link">보기</Link>
                {product.status !== "archived" && <Link href={`/products/${product.id}/edit`} className="text-link">수정</Link>}
                <DeleteProductForm productId={product.id} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="등록한 상품이 없어요"
          description="위시메이트에 소개하고 싶은 선물을 직접 등록해 보세요."
          href="/products/new"
          action="첫 상품 등록하기"
        />
      )}
    </section>
  );
}
