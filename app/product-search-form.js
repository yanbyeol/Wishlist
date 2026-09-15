"use client";

import Link from "next/link";
import { useRef, useState } from "react";

export default function ProductSearchForm({ category, keyword }) {
  const [query, setQuery] = useState(keyword);
  const searchLinkRef = useRef(null);
  const params = new URLSearchParams();

  if (category) params.set("category", category);
  if (query.trim()) params.set("q", query.trim());

  const href = params.size > 0 ? `/?${params}` : "/";

  function submitSearch(event) {
    event.preventDefault();
    searchLinkRef.current?.click();
  }

  return (
    <form className="search-form" onSubmit={submitSearch}>
      <label>
        <span className="sr-only">상품 검색</span>
        <input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="어떤 선물을 찾으세요?"
        />
      </label>
      <button className="button button-dark" type="submit">검색</button>
      <Link
        ref={searchLinkRef}
        href={href}
        scroll={false}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        검색 적용
      </Link>
    </form>
  );
}
