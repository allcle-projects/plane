# Plane 유료기능 자체구현 — 구현 상태 & 핸드오프 (2026-07-08)

> 대상: `plane.motemote.co.kr` (CE v1.3.1 fork, branch `mote`).
> 로드맵 전체는 [`00-MASTER-ROADMAP.md`](./00-MASTER-ROADMAP.md) 참조. 이 문서는 **어디까지 했고 무엇이 남았는지**의 정본.
> 배포 상태: **백엔드 `v1.3.1-mote.35` + 프론트 `v1.3.1-mote.35` + space `v1.3.1-space.2`** (server3 `/srv/shared/stack/plane-server3/`, compose.override 태그).

## 요약: 로드맵 24개 기능 중 대략 절반 완료

문서 **03(Work Item Power) 전량 완료**, 문서 02·05 부분 완료, 문서 **04·06 거의 미착수**.
남은 대형(XL) 기능: **Custom RBAC**(맨 마지막) + Integrations · Importers · Enhanced Search.

## ✅ 완료 (배포·검증)

| 로드맵 문서 | 기능 | 릴리스 | 티켓 | 비고 |
|---|---|---|---|---|
| 01 | Active Cycles 페이지 | mote.4 | — | 사이클 수동 시작/정지 일부 |
| 01 | 간트 드래그 의존성(화살표) | mote.4 | — | |
| 05 | Private 프로젝트 | mote.4 | — | |
| — | 공개 v1 API 확장(reactions/subscribers/archive/sub-issues/versions 등) | mote.4~6 | — | |
| 02 | **워크스페이스 위키**(is_global) | mote.7 | PLANE-27 | 페이지 계열 토대 |
| 02 | **Page Comments**(문서레벨 rail) | mote.7 | PLANE-12 | 인라인 앵커는 별도 XL |
| 05 | **2FA (TOTP)** | mote.8 | PLANE-45 | enforcement 기본 OFF |
| 03 | **Time Tracking**(worklog+timer) | mote.9 | PLANE-3 | |
| 03 | **Custom Fields / Work Item Properties** (4단계) | mote.10~13 | PLANE-47 | 정의·값·컬럼·필터+공개v1 |
| 03 | **Templates**(작업+프로젝트) | mote.14 | PLANE-4 | |
| 03 | **Recurring Work Items** | mote.15 | PLANE-32 | celery-beat DatabaseScheduler |
| 04 | **Initiatives** (P1 모델/CRUD·P2 rollup·P3 프론트) | mote.19–21 | PLANE-33 | 워크스페이스 그룹핑(마이그 0134). 사이드바 nav+list/detail |
| 04 | **Updates**(상태 포스트) (P1 백엔드·P2 프론트) | mote.22–23 | PLANE-29 | EntityUpdate 3-스코프(project/cycle/initiative, 마이그0135). 재사용 UpdatesPanel 3면 마운트 |
| 04 | **Milestones** (P1 백엔드·P2 프론트) | mote.24–28 | PLANE-31 | Milestone+MilestoneIssue+rollup(마이그0136). 프로젝트 nav 탭(milestone_view). Module 패턴 클론 |
| 04 | **Project States** (P1 백엔드·P2 프론트) | mote.29–30 | PLANE-30 | ProjectState+Project.state(마이그0137, 워크스페이스당 6상태 시드). 설정편집기+카드뱃지+group-by. State 패턴 클론 |

| 02 | **Collections** (P1 백엔드·P2 프론트) | mote.31 | PLANE-40 | PageCollection+PageCollectionItem(마이그0138). 위키 Collections rail. owner전용 변경·멱등 add_pages |
| 02 | **Shared Pages** (P1 백엔드·P2 프론트) | mote.32 | PLANE-40 | PageCollaborator(마이그0139). 헤더 Share 모달·역할별 게이팅. v1=위키페이지·Yjs게이팅 follow-up |
| 02 | **Publish Views** (P1 백엔드·P2 프론트+space) | mote.33/space.2 | PLANE-26 | DeployBoard(view) additive·마이그0. anon /spaces/views/&lt;anchor&gt; 이슈 렌더. 회귀0 |
| 06 | **Automations**(규칙엔진) (P1 백엔드·P2 프론트) | mote.34 | PLANE-40 | AutomationRule+Log(마이그0140). issue_activities 핫패스 훅→celery evaluate_automations(루프가드 is_automation). 설정탭 "Custom automations" rule-builder. e2e 7/7 |
| 05 | **Teamspaces** (P1 백엔드·P2 프론트) | mote.35 | PLANE-41 | orphan Team 재사용+TeamMember/TeamProject(마이그0141). CRUD·멤버/프로젝트 조인·work-item 피드(액세스 스코프). 사이드바 nav+list/detail(멤버·프로젝트·work-items). 생성자 자동멤버. e2e 16/16. 남은=팀뷰/페이지(P3)·공개v1(P4) |

