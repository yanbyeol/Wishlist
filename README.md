# WishMate (위시메이트)

WishMate는 원하는 상품을 위시리스트에 담아 공유하고, 혼자 또는 여러 명이 함께 선물할 수 있는 선물 기반 쇼핑몰 MVP입니다. 상세 요구사항과 화면 흐름은 [`docs/README.md`](docs/README.md)에 정리되어 있습니다.

## 구현 기능

- 이메일 회원가입·로그인과 세션 기반 접근 제어
- 상품 조회, 카테고리 필터, 등록, 수정, 삭제 또는 판매 종료 처리
- 개인 위시리스트 추가·해제와 공개 링크 공유
- 나에게 선물하기와 다른 회원에게 혼자 선물하기
- 함께 선물하기 개설, Better Auth 이메일 OTP 간편 로그인·참여, 달성률과 참여 내역 표시
- 목업 결제 후 축하 카드 생성과 선물 수락 링크 발급
- 저장 배송지 관리, 기본 배송지 자동 입력, 선물 수락 후 배송 요청
- 마이페이지의 받은 선물·판매 상품·주문 현황과 판매자 배송 상태 관리

결제, 축하 카드 생성, 배송 추적은 개발용 목업입니다. 실제 결제·AI·배송 업체에는 연결하지 않습니다.

## 기술 구성

- Next.js 16 App Router, React 19
- MongoDB
- Better Auth 이메일·비밀번호 및 이메일 OTP 인증
- ESLint, Node.js Test Runner

Node.js 20.9 이상과 실행 중인 MongoDB가 필요합니다.

## 로컬 실행

1. 패키지를 설치합니다.

   ```bash
   npm install
   ```

2. 프로젝트 루트에 `.env.local`을 만듭니다.

   ```dotenv
   MONGODB_URI=mongodb://127.0.0.1:27017
   MONGODB_DB=wishlist
   MONGODB_TRANSACTIONS=false
   BETTER_AUTH_SECRET=개발용으로-충분히-긴-임의의-문자열
   BETTER_AUTH_URL=http://localhost:3000
   GIFT_CARD_PROVIDER=mock
   EMAIL_OTP_PROVIDER=mock
   ```

3. 개발용 데이터를 넣고 서버를 실행합니다.

   ```bash
   node scripts/seeds.js
   npm run dev
   ```

4. 브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

로컬의 단독 MongoDB에서는 `MONGODB_TRANSACTIONS=false`를 사용합니다. replica set 또는 mongos로 운영할 때만 `true`로 변경하세요.

로컬 개발에서는 `EMAIL_OTP_PROVIDER=mock`을 사용하며 화면에 개발용 인증번호가 표시됩니다. 실제 이메일을 발송하려면 아래처럼 Resend 설정을 추가합니다. 운영 환경에서는 `mock` 제공자를 사용할 수 없습니다.

```dotenv
EMAIL_OTP_PROVIDER=resend
RESEND_API_KEY=re_...
EMAIL_OTP_FROM=WishMate <gift@example.com>
```

OTP 인증 데이터는 Better Auth가 `BETTER_AUTH_SECRET`으로 암호화해 저장합니다. 발신 주소는 Resend에서 인증된 도메인을 사용해야 합니다. 기존 `GROUP_GIFT_OTP_PROVIDER`, `GROUP_GIFT_OTP_FROM` 설정도 호환됩니다.

시드 계정은 `minji@example.com`, `junho@example.com`, `seoyeon@example.com`, `doyun@example.com`이며 비밀번호는 모두 `12345678`입니다. 시드 스크립트는 production 환경에서 실행되지 않습니다. 기존 개발 데이터를 지우고 다시 생성하려면 `node scripts/seeds.js --reset`을 실행합니다.

## 검증 명령

```bash
npm test
npm run lint
node scripts/seeds.js --dry-run
npm run build
```

`--dry-run`은 MongoDB에 연결하거나 데이터를 쓰지 않고 참조 관계와 금액 합계를 검사합니다.
