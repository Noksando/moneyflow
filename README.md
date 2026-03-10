# Personal Finance Calendar

달력 중심으로 수입, 지출, 예정, 확정을 정리하는 개인용 재정 앱이다.

## Current Scope

- 큰 월간 달력 중심 UI
- 날짜별 `수입` / `지출` 분리 표시
- `확정`과 `예정` 금액을 다른 톤으로 표시
- 고정 수입 / 고정 지출 리스트
- `realize`로 열린 항목을 닫힌 항목으로 확정 반영
- 단일 사용자 비밀번호 로그인
- Postgres 기반 서버 저장과 기기 간 동기화
- PWA 기본 설정과 오프라인 셸 캐시

## Local Run

Node 서버와 Postgres가 필요하다.

1. Postgres를 준비한다.
2. 환경 변수를 설정한다.

```bash
cp .env.example .env
```

`.env` 예시:

```bash
DATABASE_URL=postgres://localhost:5432/moneyflow
APP_PASSWORD=your-password
JWT_SECRET=replace-this-secret
```

3. 의존성을 설치하고 서버를 시작한다.

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속.

## Render Deploy

이 저장소에는 [Render Blueprint](https://render.com/docs/blueprint-spec)용 `render.yaml`이 포함되어 있다.

1. GitHub에 새 저장소를 만든다.
2. 이 폴더를 새 저장소에 push 한다.
3. Render Dashboard에서 `New > Blueprint`를 선택한다.
4. GitHub 저장소를 연결한다.
5. `render.yaml`을 사용하면 Node 웹 서비스와 Postgres 데이터베이스가 같이 만들어진다.
6. `APP_PASSWORD` 값을 Render 환경 변수 화면에서 직접 입력한다.

수동으로 만들 경우 Render 설정은 다음과 같다.

- Region: `Frankfurt`
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Web Service Plan: `starter`
- Postgres Plan: `basic-256mb`
- Postgres: 같은 리전의 새 데이터베이스 생성
- Environment Variables:
  - `DATABASE_URL` = 생성한 Postgres connection string
  - `APP_PASSWORD` = 네가 쓸 비밀번호
  - `JWT_SECRET` = 랜덤 긴 문자열

## Important Limitation

현재는 `단일 사용자 비밀번호` 구조다. 그래서:

- 네 개인용으로는 충분하지만 여러 사용자 계정 구조는 아니다.
- 비밀번호를 잊으면 별도 복구 기능은 없다.
- 오프라인 셸은 남아 있지만, 새 데이터 저장은 서버 연결이 필요하다.

Render 무료 플랜은 이 앱에 기본값으로 쓰지 않게 해뒀다. 공식 문서 기준으로 무료 웹 서비스는 15분 유휴 시 spin-down 되고, 무료 Postgres는 생성 후 30일 뒤 만료된다. 그래서 `render.yaml`은 `starter` 웹 서비스와 `basic-256mb` Postgres를 기본으로 잡아뒀다.

다음 단계로는 항목 단위 API 분리, 계정 복구, 월별 백업/내보내기 기능을 붙이는 게 맞다.

## Git Setup

```bash
git add .
git commit -m "Add backend sync"
git push
```
