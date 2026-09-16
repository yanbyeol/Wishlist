import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  detectProductImageType,
  hasSelectedProductImage,
  validateProductImageMetadata,
  validateProductImageSignature,
} from "../app/products/product-image-validation.js";

const jpegSignature = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const pngSignature = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const webpSignature = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
]);

function createFileValue(size) {
  return {
    [Symbol.toStringTag]: "File",
    name: size > 0 ? "product.jpg" : "",
    size,
    type: "image/jpeg",
    slice() {},
    stream() {},
  };
}

test("JPEG, PNG, WebP 파일 시그니처를 구분한다", () => {
  assert.deepEqual(detectProductImageType(jpegSignature), {
    contentType: "image/jpeg",
    extension: "jpg",
  });
  assert.deepEqual(detectProductImageType(pngSignature), {
    contentType: "image/png",
    extension: "png",
  });
  assert.deepEqual(detectProductImageType(webpSignature), {
    contentType: "image/webp",
    extension: "webp",
  });
  assert.equal(detectProductImageType(new TextEncoder().encode("<svg>")), null);
});

test("상품 이미지의 크기와 MIME 유형을 검증한다", () => {
  assert.ok(validateProductImageMetadata({ size: 1, type: "image/jpeg" }).imageType);
  assert.match(
    validateProductImageMetadata({ size: 0, type: "image/jpeg" }).error,
    /내용이 있는/,
  );
  assert.match(
    validateProductImageMetadata({
      size: MAX_PRODUCT_IMAGE_BYTES + 1,
      type: "image/jpeg",
    }).error,
    /5MB 이하/,
  );
  assert.match(
    validateProductImageMetadata({ size: 100, type: "image/svg+xml" }).error,
    /JPEG, PNG 또는 WebP/,
  );
});

test("빈 파일 입력은 사용자가 선택한 상품 이미지로 보지 않는다", () => {
  assert.equal(hasSelectedProductImage(createFileValue(0)), false);
  assert.equal(hasSelectedProductImage(createFileValue(100)), true);
});

test("선언한 MIME 유형과 실제 파일 시그니처가 일치해야 한다", () => {
  assert.ok(
    validateProductImageSignature(pngSignature, "image/png").imageType,
  );
  assert.match(
    validateProductImageSignature(pngSignature, "image/jpeg").error,
    /실제 이미지 형식/,
  );
});
