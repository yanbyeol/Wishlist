import { sanitizeCallbackPath } from "@/lib/utils/format";

const sharedWishlistPathPattern = /^\/shared\/[A-Za-z0-9_-]+$/;

export function getSharedWishlistReturnPath(value) {
  const path = sanitizeCallbackPath(value, "");
  return sharedWishlistPathPattern.test(path) ? path : "";
}

export function getGroupGiftPath(groupGiftId, returnTo = "") {
  const path = `/group-gifts/${encodeURIComponent(String(groupGiftId))}`;
  const sharedWishlistPath = getSharedWishlistReturnPath(returnTo);

  if (!sharedWishlistPath) {
    return path;
  }

  return `${path}?returnTo=${encodeURIComponent(sharedWishlistPath)}`;
}
