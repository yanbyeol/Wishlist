"use client";

import { useActionState } from "react";
import { createProductAction, updateProductAction } from "@/app/products/actions";
import { PRODUCT_CATEGORIES } from "@/lib/constants";

const initialState = { message: "" };

export default function ProductForm({ product = null }) {
  const action = product
    ? updateProductAction.bind(null, product.id)
    : createProductAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="stack-form form-card">
      <div className="form-grid two-columns">
        <label className="field field-wide">
          <span>상품 이미지 URL</span>
          <input
            name="imageUrl"
            type="url"
            defaultValue={product?.imageUrl}
            placeholder="https://example.com/product.jpg"
            required
          />
          <small>공개된 http(s) 이미지 주소를 입력해 주세요.</small>
        </label>
        <label className="field field-wide">
          <span>상품명</span>
          <input name="name" type="text" minLength="2" defaultValue={product?.name} placeholder="마음을 전할 상품 이름" required />
        </label>
        <label className="field">
          <span>가격</span>
          <div className="input-with-suffix">
            <input name="price" type="number" min="1" step="1" defaultValue={product?.price} placeholder="32000" required />
            <span>원</span>
          </div>
        </label>
        <label className="field">
          <span>수량</span>
          <div className="input-with-suffix">
            <input name="quantity" type="number" min={product ? "0" : "1"} step="1" defaultValue={product?.quantity ?? 1} required />
            <span>개</span>
          </div>
        </label>
        <label className="field field-wide">
          <span>카테고리</span>
          <select name="category" defaultValue={product?.category ?? ""} required>
            <option value="" disabled>카테고리를 선택하세요</option>
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <label className="field field-wide">
          <span>상세 설명</span>
          <textarea
            name="description"
            rows="7"
            minLength="10"
            defaultValue={product?.description}
            placeholder="상품의 특징과 선물하기 좋은 이유를 알려주세요."
            required
          />
        </label>
      </div>
      <p className="form-message error-message" aria-live="polite">{state?.message}</p>
      <button className="button button-primary button-full" type="submit" disabled={pending}>
        {pending ? "저장 중..." : product ? "상품 수정하기" : "상품 등록하기"}
      </button>
    </form>
  );
}
