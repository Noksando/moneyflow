# Moneyflow

달력 중심으로 수입, 지출, 예정, 확정을 정리하는 개인용 재정 앱이다.

## Current Scope

- 큰 월간 달력 중심 UI
- 날짜별 `수입` / `지출` 분리 표시
- `확정`과 `예정` 금액을 다른 톤으로 표시
- 고정 수입 / 고정 지출 리스트
- `realize`로 열린 항목을 닫힌 항목으로 확정 반영
- Supabase Auth 기반 로그인
- Supabase Postgres 기반 기기 간 동기화
- PWA 기본 설정과 오프라인 셸 캐시

## Supabase Setup

1. Supabase에서 새 프로젝트를 만든다.
2. `Authentication > Providers > Email`이 켜져 있는지 확인한다.
3. `SQL Editor`에서 [supabase-schema.sql](/Users/baek/Documents/personal_finance/supabase-schema.sql) 내용을 실행한다.
4. `Project Settings > API`에서 `Project URL`과 `anon public key`를 복사한다.
5. 루트에 `config.js`를 만들고 [config.example.js](/Users/baek/Documents/personal_finance/config.example.js)를 복사한 뒤 값만 채운다.

예시:

```js
window.MONEYFLOW_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

`anon` 키는 브라우저 앱에서 공개돼도 되는 키다. 대신 [supabase-schema.sql](/Users/baek/Documents/personal_finance/supabase-schema.sql)의 RLS 정책이 실제 보호를 담당한다.

## Local Run

```bash
npm install
npm run build
```

그 다음 정적 서버로 `dist`를 열면 된다.

예시:

```bash
python3 -m http.server 4173 -d dist
```

브라우저에서 `http://localhost:4173` 접속.

## Render Deploy

이 저장소에는 [Render Blueprint spec](https://render.com/docs/blueprint-spec)와 [Static Sites docs](https://render.com/docs/static-sites) 기준의 [render.yaml](/Users/baek/Documents/personal_finance/render.yaml)이 포함되어 있다.

1. GitHub 저장소를 Render에 연결한다.
2. `New > Blueprint` 또는 `New > Static Site`를 선택한다.
3. Build Command는 `npm install && npm run build`
4. Publish Directory는 `dist`
5. Build 환경변수에 아래 둘 중 하나를 넣는다.

- 방법 A: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- 방법 B: `config.js`를 저장소에 커밋

정적 사이트는 별도 DB 비용이 없고, 데이터 저장은 Supabase Free로 간다.

## Login Flow

- 첫 사용자 계정은 앱에서 `회원가입` 버튼으로 직접 만들 수 있다.
- 이후에는 같은 이메일과 비밀번호로 로그인한다.
- 데이터는 로그인한 사용자별로 분리 저장된다.

## Important Notes

- Supabase `anon` 키는 공개 키라서 프론트에 들어가도 된다.
- 실제 접근 제어는 RLS 정책으로 막는다.
- 같은 계정으로 로그인하면 아이폰과 컴퓨터에서 같은 데이터가 보인다.
- 무료 플랜 정책은 바뀔 수 있으니, 장기 운영 전에는 Supabase 현재 정책을 다시 확인하는 게 맞다.
