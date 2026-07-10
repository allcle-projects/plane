# 10 — 사내 업무 툴로서의 Plane: 남은 기능·우선순위 로드맵 (2026-07-09)

> 대상: `plane.motemote.co.kr` (CE v1.3.1 fork, branch `mote`). 구현상태 정본 = [`08-implementation-status.md`](./08-implementation-status.md).
> 이 문서는 "EE 유료기능 패리티"가 아니라 **모트모트 팀이 매일 쓰는 업무 툴로서 Plane에 아직 필요한 것**을 코드 검증 기반으로 정리한 것.

## 요약

EE 유료기능(Custom Fields·Initiatives·Teamspaces·RBAC·Automations·Slack 양방향·Importers·Time-tracking·Wiki/Pages)은 코드상 전량 구현 완료. **P0 블로커는 없다** — 팀은 이미 Plane을 실행 정본으로 사용 중. 남은 것은 두 축이다:

1. **운영 글루(operational glue)**: Plane을 팀의 실제 워크플로우(task-bot·OKR·Slack·GitHub PR)와 잇는 통합.
2. **셀프호스트 내구성(durability)**: 백업/복구 + 업스트림 업그레이드 경로 — 이게 **가장 큰 잠재 리스크**.

### 팀이 실제로 일하는 방식 (우선순위 근거)
- **Plane = 실행 정본**(work item·cycle·module). task-bot이 공개 API(`PLANE_API_TOKEN`)로 Plane을 읽어 목요일 주간회의 문서를 자동 생성 → Plane **Page로 POST**(PATCH 불가 추정 → 매주 새 Page).
- **OKR/KR = Plane 밖**(mote-dev 마크다운 `TASK-*.md` okr_ref, task-bot `okr_report.py`가 롤업 → Slack). Plane은 태스크 상태만, KR 달성도는 Plane 안에서 롤업 안 됨(Initiatives 모델은 있으나 미연결) → **정본 분열**.
- **Slack = 승인·알림 레이어**, PR 리뷰 = 핵심 개발 워크플로우(GitHub).

## 코드 검증 결과 (오해 방지)

| 항목 | 실제 상태 (코드 확인) |
|---|---|
| Google/OIDC/GitHub OAuth 로그인 | ✅ 있음 (`authentication/provider/oauth/{google,oidc,github}.py`). 2FA TOTP도 mote.8. **SSO=Done** |
| GitHub PR/이슈 링킹 | ⚠️ **설정 저장 스텁만** (`app/views/integration/base.py:79` GithubRepositorySyncEndpoint = 매핑 row CRUD). PR/commit/comment 동기화·outbound POST 없음 |
| Outbound 웹훅 / API 토큰 | ✅ 실동작 (`bgtasks/webhook_task.py:261` webhook_send_task, `db/models/api.py`). task-bot이 이 위에서 동작 |
| Rate limiting | ⚠️ `AnonRateThrottle`만 (`settings/common.py:123`). 인증 유저 스로틀 없음(task-bot 폴링 무제한) |
| 알림함(in-app inbox) | ✅ Done (mote.37 get_or_create fix). 이메일=즉시 미러만(digest 없음), 유저별 Slack DM 라우팅 없음(채널 웹훅뿐) |
| Export | ✅ csv/json/xlsx (`bgtasks/export_task.py:128`). **전체 인스턴스 백업/복구 커맨드는 없음** |
| SCIM | ❌ 없음 |

## 기능 갭 테이블 (전 차원)

