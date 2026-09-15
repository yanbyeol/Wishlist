import { connection } from "next/server";
import { redirect } from "next/navigation";
import AuthForm from "@/app/(auth)/auth-form";
import { GiftIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/session";
import { sanitizeCallbackPath } from "@/lib/utils/format";

export const metadata = { title: "회원가입" };

export default async function SignupPage({ searchParams }) {
  await connection();
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  const query = await searchParams;
  const callback = sanitizeCallbackPath(query.callback, "/");

  return (
    <section className="auth-section">
      <div className="auth-card">
        <span className="auth-icon"><GiftIcon size={28} /></span>
        <p className="eyebrow">위시메이트를 시작해요</p>
        <h1>회원가입</h1>
        <p className="auth-description">하나의 계정으로 상품 등록부터 함께 선물하기까지 시작하세요.</p>
        <AuthForm mode="signup" callback={callback} />
      </div>
    </section>
  );
}
