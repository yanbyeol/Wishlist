const allowedSorts = new Set(["default", "newest", "price_asc", "price_desc"]);

function getSingleValue(query, name) {
  if (query instanceof URLSearchParams) {
    const values = query.getAll(name);
    return values.length === 1 ? values[0] : "";
  }

  return typeof query?.[name] === "string" ? query[name] : "";
}

export function getProductFilters(query) {
  const requestedSort = getSingleValue(query, "sort");
  const requestedPage = getSingleValue(query, "page");
  const page = /^[1-9]\d*$/.test(requestedPage) ? Number(requestedPage) : 1;

  return {
    category: getSingleValue(query, "category"),
    keyword: getSingleValue(query, "q").trim(),
    sort: allowedSorts.has(requestedSort) ? requestedSort : "default",
    excludeSoldOut: getSingleValue(query, "excludeSoldOut") === "1",
    page: Number.isSafeInteger(page) ? page : 1,
  };
}

export function getProductFilterPath({ category, keyword, sort, excludeSoldOut, page = 1 }) {
  const params = new URLSearchParams();

  if (category) params.set("category", category);
  if (keyword) params.set("q", keyword);
  if (sort !== "default") params.set("sort", sort);
  if (excludeSoldOut) params.set("excludeSoldOut", "1");
  if (Number.isSafeInteger(page) && page > 1) params.set("page", String(page));

  return params.size > 0 ? `/?${params}` : "/";
}
