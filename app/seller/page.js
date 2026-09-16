import Link from "next/link";
import { connection } from "next/server";
import { ArrowIcon, GiftIcon } from "@/components/icons";
import ProductImage from "@/components/product-image";
import StatusBadge from "@/components/status-badge";
import { getSellerDashboard } from "@/lib/seller-dashboard";
import { requireUser } from "@/lib/session";
import { formatDate, formatWon, getOrderStatusLabel } from "@/lib/utils/format";
import { normalizeId } from "@/lib/utils/mongo";
import styles from "./seller-home.module.css";

export const metadata = { title: "판매 홈" };

function getStatusTone(status) {
  if (status === "delivered") return "success";
  if (status === "shipped") return "accent";
  if (status === "preparing") return "warm";
  return "neutral";
}

export default async function SellerHomePage() {
  await connection();
  const user = await requireUser("/seller");
  const dashboard = await getSellerDashboard(user.id);
  const summaryCards = [
    { label: "판매 중 상품", value: dashboard.counts.activeProducts, unit: "개", note: "등록 상품 현황" },
    { label: "품절 상품", value: dashboard.counts.soldOutProducts, unit: "개", note: "재고 확인 필요" },
    { label: "배송지 입력 대기", value: dashboard.counts.awaitingAddressOrders, unit: "건", note: "수령인 입력 대기" },
    { label: "상품 준비 중", value: dashboard.counts.preparingOrders, unit: "건", note: "배송 준비 필요" },
    { label: "배송 중", value: dashboard.counts.shippedOrders, unit: "건", note: "배송 진행 현황" },
  ];

  return (
    <section className={`container ${styles.home}`}>
      <Link href="/seller" className={styles.breadcrumb}>판매 홈 · /seller</Link>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">My Seller Home</p>
          <h1>{user.name}님의 판매 홈</h1>
          <p>내 상품과 주문 현황을 한눈에 확인하세요.</p>
        </div>
        <Link href="/products/new" className="button button-primary">+ 상품 등록</Link>
      </div>

      <div className={styles.summaries} aria-label="나의 판매 현황">
        {summaryCards.map((card) => (
          <article className={`${styles.summary} ${card.label === "상품 준비 중" ? styles.preparingSummary : ""}`} key={card.label}>
            <h2>{card.label}</h2>
            <p className={styles.summaryValue}><strong>{card.value}</strong><span>{card.unit}</span></p>
            <p className={styles.summaryNote}>{card.note}</p>
          </article>
        ))}
      </div>

      <div className={styles.board}>
        <section className={styles.panel} aria-labelledby="recent-orders-title">
          <div className={styles.panelHeading}>
            <h2 id="recent-orders-title">최근 주문</h2>
            <Link href="/seller/orders" className={styles.managementLink}>전체 주문 <ArrowIcon size={16} /></Link>
          </div>
          {dashboard.recentOrders.length > 0 ? (
            <table className={styles.orders}>
              <caption className="sr-only">최근 주문 최대 5건</caption>
              <thead><tr><th scope="col">주문 상품</th><th scope="col">주문 금액</th><th scope="col">배송 상태</th></tr></thead>
              <tbody>
                {dashboard.recentOrders.map((order) => (
                  <tr key={normalizeId(order._id)}>
                    <td><strong>{order.productSnapshot.name}</strong><small>{formatDate(order.createdAt)} · 주문 {normalizeId(order._id).slice(-8).toUpperCase()}</small></td>
                    <td className={styles.amount}>{formatWon(order.totalAmount)}</td>
                    <td className={styles.orderStatus}><StatusBadge tone={getStatusTone(order.status)}>{getOrderStatusLabel(order.status)}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.empty}>
              <GiftIcon size={32} />
              <h3>아직 들어온 주문이 없어요</h3>
              <p>선물 주문이 생기면 이곳에서 확인할 수 있어요.</p>
            </div>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="sold-out-title">
          <div className={styles.panelHeading}>
            <h2 id="sold-out-title">품절 상품</h2>
            <Link href="/seller/products" className={styles.managementLink}>상품 관리 <ArrowIcon size={16} /></Link>
          </div>
          {dashboard.soldOutProducts.length > 0 ? (
            <>
              <ul className={styles.stockList}>
                {dashboard.soldOutProducts.map((product) => {
                  const productId = normalizeId(product._id);
                  return (
                    <li className={styles.stockItem} key={productId}>
                      <ProductImage src={product.imageUrl ?? product.images?.[0]} alt={product.name} className={styles.stockImage} />
                      <div>
                        <h3>{product.name}</h3>
                        <p>품절 · 재고 {product.quantity}개</p>
                        <Link href={`/products/${productId}/edit`} className={styles.managementLink}>상품 수정 <ArrowIcon size={14} /></Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className={styles.stockNote}>상품 수정에서 재고를 변경할 수 있어요.</p>
            </>
          ) : dashboard.totalProducts === 0 ? (
            <div className={styles.empty}>
              <GiftIcon size={32} />
              <h3>첫 상품을 등록해 보세요</h3>
              <p>누군가의 위시리스트에 담길 선물을 소개해 주세요.</p>
              <Link href="/products/new" className="button button-primary">첫 상품 등록하기</Link>
            </div>
          ) : (
            <div className={styles.empty}>
              <GiftIcon size={32} />
              <h3>품절 상품이 없어요</h3>
              <p>등록한 상품과 재고는 상품 관리에서 확인할 수 있어요.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
