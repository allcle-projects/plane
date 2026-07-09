# 09 — 세션 핸드오프 (2026-07-09): 유료기능 자체구현 완주

> 대상: `plane.motemote.co.kr` (CE v1.3.1 fork, branch `mote`, allcle-projects/plane).
> 이 문서는 2026-07-08~09 연속 세션에서 완료한 작업의 핸드오프. 구현상태 정본은 [`08-implementation-status.md`](./08-implementation-status.md).

## 🎉 결과: 로드맵 핵심 유료기능 전량 자체구현 완료

Plane 유료(EE) 기능을 CE 포크 내부 구현(`ee/` 없이 `ce/**` alias + 백엔드 net-new)으로 자체 구현. **XL 4종(Custom Fields · Initiatives · Teamspaces · Custom RBAC) 포함 전 핵심기능 완결.** 문서 02·03·04·05·06 완료.

## 현재 배포 (server3 `/srv/shared/stack/plane-server3/compose.override.yml`)

| 서비스 | 태그 |
|---|---|
| web (frontend) | `v1.3.1-mote.40` |
| api/worker/beat-worker/migrator (backend) | `v1.3.1-mote.40` |
| space | `v1.3.1-space.2` |
| admin | `v1.3.1-mote.8` |
| live | `v1.3.1-mote.7` |
| proxy | `v1.3.1-mote.1` |

전 컨테이너 healthy. 마이그레이션 head = **0144_teamspace_public** (mote.40 은 모델 변경 없음 — head 불변).

### 후속 라운드 (mote.37 / mote.38)

핵심 유료기능 완주 후 otro 요청으로 추가 진행:

| 작업 | 릴리스 | 검증 |
|---|---|---|
| 알림함 미발화 버그 fix (`UserNotificationPreference.get()`→`get_or_create`, 배치 전체 소실 방지) | mote.37 | 재현(+0)→fix(+1) |
| Custom RBAC 게이트 실적용 (issue create/update/delete·state manage → additive resolver) | mote.37 | e2e 7/7 + 라이브 무회귀 5/5 |
| Teamspaces P3 (팀뷰·팀페이지: team FK on IssueView/Page, 마이그 0143, 팀상세 Views/Pages 섹션) | mote.38 | e2e 9/9 + 브라우저 |
| CSV Importer (import-csv 엔드포인트 + work-items 헤더 Import 모달) | mote.38 | e2e 6/6 + 브라우저 |
| Slack 아웃바운드 전송 (slack_task → webhook, 자체완결·no task-bot; FE Integrations nav 등록) | mote.39 | e2e + 브라우저 |
| Notion/Jira Importer (CSV alias + 벤더 우선순위 정규화) | mote.39 | e2e(Jira CSV) |
| Teamspaces P4 (Team.is_public 0144 + anon PublicTeamspaceEndpoint; 팀상세 Public/Private 토글) | mote.39 | e2e + 브라우저 |
| Custom RBAC Page/Project 게이트 (class-level permission_classes → additive resolver) | mote.39 | e2e 3/3 + 라이브 무회귀 |
| Slack 아웃바운드 실웹훅 검증 + 코멘트 HTML→plain strip | mote.40 | 실 webhook 캡처(실 worker POST) + HTML strip |
| Slack 인바운드 (`/api/slack/intake/<slug>/<project_id>/`: 슬래시커맨드/워크플로우 → work item, 서명/토큰 인증) | mote.40 | e2e 6/6 + 라이브(공개 프록시 POST→이슈생성, 잘못된토큰 401) |

### Slack 설정 방법 (운영자용)

**아웃바운드 (Plane → Slack).** 프로젝트 설정 → **Integrations** → Slack channel 에 Slack incoming-webhook URL 붙여넣기. 이후 그 프로젝트의 이슈 코멘트/상태변경 등이 해당 Slack 채널로 자동 전송됨(외부 task-bot 불필요). webhook 미설정 프로젝트는 no-op. 코멘트 스니펫은 plain-text 로 정규화되어 전송(Slack HTML 미렌더).

