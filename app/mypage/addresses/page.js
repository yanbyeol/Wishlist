import Link from "next/link";
import { connection } from "next/server";
import AddressForm from "@/app/mypage/addresses/address-form";
import {
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/app/mypage/addresses/actions";
import StatusBadge from "@/components/status-badge";
import { listAddresses } from "@/lib/addresses";
import { requireMember } from "@/lib/session";

export const metadata = { title: "배송지 관리" };

const notices = {
  created: "배송지를 저장했습니다.",
  updated: "배송지를 수정했습니다.",
  deleted: "배송지를 삭제했습니다.",
  default: "기본 배송지를 변경했습니다.",
  "not-found": "배송지를 찾을 수 없습니다.",
};

export default async function AddressesPage({ searchParams }) {
  await connection();
  const user = await requireMember("/mypage/addresses");
  const [addresses, query] = await Promise.all([listAddresses(user.id), searchParams]);
  const notice = typeof query.notice === "string" ? notices[query.notice] : "";
  const editId = typeof query.edit === "string" ? query.edit : "";
  const editingAddress = addresses.find((address) => address.id === editId) ?? null;

  return (
    <section className="container page-section management-grid">
      <div>
        <div className="page-heading compact-heading">
          <p className="eyebrow">마이페이지</p>
          <h1>배송지 관리</h1>
          <p>선물을 수락할 때 기본 배송지를 자동으로 불러옵니다.</p>
        </div>
        {notice && <p className="notice-banner">{notice}</p>}
        <div className="address-list">
          {addresses.length > 0 ? addresses.map((address) => (
            <article className="address-card" key={address.id}>
              <div className="address-card-heading">
                <h2>{address.label}</h2>
                {address.isDefault && <StatusBadge tone="success">기본 배송지</StatusBadge>}
              </div>
              <strong>{address.recipientName}</strong>
              <p>{address.phone}</p>
              <p>({address.postalCode}) {address.address1} {address.address2}</p>
              <div className="inline-actions">
                <Link href={`/mypage/addresses?edit=${address.id}`} className="text-button">수정</Link>
                {!address.isDefault && (
                  <form action={setDefaultAddressAction}>
                    <input type="hidden" name="addressId" value={address.id} />
                    <button className="text-button" type="submit">기본 배송지로 설정</button>
                  </form>
                )}
                <form action={deleteAddressAction}>
                  <input type="hidden" name="addressId" value={address.id} />
                  <button className="text-button danger-text" type="submit">삭제</button>
                </form>
              </div>
            </article>
          )) : <p className="inline-empty">저장한 배송지가 없습니다.</p>}
        </div>
      </div>
      <aside>
        <h2 className="aside-title">{editingAddress ? "배송지 수정" : "새 배송지 추가"}</h2>
        <AddressForm
          key={editingAddress?.id ?? "new-address"}
          userName={user.name}
          address={editingAddress}
        />
      </aside>
    </section>
  );
}
