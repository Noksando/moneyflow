# Personal Finance Calendar

달력 중심으로 수입, 지출, 예정, 확정을 정리하는 개인용 재정 앱이다.

## Current Scope

- 큰 월간 달력 중심 UI
- 날짜별 `수입` / `지출` 분리 표시
- `확정`과 `예정` 금액을 다른 톤으로 표시
- 고정 수입 / 고정 지출 리스트
- `realize`로 열린 항목을 닫힌 항목으로 확정 반영
- Render persistent disk 기반 서버 저장과 기기 간 동기화
- PWA 기본 설정과 오프라인 셸 캐시

## Local Run

Node 서버만 있으면 된다.

1. 환경 변수를 설정한다.

```bash
cp .env.example .env
```

`.env` 예시:

```bash
DATA_FILE=./data/moneyflow.json
```

2. 의존성을 설치하고 서버를 시작한다.

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
5. `render.yaml`을 사용하면 Node 웹 서비스와 영구 디스크가 같이 만들어진다.

수동으로 만들 경우 Render 설정은 다음과 같다.

- Region: `Frankfurt`
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- Web Service Plan: `starter`
- Disk: `/var/data`, `1GB`
- Environment Variables:
  - `DATA_FILE` = `/var/data/moneyflow.json`

## Important Limitation

현재는 로그인 없이 바로 열리는 구조다. 그래서:

- URL을 아는 사람은 누구나 접근할 수 있다.
- 완전 개인용 비공개 툴로만 쓰는 게 맞다.
- 오프라인 셸은 남아 있지만, 새 데이터 저장은 서버 연결이 필요하다.

`sushibap-settlement-app`처럼 DB 대신 Render persistent disk에 JSON 파일로 저장한다. 그래서 Postgres를 따로 만들 필요가 없고, 구조가 더 단순하다.

다음 단계로는 항목 단위 API 분리, 계정 복구, 월별 백업/내보내기 기능을 붙이는 게 맞다.

## Git Setup

```bash
git add .
git commit -m "Add backend sync"
git push
```
