import Link from "next/link";
import { GiftIcon, SparkleIcon } from "@/components/icons";
import ProductImage from "@/components/product-image";
import WishlistButton from "@/components/wishlist-button";
import { formatWon } from "@/lib/utils/format";

export default function ProductDetailView({
  product,
  seller,
  user,
  isWishlisted = false,
  showActions = true,
}) {
  const soldOut = product.quantity === 0;

  return (
    <section className="container page-section">
      <div className="product-detail-grid">
        <div className="detail-media">
          <ProductImage src={product.imageUrl} alt={product.name} />
          {soldOut && <span className="sold-out-overlay large">품절</span>}
        </div>
        <div className="product-detail-copy">
          <p className="eyebrow">{product.category}</p>
          <h1>{product.name}</h1>
          <p className="detail-price">{formatWon(product.price)}</p>
          <p className="seller-line">{seller?.name ?? "WishMate 판매자"} · 남은 수량 {product.quantity}개</p>
          <div className="detail-description">
            <h2>상품 소개</h2>
            <p>{product.description}</p>
          </div>
          <div className="demo-notice compact"><SparkleIcon /><span>결제와 배송은 실제로 이루어지지 않는 데모입니다.</span></div>
          {showActions && (
            <div className="detail-actions">
              {soldOut ? (
                <button className="button button-disabled" disabled>현재 품절된 상품입니다</button>
              ) : (
                <>
                  <Link href={`/orders/new?product=${product.id}`} className="button button-primary">
                    <GiftIcon size={20} /> 선물하기
                  </Link>
                  <Link href={`/orders/new?product=${product.id}&mode=self`} className="button button-dark">
                    나에게 선물하기
                  </Link>
                </>
              )}
              <WishlistButton
                productId={product.id}
                isWishlisted={isWishlisted}
                user={user}
                returnPath={`/products/${product.id}`}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