**인바운드 (Slack → Plane 태스크).** 프로젝트 설정 → **Integrations** → "Slack → work item (inbound)" 섹션의 intake URL(`https://plane.motemote.co.kr/api/slack/intake/<slug>/<project_id>/`)을 복사. 이 URL 을 Slack 슬래시커맨드(예: `/plane-task <제목>`) 의 Request URL 또는 Slack Workflow-Builder 웹훅 스텝에 붙이면, 슬랙에서 건의한 내용이 그 프로젝트의 work item 으로 생성됨. 제목=명령 텍스트 1행, 나머지 본문·제출자(#채널·유저)는 설명에 attribution 으로 기록.
- **인증**: 서버 env 에 `SLACK_SIGNING_SECRET`(진짜 Slack 앱 서명검증) 또는 `SLACK_INTAKE_TOKEN`(Workflow-Builder 용 공유토큰) 중 하나 필요. 둘 다 없으면 엔드포인트가 거부(open-by-accident 방지). 현재 server3 `plane.env` 에 `SLACK_INTAKE_TOKEN` 프로비저닝됨(48-hex). Slack 앱을 만들면 `SLACK_SIGNING_SECRET` 를 plane.env 에 추가하고 api/worker recreate.
- ⚠️ env 는 `docker-compose.yml` 의 `x-app-env: &app-env` 앵커에 키를 등록해야 컨테이너로 전달됨(이 스택은 `env_file` 이 아니라 명시적 environment 매핑). mote.40 에서 `SLACK_SIGNING_SECRET`·`SLACK_INTAKE_TOKEN` 두 키 추가함.

**인바운드 실사용 확정 = otro-bot `/otro plane <제목>`** (별도 Slack 앱·공개 URL 불필요). otrotask(otro-bot)는 이미 Socket Mode `slack_bolt` 앱이라, task-bot(`project/orchestration/plane_intake.py` + `/otro` 핸들러 `plane` 분기)이 위 intake 엔드포인트를 공유토큰으로 호출해 **'건의함'(IDEA) 프로젝트**에 태스크 생성. 실슬랙 검증 완료. 제목 없이 `/otro plane` → 입력 모달. 전용 `/plane-task` 커맨드 + 메시지 우클릭 숏컷 핸들러도 배선돼 대기중이나, Slack 앱에 커맨드/숏컷 선언 등록이 필요(App Configuration Token 은 api.slack.com UI 에서만 발급 가능 — 서버·env·mote-dev 어디에도 없음). 등록 시 server3 `task-bot/register_plane_slack.py`(apps.manifest.update) 사용. 정본=[[project_plane_selfhost_migration]] 메모리.

### 모바일
웹이 반응형이라 모바일 브라우저·PWA로 전 기능 사용 가능. 네이티브 앱은 별도 오픈소스 레포(React Native) 포크가 필요하며, 표준 기능은 셀프호스트 URL 지원 앱으로 접속 가능하나 커스텀 mote 기능은 웹 전용.

## 이번 세션에 완료한 기능 (릴리스 · 티켓 · 검증)

| 기능 | 릴리스 | 티켓 | 마이그 | 검증 |
|---|---|---|---|---|
| Project States | mote.29–30 | PLANE-30 | 0137 | e2e + 브라우저 |
| Project/Module Overview 분석 | — (CE 기존) | — | — | 브라우저(신규개발 불필요 확인) |
| Collections | mote.31 | PLANE-40 | 0138 | e2e + 브라우저 |
| Shared Pages | mote.32 | PLANE-40 | 0139 | e2e + 브라우저 |
| Publish Views | mote.33/space.2 | PLANE-26 | 0(DeployBoard 재사용) | e2e + anon 브라우저 |
| Automations (규칙엔진) | mote.34 | PLANE-40 | 0140 | e2e 7/7 + 브라우저 |
| Teamspaces (P1+P2) | mote.35 | PLANE-41 | 0141 | e2e 16/16 + 브라우저 |
| Enhanced Search (pg_trgm) | (mote.6/0124, 재검증) | — | 0124 | 오타검색 실검증 |
| Custom RBAC (P1+P2) | mote.36 | PLANE-41 | 0142 | e2e 13/13 + 브라우저 + 무회귀 5/5 |

## 검증 방식 (재사용 가능)

- **백엔드 e2e**: Django test Client `force_login` → 실 URLconf·미들웨어·권한·시리얼라이저·DB 전 스택. 배포 이미지 + app-src 볼륨마운트 `docker run`으로 실행.
- **프론트 실브라우저**: playwright chromium + 민트 세션(쿠키 `session-id`) + 온보딩 임시 플립(백업→복원). React #418/#423 하이드레이션 경고는 스톡 노이즈(무시).
- **무회귀 확인**: allow_permission 변경 후 기존 int-롤 게이트가 admin 200 / anon 401 유지 검증(5/5).

## 남은 것 (비핵심 · 후속)

- **Teamspaces P3/P4**: 팀-스코프 뷰/페이지(IssueView/Page에 team FK) · 공개 v1 API.
- **Custom RBAC 게이트 전환**: resolver는 additive로 안착 완료(무회귀). 개별 프로덕션 게이트를 `permission_key=`로 옵트인 전환은 **per-gate 신중히**(설계 05 §2: 게이트별 특성화 테스트 후 전환). 현재는 커스텀롤 정의·부여·조회는 되지만 실제 enforcement는 int-롤 기준(additive 확대만).
- 문서 06 Integrations(task-bot 웹훅 방식 권고) · Importers(CSV/Notion).
- 문서 05 Customers/인테이크 라우팅 · Guest 좌석비율(생략 권고).
- 문서 02 Page Comments 인라인 앵커(XL, 문서레벨 rail의 phase 2).

## 운영 주의 (핵심 함정)

- **배포**: `docker compose --env-file plane.env -p plane up -d <svc>` — `--env-file` 필수(누락시 pw 기본값으로 api/worker 전멸).
- **빌드**: server3 `/srv/shared/app-src/plane`(로컬 repo ≠ server3 체크아웃) — 변경파일 scp/tar 후 `build-moteN*.sh`(`--progress=plain`, quiet 금지=pnpm stall). frontend Dockerfile.web는 vite 빌드라 **타입에러를 안 잡음** → import 해석 오류만 빌드 실패, 순수 타입에러는 브라우저 검증이 백스톱.
- **마이그레이션**: `docker run` makemigrations가 issuetimer `one_running_timer_per_user_issue` 드리프트 2줄을 매번 끌어옴 → 기능 마이그에서 **수동 제거**(pending 드리프트, 독립·무해).
- **신규 project 필드**: `app/views/project/base.py` DynamicBaseSerializer allowlist에도 추가해야 프론트 노출.
- **`@/plane-web/*` import**: 전부 `ce/**`에 실파일/re-export 스텁 필수(alias fallback 없음).
