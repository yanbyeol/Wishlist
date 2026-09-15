"use client";

import { useState } from "react";
import { GiftIcon } from "@/components/icons";

export default function ProductImage({ src, alt, className = "" }) {
  const [hasImage, setHasImage] = useState(Boolean(src));

  if (!hasImage) {
    return (
      <div className={`product-image-fallback ${className}`} role="img" aria-label={`${alt} 기본 이미지`}>
        <GiftIcon size={42} />
        <span>WishMate</span>
      </div>
    );
  }

  return (
    // 상품 등록 시 외부 URL도 받을 수 있어 최적화 프록시 대신 원본 이미지를 사용한다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`product-image ${className}`}
      src={src}
      alt={alt}
      onError={() => setHasImage(false)}
    />
  );
}
