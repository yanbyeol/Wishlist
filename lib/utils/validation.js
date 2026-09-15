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