**⇒ 문서 03(Work Item Power) 전량 완결 + 문서 04 전량 완결(§5 CE기존) + 문서 02 Collections·Shared Pages·Publish Views 완결 + 문서 06 Automations 완결 + 문서 05 Teamspaces(P1+P2) 완결.**

### 2026-07-08 심층검증에서 잡은 실결함 3건 (전부 수정·재검증)
운영에 갈 뻔한 결함을 단위검증이 아닌 **e2e·인증 실경로 검증**이 발견:
1. **mote.16** Recurring materialization `select_for_update()` + nullable `template` FK → LEFT OUTER JOIN의 nullable side FOR UPDATE 거부(`NotSupportedError`) → due마다 100% 크래시. fix=`select_for_update(of=("self",))`.
2. **mote.17** `TemplateSerializer` `fields="__all__"` + 모델 `unique_together`에 `deleted_at` → DRF가 deleted_at을 required로 강제 → 템플릿 생성 전면 400. fix=`deleted_at` read_only 선언(스톡 Plane은 명시 `fields=[...]`로 회피).
3. **mote.18** Template instantiate가 `IssueCreateSerializer(issue).data`(bare)로 응답 → `to_representation`의 `self.initial_data` 참조 AttributeError → 이슈는 생성되나 500. fix=읽기전용 `IssueDetailSerializer`.

### 검증 근거
- 백엔드 e2e: recurring materialization(멱등 포함) / templates instantiate(created_by 보존) ALL PASS.
- 인증 실경로 e2e(Django test Client force_login → 실 URLconf·미들웨어·권한·시리얼라이저·DB): Templates·Recurring CRUD/instantiate ALL PASS.
- **프론트 실브라우저 렌더(playwright chromium)**: Recurring 설정페이지·Templates 피커(작업생성 모달) 정상 렌더 확인. ⚠️ 배포 프론트 전반에 React #418/#423 하이드레이션 경고(스톡 페이지 포함, 클라 렌더로 복구)—mote 기능 무관 기존 노이즈.

## ⬜ 남은 유료기능 (미착수/부분)

| 로드맵 문서 | 기능 | 공수 | 상태 |
|---|---|---|---|
| 01 | Estimates 시간(TIME) 타입 | S | 미착수 |
| 01 | 사이클 자동 스케줄 | M | 부분(수동 일부만) |
| 02 | ~~Shared Pages~~ | M | ✅ 완료 (mote.32, PLANE-40) — PageCollaborator(마이그0139)·헤더 Share 모달. v1=위키페이지, Yjs게이팅 follow-up |
| 02 | ~~Collections~~ | M | ✅ 완료 (mote.31, PLANE-40) — PageCollection+Item(마이그0138)·위키 Collections rail |
| 02 | ~~Publish Views~~ | L | ✅ 완료 (mote.33/space.2, PLANE-26) — DeployBoard(view) additive·anon /spaces/views/&lt;anchor&gt;. 페이지 게시=follow-up |
| 02 | Page Comments 인라인 앵커 | XL | 미착수(문서레벨 rail의 phase 2) |
| 04 | ~~Initiatives~~ | XL | ✅ 완료 (mote.19–21, PLANE-33) |
| 04 | ~~Milestones~~ | M | ✅ 완료 (mote.24–28, PLANE-31) |
| 04 | ~~Project States~~ | M | ✅ 완료 (mote.29–30, PLANE-30) |
| 04 | ~~Updates(상태 포스트)~~ | M | ✅ 완료 (mote.22–23, PLANE-29) |
| 04 | ~~Project/Module Overview 분석~~ | S–M | ✅ CE 기존구현(검증) — ProjectModuleOverview 컴포넌트+advance-analytics 엔드포인트. 프로젝트/모듈 overview 페이지 실브라우저 렌더 확인(인사이트카드+Created vs Resolved+Customized Insights). 신규개발 불필요 |
| 05 | ~~Teamspaces~~ | XL | ✅ P1+P2 완료 (mote.35, PLANE-41) — orphan Team 재사용+TeamMember/TeamProject(마이그0141)·CRUD·work-item 피드·사이드바 nav·list/detail. 남은=팀뷰/페이지(P3)·공개v1(P4) |
| 05 | **Custom RBAC** | XL | 미착수 (**맨 마지막**, 최대 blast radius) |
| 05 | Guest 좌석비율(1:5) | S | 미착수(생략 권고) |
| 05 | Customers + 인테이크 라우팅 | M–L | 미착수 |
| 06 | 통합 Slack/GitHub/Sentry/GitLab | S~M | 미착수(아웃바운드 웹훅+task-bot 방식 권고) |
| 06 | Importers CSV/멤버 · Notion/Confluence | M/L | 미착수 |
| 06 | ~~Automations(규칙엔진)~~ | L | ✅ 완료 (mote.34, PLANE-40) — AutomationRule+Log(마이그0140)·issue_activities 핫패스 훅·rule-builder. e2e 7/7 |
| 06 | Enhanced Search(pg_trgm+FTS) | M | 미착수 |

