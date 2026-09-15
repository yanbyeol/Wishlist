import Link from "next/link";
import ProductImage from "@/components/product-image";
import WishlistButton from "@/components/wishlist-button";
import { formatWon } from "@/lib/utils/format";

export default function ProductCard({
  product,
  user,
  isWishlisted = false,
  detailsHref = `/products/${product.id}`,
  returnPath = "/",
}) {
  return (
    <article className="product-card">
      <div className="product-card-media">
        <Link href={detailsHref} aria-label={`${product.name} 상세 보기`}>
          <ProductImage src={product.imageUrl} alt={product.name} />
        </Link>
        <WishlistButton
          productId={product.id}
          isWishlisted={isWishlisted}
          user={user}
          returnPath={returnPath}
          compact
        />
        {product.quantity === 0 && <span className="sold-out-overlay">품절</span>}
      </div>
      <div className="product-card-body">
        <p className="eyebrow">{product.category}</p>
        <Link href={detailsHref} className="product-name">{product.name}</Link>
        <div className="product-card-price-row">
          <strong>{formatWon(product.price)}</strong>
          <span>재고 {product.quantity}개</span>
        </div>
      </div>
    </article>
  );
}