| 기능 | 상태 | 왜 필요한가 (이 팀 기준) | 규모 | 우선순위 |
|---|---|---|---|---|
| **복구 드릴 + 런북** (백업 자체는 있음) | Partial — `plane-backup.sh`(pg_dump -Fc + uploads tar)가 매일 `/data/backups/server3/plane/daily`에 덤프(7/9 확인). 단 **검증된 복구(restore) 드릴·런북 부재**(`--restore-test` 플래그는 있으나 실제 복구 검증 이력 불명) | 셀프호스트·벤더 안전망 없음. Plane=실행 정본. 백업은 있으나 "복구된다"는 증명이 없음 | S–M | **P1** |
| **업스트림 업그레이드/머지 전략** | Missing (대규모 divergence, 런북 없음) | CE v1.3.1 위 ~40 mote.N net-new. 보안패치마다 수동머지. 최대 포크 리스크 | M–L | **P1** |
| **GitHub PR/이슈 ↔ work item 링킹** | Missing (config 스텁만) | PR 리뷰=핵심 개발 워크플로우. OKR 태스크가 PR에 매핑. work item에 PR 상태 가시성 0 | M | **P1** |
| **유저별 Slack DM 라우팅** | Missing (채널 웹훅만) | Slack=알림 레이어. 담당자는 배정/멘션 시 채널이 아니라 DM 필요 | S–M | **P1** |
| **Plane 내 OKR/KR 롤업** | Missing (KR은 git 마크다운 okr_report.py) | OKR=1급 프로세스. Initiatives 모델 있으나 KR 진척 미탑재. 정본 분열 | M | **P1** |
| Public API: Page 업데이트(PATCH) | Partial (POST-only 추정) | 주간회의 자동생성이 매주 새 Page 강제(living doc 불가) | S–M | P2 |
| 예약 이메일/Slack 다이제스트(내장) | Missing (즉시 이메일 + 외부 task-bot만) | task-bot 08:00 Slack이 이미 커버. 한계효용 낮음 | S | P2 |
| 네이티브 모바일앱/푸시 | Missing (반응형 웹·PWA 사용가능) | 웹으로 모바일 됨. 네이티브=별도 RN 포크. 커스텀 mote 기능은 웹 전용 | XL | P2 |
| 인증 유저 API rate limit | Missing (Anon만) | task-bot 폴링 무제한이나 내부/신뢰. 하드닝 nice | S | P2 |
| 고객 포털 / 웹 인테이크 폼 | Missing (Slack 인테이크→건의함 완료) | 내부툴이라 외부포털 불필요. 일반 웹폼은 Slack 인테이크 일반화 | M–L | P2 |
| Page 코멘트 인라인 앵커 | Missing (문서레벨 rail 완료) | Wiki nicety. 워크플로우 비차단 | XL | P2 |
| SCIM 프로비저닝 | Missing (SSO 로그인은 됨) | 팀 3–10명, 수동 초대로 충분 | M | P2 |
| Sentry/GitLab/캘린더 통합 | Missing | 팀은 Crashlytics/Loki(≠Sentry)·GitHub(≠GitLab). 캘린더 저가치 | S–M each | P2 |

> 미검증(스코핑 전 10분 확인 권장): (1) Page PATCH 불가 여부 — 주간회의 문서 주장이라 public v1 URLconf 재확인. (2) 스톡 CE 애널리틱스가 velocity/burndown 충분한지 — 컴포넌트 레벨만 확인.

## 다음에 만들 것 (순서)

1. **복구 드릴 + 런북** (P1, S–M) — 백업은 이미 있음(`plane-backup.sh` 매일 pg_dump+uploads). 남은 건 **스크래치 스택에 실제 복구 테스트 1회 + 런북 문서화**(`--restore-test` 실행·검증). 셀프호스트 정본의 가장 싼 보험. 아래 마이그레이션 실행 직전에도 필수(11번 문서).
2. **업스트림 업그레이드/divergence 감사 + 머지 런북** (P1, M–L) — ~40 mote.N 마이그/엔드포인트 카탈로그화, EE 네이밍 미러링 확인, "CE 보안패치 취하는 절차" 문서화. 안 하면 포크가 미패치 상태로 썩음.
3. **GitHub PR/이슈 링킹 (Slack 방식)** (P1, M) — 기존 GithubRepositorySync 스텁을 slack_task와 동형으로 배선: PR/commit 이벤트 → work-item 코멘트/활동 + 연결 PR 상태 필드. 모델 이미 있어 증분.
4. **유저별 Slack DM 라우팅** (P1, S–M) — outbound를 채널 전용→유저 DM(Plane user↔Slack ID 매핑)으로 확장. 기존 slack_task 배관 재사용.
5. **OKR/KR 홈 결정 & 일관화** (P1, M) — (a) Initiatives로 Plane 안에 KR 롤업(Plane=단일 OKR 정본), 또는 (b) okr_report.py git-마크다운을 정본으로 공식화 + Plane→OKR 읽기 브릿지. 지금은 split-brain, 하나 택.
6. **주간회의용 Page PATCH API** (P2, S–M) — 부재 확인 시, 매주 새 Page 대신 하나의 living Page로.

**지금 안 만듦(P2)**: 네이티브 모바일·SCIM·Sentry/GitLab/캘린더·고객포털·인라인 페이지 앵커 — 현 팀 규모/툴체인에 부적합, 반응형 웹 + task-bot/Slack 레이어가 의도 커버.
