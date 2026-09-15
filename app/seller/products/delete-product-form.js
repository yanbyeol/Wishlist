"use client";

import { deleteProductAction } from "@/app/products/actions";

export default function DeleteProductForm({ productId }) {
  function confirmDelete(event) {
    if (!window.confirm("이 상품을 삭제하시겠어요? 주문 내역이 있으면 판매 종료 상태로 보관됩니다.")) {
      event.preventDefault();
    }
  }

  return (
    <form action={deleteProductAction} onSubmit={confirmDelete}>
      <input type="hidden" name="productId" value={productId} />
      <button className="text-button danger-text" type="submit">삭제</button>
    </form>
  );
}
