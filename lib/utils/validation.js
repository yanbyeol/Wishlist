export function parsePositiveInteger(value) {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  const number = Number(normalized);

  if (!Number.isSafeInteger(number) || number <= 0) {
    return null;
  }

  return number;
}

export function parseNonNegativeInteger(value) {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  const number = Number(normalized);

  if (!Number.isSafeInteger(number) || number < 0) {
    return null;
  }

  return number;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? "").trim());
}

export function isValidOtpCode(value) {
  return /^\d{6}$/.test(String(value ?? "").trim());
}

export function isValidImageUrl(value) {
  const imageUrl = String(value ?? "").trim();

  if (imageUrl.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(imageUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseAddressFormData(formData, { includeLabel = false } = {}) {
  const fields = {
    ...(includeLabel
      ? {
        label: String(formData.get("label") ?? "").trim(),
        isDefault: formData.get("isDefault") === "on",
      }
      : {}),
    recipientName: String(formData.get("recipientName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    postalCode: String(formData.get("postalCode") ?? "").trim(),
    address1: String(formData.get("address1") ?? "").trim(),
    address2: String(formData.get("address2") ?? "").trim(),
  };

  if (includeLabel && (fields.label.length < 1 || fields.label.length > 20)) {
    return { fields, error: "배송지 이름은 1자 이상 20자 이하로 입력해 주세요." };
  }

  if (fields.recipientName.length < 2 || fields.recipientName.length > 30) {
    return { fields, error: "받는 분 이름은 2자 이상 30자 이하로 입력해 주세요." };
  }

  if (!/^[0-9+() -]{8,20}$/.test(fields.phone)) {
    return { fields, error: "연락처를 숫자와 하이픈을 사용해 입력해 주세요." };
  }

  if (!/^[0-9A-Za-z -]{3,10}$/.test(fields.postalCode)) {
    return { fields, error: "우편번호를 확인해 주세요." };
  }

  if (fields.address1.length < 4 || fields.address1.length > 100) {
    return { fields, error: "기본 주소는 4자 이상 100자 이하로 입력해 주세요." };
  }

  if (fields.address2.length > 100) {
    return { fields, error: "상세 주소는 100자 이하로 입력해 주세요." };
  }

  return { fields };
}
