<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 프로젝트 제약사항

### 작업 원칙

- 범위 외 변경·새 의존성: 이유와 범위 보고 후 승인
- 작업 단위: 완료·검증 후 항상 git commit / push
- 코드 작성: 초급자도 이해할 수 있게 명시적으로 작성, 과도한 축약과 불필요한 추상화·계층·라이브러리 금지
- 지시형 주석: 작업 지침으로 해석해 최대한 반영

### 파일 구조

- 전용 함수·컴포넌트: 해당 파일 또는 같은 route·기능 디렉토리에 배치
- 긴 파일: 역할이 드러나는 이름의 파일로 분리
- `/components`: 여러 page·기능에서 재사용하는 UI만 배치
- `/lib/utils/`: 여러 위치에서 재사용하는 순수 Utility만 역할별 배치

### 컴포넌트와 UI

- React Hook: `useState`, `useEffect`, `useRef`, `useActionState` 기본, 그 외 Hook은 이유·대안 보고 및 승인 후 사용
- Client Component: 브라우저 이벤트·로컬 상태·즉각적 UI 반응이 필요한 최소 영역만 분리
- SimpleDotCss 상태로 layout 구성을 위한 최소한의 CSS만 사용
- Layout: `layout.js`에 해당 route 구조 직접 작성
- Layout 금지 사항: 외부 주입·불필요한 추상화·복잡한 합성·빈 컴포넌트

### 렌더링과 데이터 흐름

- `page.js` 기본 export: `async` Server Component
- 요청 시점 렌더링: 컴포넌트 시작 부분에서 `await connection()` 호출
- 서버 처리: DB 조회·인증·초기 데이터 준비·UI 렌더링
- 코드 흐름: page 또는 action → lib → DB
- Route Handler API: 외부 클라이언트·웹훅 등 실제 필요 시에만 구현
- 사용 금지: SSG·ISR·PPR·복잡한 캐시·직접 구성한 Streaming
- 로딩 UI: 단순한 route 단위 `loading.js` 허용

### 입력과 URL

- Server Action 폼: Server Component의 `<form action={serverAction}>` 기본
- 입력·데이터 변경: `<form>`과 Server Action 중심
- Server Action 검증: 세션·권한·입력값 재검증
- URL 경로 값: `params` 사용
- 검색·필터·페이지 이동: Query String과 `searchParams` 사용, 로컬 state 중복 관리 금지
- DB 조회 조건 변경: URL의 `params` 또는 `searchParams`로 전달하여 Server Component부터 다시 실행

### 인증과 DB

- 로그인·인증: Better Auth 사용
- 개발용 DB 초기화·초기 데이터: `/scripts/seeds.js`에서만 관리
- MongoDB 조회: 컴포넌트 간 Props를 필수 항목으로 제한하고, 데이터를 사용하는 Server Component에서 직접 조회
- `ObjectId()`를 Foreign Key로 사용: DB에 String으로 저장. Better Auth 관리 콜렉션 제외
- DB.find() 후 데이터를 최대한 .map() 재정의 없이 그대로 전달

### 검증

- 완료 검증: 기본 단위 테스트와 lint 실행
- 주요 기능: 브라우저 또는 API 요청으로 직접 확인

### 부분 갱신 필터 예외

아래 대상 필터의 반복 조회에는 기존 “DB 조회 조건 변경 시 Server Component 재실행” 규칙 대신 본 예외를 적용한다.

- `/seller/orders`의 주문 상태 필터, `/seller/products`의 상품 상태 필터, `/`의 상품 정렬·품절상품 제외·키워드 검색에만 적용한다. 다른 화면·필터는 기존 규칙을 따른다.
- 최초 접속·새로고침은 async Server Component에서 `await connection()` 후 URL 기준으로 조회한다. 반복 조회는 Server Component 재실행 없이 Server Action과 최소 Client Component로 결과 영역만 갱신할 수 있다.
- 필터는 URL을 단일 기준으로 관리하며 로컬 state로 중복 관리하지 않는다. 페이지 이동 없이 주소를 갱신하고, 새로고침·뒤로·앞으로 가기에 선택값과 결과를 동기화한다.
- 조회 중 기존 화면·목록·스크롤을 유지하고 해당 영역에만 진행 상태를 표시한다. 실패 시 기존 목록을 유지하며 오래된 응답의 덮어쓰기를 방지한다.
- `page/action → lib → DB`와 서버 입력 검증을 유지한다. 판매자 주문과 판매자 상품은 로그인한 `user.id`로 제한하고 상품 둘러보기는 비로그인 조회를 허용한다.
- 필터 갱신용 `redirect`·`refresh`·`revalidatePath`는 금지한다. 인증 차단과 주문 상태 저장·상품 삭제 등 기존 데이터 변경 액션은 기존 규칙을 따른다.
- 기본 선택·마지막 체크 해제 방지·주문 상태 저장 후 필터 유지·검색·카테고리·위시리스트 등 기존 동작과 나머지 제약사항을 유지한다.
- 판매자 상품은 상세 화면 왕복·새로고침·뒤로·앞으로 가기에 URL 선택값과 목록을 동기화하고, 상품 삭제 후에도 선택한 상태 필터를 유지한다.
