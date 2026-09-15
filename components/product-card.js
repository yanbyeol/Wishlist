import Link from "next/link";
import ProductImage from "@/components/product-image";
import WishlistButton from "@/components/wishlist-button";
import { formatWon } from "@/lib/utils/format";

export default function ProductCard({ product, user, isWishlisted = false }) {
  return (
    <article className="product-card">
      <div className="product-card-media">
        <Link href={`/products/${product.id}`} aria-label={`${product.name} 상세 보기`}>
          <ProductImage src={product.imageUrl} alt={product.name} />
        </Link>
        <WishlistButton
          productId={product.id}
          isWishlisted={isWishlisted}
          user={user}
          returnPath="/"
          compact
        />
        {product.quantity === 0 && <span className="sold-out-overlay">품절</span>}
      </div>
      <div className="product-card-body">
        <p className="eyebrow">{product.category}</p>
        <Link href={`/products/${product.id}`} className="product-name">{product.name}</Link>
        <div className="product-card-price-row">
          <strong>{formatWon(product.price)}</strong>
          <span>재고 {product.quantity}개</span>
        </div>
      </div>
    </article>
  );
}
