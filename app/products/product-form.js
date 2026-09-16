"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createProductAction, updateProductAction } from "@/app/products/actions";
import {
  PRODUCT_IMAGE_ACCEPT,
  validateProductImageFile,
} from "@/app/products/product-image-validation";
import ProductImage from "@/components/product-image";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { isValidImageUrl } from "@/lib/utils/validation";

const initialState = { message: "" };
const isDevelopment = process.env.NODE_ENV === "development";

export default function ProductForm({ product = null }) {
  const action = product
    ? updateProductAction.bind(null, product.id)
    : createProductAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [developmentImageUrl, setDevelopmentImageUrl] = useState(product?.imageUrl ?? "");
  const [filePreviewUrl, setFilePreviewUrl] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [fileMessage, setFileMessage] = useState("");
  const [isDevelopmentUrlOpen, setIsDevelopmentUrlOpen] = useState(Boolean(product));
  const objectUrlRef = useRef("");

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function clearFilePreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }

    setFilePreviewUrl("");
    setSelectedFileName("");
  }

  async function handleImageFileChange(event) {
    const input = event.currentTarget;
    const file = event.target.files?.[0];
    clearFilePreview();
    setFileMessage("");

    if (!file) {
      return;
    }

    const validation = await validateProductImageFile(file);

    if (input.files?.[0] !== file) {
      return;
    }

    if (validation.error) {
      input.value = "";
      setFileMessage(validation.error);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setFilePreviewUrl(objectUrl);
    setSelectedFileName(file.name);
  }

  const developmentPreviewUrl = isValidImageUrl(developmentImageUrl)
    ? developmentImageUrl
    : "";
  const previewUrl = filePreviewUrl || developmentPreviewUrl || product?.imageUrl || "";

  return (
    <form action={formAction} className="stack-form form-card">
      <div className="form-grid two-columns">
        <div className="field field-wide">
          <span>상품 이미지</span>
          <div className="product-image-upload">
            <div className="product-image-upload-controls">
              {!product ? (
                <label className="field" htmlFor="product-image-file">
                  <span>이미지 파일 선택</span>
                  <input
                    id="product-image-file"
                    name="imageFile"
                    type="file"
                    accept={PRODUCT_IMAGE_ACCEPT}
                    required={!isDevelopment}
                    onChange={handleImageFileChange}
                  />
                  <small>JPEG, PNG, WebP 형식의 5MB 이하 이미지 한 장을 선택해 주세요.</small>
                  {selectedFileName && <small>선택한 파일: {selectedFileName}</small>}
                  {fileMessage && <small className="product-image-upload-error" role="alert">{fileMessage}</small>}
                </label>
              ) : (
                <p className="product-image-current-note">상품 수정 시에는 현재 등록된 이미지를 유지합니다.</p>
              )}

              {isDevelopment && (
                <details
                  className="development-image-url"
                  open={isDevelopmentUrlOpen}
                  onToggle={(event) => setIsDevelopmentUrlOpen(event.currentTarget.open)}
                >
                  <summary>개발용 이미지 URL 입력</summary>
                  <label className="field">
                    <span>상품 이미지 URL</span>
                    <input
                      name="imageUrl"
                      type="text"
                      value={developmentImageUrl}
                      placeholder="https://example.com/product.jpg"
                      required={Boolean(product)}
                      onChange={(event) => setDevelopmentImageUrl(event.target.value)}
                    />
                    <small>개발 환경에서만 사용할 수 있습니다.</small>
                  </label>
                </details>
              )}
            </div>

            <figure className="product-image-preview">
              <div className="product-image-preview-frame">
                <ProductImage
                  key={previewUrl || "default-product-image"}
                  src={previewUrl}
                  alt={`${product?.name ?? "등록할 상품"} 이미지 미리보기`}
                />
              </div>
              <figcaption>상품 카드와 같은 정사각형 비율로 표시됩니다.</figcaption>
            </figure>
          </div>
        </div>
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
