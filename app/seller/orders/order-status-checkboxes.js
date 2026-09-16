"use client";

import { ORDER_STATUS_OPTIONS } from "@/lib/constants";
import { getSellerOrdersReturnPath } from "@/lib/seller-order-filter";
import styles from "../seller-filter.module.css";

export default function OrderStatusCheckboxes({ selectedStatuses }) {
  function changeStatusFilter(event) {
    const form = event.currentTarget.form;
    // 마지막 체크를 해제하면 URL의 선택값을 그대로 유지합니다.
    if (!form.querySelector('input[name="status"]:checked')) return;
    const statuses = new FormData(form).getAll("status");
    const path = getSellerOrdersReturnPath(statuses);
    window.history.pushState(null, "", `${path}${window.location.hash}`);
    form.requestSubmit();
  }

  return (
    <fieldset className={styles.statuses} aria-describedby="order-filter-help">
      <legend>주문 상태</legend>
      {ORDER_STATUS_OPTIONS.map((option) => (
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
