import { connection } from "next/server";
import { notFound } from "next/navigation";
import ProductDetailView from "@/components/product-detail-view";
import { getProductById } from "@/lib/products";
import { getCurrentUser } from "@/lib/session";
import { findUserById } from "@/lib/users";
import { getWishlistedProductIds } from "@/lib/wishlists";

export default async function ProductDetailPage({ params }) {
  await connection();
  const { id } = await params;
  const product = await getProductById(id);

  if (!product || product.status === "archived") {
    notFound();
  }

  const user = await getCurrentUser();
  const [seller, wishlistedIds] = await Promise.all([
    findUserById(product.sellerId),
    user ? getWishlistedProductIds(user.id) : [],
  ]);
  const isWishlisted = wishlistedIds.includes(product.id);

  return (
    <ProductDetailView
      product={product}
      seller={seller}
      user={user}
      isWishlisted={isWishlisted}
    />
  );
}
