export function getModeFromPath(pathname) {
  const isSellerPath =
    pathname === "/seller" ||
    pathname.startsWith("/seller/") ||
    pathname === "/products/new" ||
    pathname === "/products/new/" ||
    /^\/products\/[^/]+\/edit\/?$/.test(pathname);

  return isSellerPath ? "seller" : "user";
}
