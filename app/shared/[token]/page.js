import { connection } from "next/server";
import { notFound } from "next/navigation";
import EmptyState from "@/components/empty-state";
import ProductCard from "@/components/product-card";
import { findOpenGroupGiftsForProducts } from "@/lib/group-gifts";
import { getSharedWishlist } from "@/lib/wishlists";

export default async function SharedWishlistPage({ params }) {
  await connection();
  const { token } = await params;
  const wishlist = await getSharedWishlist(token);

  if (!wishlist) {
    notFound();
  }

  const openGroupGifts = await findOpenGroupGiftsForProducts(
    wishlist.userId,
    wishlist.items.map(({ product }) => product.id),
  );
  const groupGiftByProductId = new Map(
    openGroupGifts.map((groupGift) => [groupGift.productId, groupGift]),
  );

  return (
    <section className="container page-section">
      <div className="shared-list-intro">
        <p className="eyebrow">친구가 기다리는 마음</p>
        <h1>{wishlist.title}</h1>
        <p>{wishlist.owner?.name ?? "친구"}님이 받고 싶은 선물을 모아 두었어요.</p>
      </div>

      {wishlist.items.length > 0 ? (
        <div className="product-grid">
          {wishlist.items.map(({ product }) => {
            const groupGift = groupGiftByProductId.get(product.id);

            return (
              <ProductCard
                key={product.id}
                product={product}
                detailsHref={groupGift
                  ? `/group-gifts/${groupGift.id}`
                  : `/shared/${token}/products/${product.id}`}
                showWishlistAction={false}
                groupGiftStatus={groupGift?.status}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="공유된 상품이 아직 없어요"
          description="목록 주인이 새로운 선물을 담으면 이곳에서 확인할 수 있어요."
        />
      )}
    </section>
  );
}
