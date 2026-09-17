import { connection } from "next/server";
import { redirect } from "next/navigation";
import AuthForm from "@/app/(auth)/auth-form";
import { GiftIcon } from "@/components/icons";
import { getCurrentMember } from "@/lib/session";
import { sanitizeCallbackPath } from "@/lib/utils/format";

export const metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }) {
  await connection();
  const user = await getCurrentMember();

  if (user) {
    redirect("/");
  }

  const query = await searchParams;
  const callback = sanitizeCallbackPath(query.callback, "/");
  const memberRequired = query.notice === "member-required";

  return (
    <section className="auth-section">
      <div className="auth-card">
        <span className="auth-icon"><GiftIcon size={28} /></span>
        <p className="eyebrow">다시 만나 반가워요</p>
        <h1>로그인</h1>
        <p className="auth-description">위시리스트를 만들고 소중한 사람에게 마음을 전해 보세요.</p>
        {memberRequired && (
          <div className="demo-notice compact">
            <span>이 기능은 비밀번호로 로그인한 WishMate 회원만 이용할 수 있어요.</span>
          </div>
        )}
        <AuthForm mode="login" callback={callback} />
      </div>
    </section>
  );
}
