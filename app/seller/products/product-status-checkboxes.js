"use client";

import { SELLER_PRODUCT_STATUS_OPTIONS } from "@/lib/constants";
import { getSellerProductsReturnPath } from "@/lib/seller-product-filter";
import styles from "../seller-filter.module.css";

export default function ProductStatusCheckboxes({ selectedStatuses }) {
  function changeStatusFilter(event) {
    const form = event.currentTarget.form;
    // 마지막 체크를 해제하면 URL의 선택값을 그대로 유지합니다.
    if (!form.querySelector('input[name="status"]:checked')) return;
    const statuses = new FormData(form).getAll("status");
    const path = getSellerProductsReturnPath(statuses);
    window.history.pushState(null, "", `${path}${window.location.hash}`);
    form.requestSubmit();
  }

  return (
    <fieldset className={styles.statuses} aria-describedby="product-filter-help">
      <legend>상품 상태</legend>
      {SELLER_PRODUCT_STATUS_OPTIONS.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            name="status"
            value={option.value}
            checked={selectedStatuses.includes(option.value)}
            onChange={changeStatusFilter}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
