import Link from "next/link";
import ProductImage from "@/components/product-image";
import ShareButton from "@/components/share-button";
import WishlistButton from "@/components/wishlist-button";
import { formatWon } from "@/lib/utils/format";

export default function ProductCard({
  product,
  user,
  isWishlisted = false,
  isOwned = false,
  detailsHref = `/products/${product.id}`,
  returnPath = "/",
  showWishlistAction = true,
  participationPath = "",
  participationTitle = "",
}) {
  return (
    <article className="product-card">
      <div className="product-card-media">
        <Link href={detailsHref} aria-label={`${product.name} 상세 보기`}>
          <ProductImage src={product.imageUrl} alt={product.name} />
        </Link>
        {isOwned && <span className="own-product-badge">내 상품</span>}
        {showWishlistAction && (
          <WishlistButton
            productId={product.id}
            isWishlisted={isWishlisted}
            user={user}
            returnPath={returnPath}
            compact
          />
        )}
        {product.quantity === 0 && <span className="sold-out-overlay">품절</span>}
      </div>
      <div className="product-card-body">
        <p className="eyebrow">{product.category}</p>
        <Link href={detailsHref} className="product-name">{product.name}</Link>
        <div className="product-card-price-row">
          <strong>{formatWon(product.price)}</strong>
          <span>재고 {product.quantity}개</span>
        </div>
        {participationPath && (
          <div className="product-card-participation">
            <ShareButton
              path={participationPath}
              title={participationTitle || product.name}
              label="참여 링크 복사"
              copyOnly
              buttonClassName="button button-ghost button-full"
            />
          </div>
        )}
      </div>
    </article>
  );
}
