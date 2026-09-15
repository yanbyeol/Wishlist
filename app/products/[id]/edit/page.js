import { connection } from "next/server";
import { notFound } from "next/navigation";
import ProductForm from "@/app/products/product-form";
import { getProductById } from "@/lib/products";
import { requireUser } from "@/lib/session";

export const metadata = { title: "상품 수정" };

export default async function EditProductPage({ params }) {
  await connection();
  const { id } = await params;
  const user = await requireUser(`/products/${id}/edit`);
  const product = await getProductById(id);

  if (!product || product.sellerId !== user.id) {
    notFound();
  }

  return (
    <section className="container narrow-page page-section">
      <div className="page-heading">
        <p className="eyebrow">판매 상품 관리</p>
        <h1>상품 수정</h1>
        <p>재고가 0개가 되면 상품은 품절로 표시됩니다.</p>
      </div>
      <ProductForm product={product} />
    </section>
  );
}