> **업데이트(2026-07-08)**: 배포 = 백엔드 v1.3.1-mote.29 + 프론트 v1.3.1-mote.30. **Initiatives**(mote.19–21) + **Updates**(mote.22–23) + **Milestones**(mote.24–28) + **Project States**(mote.29–30, PLANE-30) 완결. 문서 04 남은 것=Project/Module Overview 분석(§5, 프로젝트 side는 대부분 기존, net-new=모듈 3엔드포인트+프론트). ⚠️신규 project 필드(bool/FK)는 `app/views/project/base.py`의 DynamicBaseSerializer 명시 fields allowlist에도 추가해야 프론트 노출(milestone_view·state 교훈). 나머지 대형=문서02(Shared Pages·Collections·Publish Views)·문서05(Teamspaces·Custom RBAC)·문서06(통합·Importers·Automations·Enhanced Search).

## 2026-07-08 CE 기존구현 감사 (헛빌드 방지)
CE v1.3.1이 설계 작성 시점보다 최신 → 일부 "남은" 기능이 이미 존재. 직접 감사 결과:
- **✅ 이미 CE 구현(빌드 불필요)**: Estimates TIME 타입(`EstimateType.TIME` 모델+프론트 enum), Project/Module Overview 분석(§5).
- **🟡 부분 존재**: Importers(`db/models/importer.py`), Integrations(`db/models/integration/`+Slack/GitHub sync 엔드포인트), Shared Pages(page.access pub/priv+is_global 있음, 공개링크 publish 부재), Enhanced Search(icontains 기반; GinIndex+gin_trgm_ops 인프라는 Project/Issue name에 존재하나 trigram 랭킹 미사용).
- **🔴 완전 신규(net-new 빌드 필요)**: ~~Collections~~✅, ~~Publish Views~~✅(DeployBoard anchor 재사용), ~~Automations~~✅(규칙엔진, mote.34), ~~Teamspaces~~✅(orphan Team 재사용+TeamMember/TeamProject, mote.35 P1+P2), Custom RBAC(role/permission 모델 없음—코드기반 permissions, **맨 마지막**).

## 다음 착수 권장 (로드맵 Phase 3~4)
1. **Phase 3 콘텐츠·계획**: Shared Pages·Collections·Publish Views(위키 토대 완성) → Milestones·Project States·Updates.
2. **Phase 4 XL 트레인**(각 독립 단계): Initiatives → Teamspaces → **Custom RBAC(맨 마지막)**.
3. **Phase 3 병행 가능**: Automations, Enhanced Search, CSV 임포터, 통합(task-bot 방식).

## 운영 메모
- 배포: `docker compose --env-file plane.env -p plane up -d` (⚠️ `--env-file` 필수 — 없으면 pw 기본값으로 api/worker 전멸).
- 빌드: server3 `/srv/shared/app-src/plane/build-moteN*.sh` `docker build --progress=plain`(quiet 금지—pnpm fetch stall).
- 커밋 정본: `allcle-projects/plane` branch `mote`. 백엔드만 바뀌면 백엔드 4서비스(api/worker/beat-worker/migrator)만 태그 스왑.
