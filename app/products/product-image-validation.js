export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

const supportedImageTypes = {
  "image/jpeg": { contentType: "image/jpeg", extension: "jpg" },
  "image/png": { contentType: "image/png", extension: "png" },
  "image/webp": { contentType: "image/webp", extension: "webp" },
};

function startsWithBytes(bytes, signature) {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function detectProductImageType(bytes) {
  if (bytes.length >= 3 && startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return supportedImageTypes["image/jpeg"];
  }

  if (
    bytes.length >= 8 &&
    startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return supportedImageTypes["image/png"];
  }

  const isWebp =
    bytes.length >= 12 &&
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  return isWebp ? supportedImageTypes["image/webp"] : null;
}

export function validateProductImageMetadata({ size, type }) {
  if (!Number.isFinite(size) || size <= 0) {
    return { error: "내용이 있는 상품 이미지를 선택해 주세요." };
  }

  if (size > MAX_PRODUCT_IMAGE_BYTES) {
    return { error: "상품 이미지는 5MB 이하로 선택해 주세요." };
  }

  if (!supportedImageTypes[type]) {
    return { error: "JPEG, PNG 또는 WebP 이미지 파일을 선택해 주세요." };
  }

  return { imageType: supportedImageTypes[type] };
}

export function validateProductImageSignature(bytes, declaredContentType) {
  const detectedType = detectProductImageType(bytes);

  if (!detectedType || detectedType.contentType !== declaredContentType) {
    return { error: "파일의 실제 이미지 형식이 올바르지 않습니다." };
  }

  return { imageType: detectedType };
}

function isUploadedFile(value) {
  return (
    Object.prototype.toString.call(value) === "[object File]" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.size === "number" &&
    typeof value.slice === "function" &&
    typeof value.stream === "function"
  );
}

export function hasSelectedProductImage(value) {
  return isUploadedFile(value) && value.size > 0;
}

export async function validateProductImageFile(file) {
  if (!isUploadedFile(file)) {
    return { error: "상품 이미지를 선택해 주세요." };
  }

  const metadataResult = validateProductImageMetadata(file);

  if (metadataResult.error) {
    return metadataResult;
  }

  try {
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    return validateProductImageSignature(signature, file.type);
  } catch {
    return { error: "상품 이미지 파일을 읽을 수 없습니다." };
  }
}
