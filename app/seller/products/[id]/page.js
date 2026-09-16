import { notFound } from "next/navigation";
import { connection } from "next/server";
import ProductDetailView from "@/components/product-detail-view";
import { getProductById } from "@/lib/products";
import { requireUser } from "@/lib/session";

export const metadata = { title: "상품 미리보기" };

export default async function SellerProductPreviewPage({ params }) {
  await connection();
  const { id } = await params;
  const user = await requireUser(`/seller/products/${id}`);
  const product = await getProductById(id);

  if (!product || product.status === "archived" || product.sellerId !== user.id) {
    notFound();
  }

  return (
    <ProductDetailView
      product={product}
      seller={user}
      user={user}
      showActions={false}
    />
  );
}
