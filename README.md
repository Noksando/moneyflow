# Personal Finance Calendar

달력 중심으로 수입, 지출, 예정, 확정을 정리하는 개인용 재정 앱이다.

## Current Scope

- 큰 월간 달력 중심 UI
- 날짜별 `수입` / `지출` 분리 표시
- `확정`과 `예정` 금액을 다른 톤으로 표시
- 고정 수입 / 고정 지출 리스트
- `realize`로 열린 항목을 닫힌 항목으로 확정 반영
- `localStorage` 기반 저장
- PWA 기본 설정과 오프라인 셸 캐시

## Local Run

정적 파일이라 아무 정적 서버로 열면 된다.

예시:

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173` 접속.

## Render Deploy

이 저장소에는 [Render Blueprint](https://render.com/docs/blueprint-spec)용 `render.yaml`이 포함되어 있다.

1. GitHub에 새 저장소를 만든다.
2. 이 폴더를 새 저장소에 push 한다.
3. Render Dashboard에서 `New > Blueprint` 또는 `New > Static Site`를 선택한다.
4. GitHub 저장소를 연결한다.
5. `render.yaml`을 사용하면 `./scripts/build.sh`와 `./dist` 설정이 자동으로 잡힌다.

수동으로 만들 경우 Render 설정은 다음과 같다.

- Build Command: `./scripts/build.sh`
- Publish Directory: `./dist`

## Important Limitation

현재 데이터는 브라우저의 `localStorage`에 저장된다. 그래서:

- 컴퓨터가 꺼져 있어도 앱 접속은 가능하다.
- 하지만 아이폰과 맥북 사이에 데이터가 자동 동기화되지는 않는다.
- 같은 Render URL을 열어도 기기별 데이터는 각각 따로 저장된다.

다음 단계로는 Supabase 같은 백엔드를 붙여서 로그인과 동기화를 추가하는 게 맞다.

## Git Setup

```bash
git init -b main
git add .
git commit -m "Initial personal finance calendar"
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```
