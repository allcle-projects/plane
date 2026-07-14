# Plane 유료기능 자체구현 — 구현 상태 & 핸드오프 (2026-07-08)

> 대상: `plane.motemote.co.kr` (CE v1.3.1 fork, branch `mote`).
> 로드맵 전체는 [`00-MASTER-ROADMAP.md`](./00-MASTER-ROADMAP.md) 참조. 이 문서는 **어디까지 했고 무엇이 남았는지**의 정본.
> 배포 상태: **백엔드 `v1.3.1-mote.41` + 프론트 `v1.3.1-mote.43` + space `v1.3.1-space.2`** (server3 `/srv/shared/stack/plane-server3/`, compose.override 태그, api/web 각 2replica). 마이그 head 0144.

## 요약 (2026-07-14): 클라우드→셀프호스트 완전이관 + 봉인기능 오픈 + 워크스페이스 통합뷰 신규

**클라우드 이관 완결**: 이슈 162건+페이지 89건 DB-write 이관(seq_id·description_binary 보존), freeze로 클라우드 드리프트 정지, 담당자/라벨 전 프로젝트 재조정 완료(assignees_missing=0), 월요일 이격 재검토(create=0=완전동기화).
**기능 진입점 감사+봉인기능 오픈**: docs 08 전체 유료기능 재점검 결과 전량 배포·게이팅無 확인. 단 **Time Tracking·Custom Fields는 토글UI 자체가 없어 완전봉인**(백엔드 필드 `is_time_tracking_enabled`/`is_issue_type_enabled`는 존재하되 `project/base.py`의 `.values()` allowlist 누락으로 설정페이지가 READ 불가) — Settings>Features 토글 2종 신설(mote.41)+전 프로젝트 DB로 즉시 ON. **Active Cycles**는 헤더에 "Pro feature" 업그레이드 배지 잔존(이미 언스텁된 무료기능인데 배지만 안 지워짐) — 제거(mote.43).
**워크스페이스 통합뷰 신규(mote.42)**: Modules — 백엔드 `WorkspaceModulesEndpoint`+프론트 `fetchWorkspaceModules`가 스톡 CE에 이미 존재(Active Cycles와 동일한 "언스텁" 패턴)했으나 프론트 페이지가 없어서 신규 작성(`apps/web/app/.../modules/`+`apps/web/ce/components/workspace-modules/`), 사이드바 nav 추가. Work Items는 **신규개발 불필요** — `DEFAULT_GLOBAL_VIEWS_LIST`의 `all-issues`("모든 작업 항목")가 이미 사이드바 "보기" 클릭 시 노출.
**무중단 배포 인프라**: `docker-compose.yml`에 이미 있던 `deploy.replicas` 활용, `API_REPLICAS=2`/`WEB_REPLICAS=2` 상시적용. mote.41~43 3회 배포 실측 다운타임 0.
**워크스페이스/프로젝트 타임존**: 전체 Asia/Seoul 통일.

이전 요약(2026-07-09): 문서 **02(Wiki/Publishing)·03(Work Item Power)·04(Planning) 전량 완료** + 문서 **05(Teamspaces·Custom RBAC) 완료** + 문서 **06(Automations·Enhanced Search) 완료**. XL 4종(Custom Fields·Initiatives·Teamspaces·Custom RBAC) 모두 완결.
남은 것(비핵심/후속): Guest 좌석비율(생략권고) · Customers/인테이크 라우팅 · Page Comments 인라인 앵커(XL) · GitHub 아웃바운드(Slack과 동형으로 확장 가능) · 네이티브 모바일앱(별도 레포 포크 필요, 웹은 반응형으로 사용가능) · **워크스페이스 레벨 Modules 통합 집계뷰(2026-07-14 완료, 위 참조)**.

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
| 05 | **Custom RBAC** (P1 백엔드·P2 프론트) | mote.36 | PLANE-41 | Permission(16키)+Role(is_system Admin/Member/Guest+base_role)+RoleAssignment(마이그0142, ws당 시드). **additive resolver**(int롤 UNION 커스텀롤, 무assign=int과 동일—무회귀). allow_permission `permission_key=` 옵트인(기본None=기존불변). 설정 Roles&Permissions(권한매트릭스). e2e 13/13(특성화). |
| 05 | **Custom RBAC 게이트 적용** | mote.37 | PLANE-41 | 실 게이트를 resolver로 전환(additive opt-in): IssueViewSet create/update/destroy(issue.create/update/delete)+StateViewSet create/mark_as_default/destroy(issue.state.manage). e2e 7/7(guest baseline403→커스텀롤 grant201→revoke403→admin 무회귀). 라이브 무회귀 5/5. Page/Project는 class-level permission_classes라 후속 |
| 06 | **알림 버그 fix** | mote.37 | — | 코멘트→알림함 미발화 근본원인=notification_task가 recipient의 UserNotificationPreference를 `.get()`→pref 없는 유저(임포트/마이그) DoesNotExist→outer try/except가 삼켜 **배치 전체 알림 소실**. get_or_create 3곳(subscriber+mention2)으로 self-heal. 재현(+0)→fix(+1) 검증. 현 실유저 영향은 봇1만(무). |
| 05 | **Teamspaces P3** (팀뷰/페이지) | mote.38 | PLANE-41 | IssueView·Page에 nullable team FK(마이그0143). TeamView/TeamPage 엔드포인트(GET/POST/DELETE). 팀상세에 Views·Pages 섹션(인라인 생성/삭제). e2e 9/9(팀뷰·페이지 CRUD+team FK)+브라우저(UI 생성확인) |
| 06 | **CSV Importer** | mote.38 | — | POST import-csv/(멀티파트 file 또는 csv텍스트). 행당 IssueCreateSerializer(시퀀스·정렬·검증 정합). name/title/summary·description·priority·state(이름매칭) alias. 행별 에러 보고·5000행캡. work-items 헤더 Import 버튼+모달. issue.create 게이트 재사용. e2e 6/6(3생성·1에러·우선순위매핑·no-name-col 400)+브라우저 |
| 06 | **Slack 아웃바운드 전송** | mote.39 | — | `slack_task`(자체완결, task-bot 불필요): SlackProjectSync.webhook_url 있으면 이슈 활동(코멘트·상태·우선순위·담당자·생성)을 Slack incoming-webhook으로 POST. issue_activities_task에서 dispatch·webhook 없으면 no-op·실패 삼킴. CELERY_IMPORTS 등록. FE=프로젝트설정 Integrations(webhook CRUD, 기존)+사이드바 nav 등록. e2e(webhook POST+메시지포맷)+브라우저 |
| 06 | **Notion/Jira Importer** | mote.39 | — | CSV importer 확장: Jira/Notion export 직접 인식(Summary/Status/Priority auto-map), 벤더 우선순위 정규화(Highest/Critical→urgent·Lowest/Minor→low). e2e(Jira CSV·Highest→urgent·Lowest→low) |
| 05 | **Teamspaces P4** (공개) | mote.39 | PLANE-41 | Team.is_public(마이그0144)+anon PublicTeamspaceEndpoint(`/public/.../teamspaces/<id>/`): is_public일 때만 팀명+공개페이지 노출(work-item 미노출·비공개 404). 팀상세 Public/Private 토글. e2e(private404→public200)+브라우저 |
| 05 | **Custom RBAC Page/Project 게이트** | mote.39 | PLANE-41 | ProjectMemberPermission(project.create/manage)+ProjectPagePermission(page.create/manage)이 additive resolver 참조(class-level 게이트—allow_permission 미경유분). 무회귀(int체크 불변·custom롤만 확대). e2e 3/3(page guest 403→커스텀롤 201→revoke 403)+라이브 무회귀 |
| 06 | **Slack 아웃바운드 실웹훅 검증 + HTML strip** | mote.40 | — | 실 webhook(캡처 리시버) 부착→실 celery worker가 `requests.post` 실제 전송, 캡처 페이로드 확인(실 코멘트→Slack). 코멘트 스니펫 `<p>` 원본HTML→plain-text strip(`_plain()`, Slack은 HTML 미렌더). 라이브 e2e |
| 06 | **Slack 인바운드 (Slack→Plane 태스크)** | mote.40 | — | 신규 공개 엔드포인트 `POST /api/slack/intake/<slug>/<project_id>/`(AllowAny·인증없음): 슬랙 슬래시커맨드(`/plane-task <제목>`)·Workflow-Builder 웹훅→해당 프로젝트에 work item 생성. 인증=Slack 서명(`SLACK_SIGNING_SECRET`) 또는 공유토큰(`SLACK_INTAKE_TOKEN`), 둘 다 미설정시 거부(open-by-accident 방지). 제목=text 1행·본문/제출자 attribution 자동. FE=프로젝트설정 Integrations에 "Slack→work item(inbound)" 섹션(프로젝트별 intake URL+복사). e2e 6/6(정상생성·잘못된토큰401·빈text·JSON워크플로우·미설정거부·미지프로젝트) + **라이브 검증(실 공개 프록시 POST→이슈생성→정리, 잘못된토큰→401)** |

**⇒ 문서 03(Work Item Power) 전량 완결 + 문서 04 전량 완결(§5 CE기존) + 문서 02 Collections·Shared Pages·Publish Views 완결 + 문서 06 Automations·Enhanced Search 완결 + 문서 05 Teamspaces·Custom RBAC 완결. 🎉 로드맵 핵심 유료기능 전량 자체구현 완료.**

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
| 05 | ~~Custom RBAC~~ | XL | ✅ P1(백엔드)+P2(프론트) 완료 (mote.36, PLANE-41) — Permission/Role/RoleAssignment(마이그0142)·additive resolver(무회귀)·설정 Roles&Permissions. 남은=개별 게이트를 resolver로 전환(per-gate, 신중) |
| 05 | Guest 좌석비율(1:5) | S | 미착수(생략 권고) |
| 05 | Customers + 인테이크 라우팅 | M–L | 미착수 |
| 06 | 통합 Slack/GitHub/Sentry/GitLab | S~M | 미착수(아웃바운드 웹훅+task-bot 방식 권고) |
| 06 | Importers CSV/멤버 · Notion/Confluence | M/L | 미착수 |
| 06 | ~~Automations(규칙엔진)~~ | L | ✅ 완료 (mote.34, PLANE-40) — AutomationRule+Log(마이그0140)·issue_activities 핫패스 훅·rule-builder. e2e 7/7 |
| 06 | ~~Enhanced Search(pg_trgm)~~ | M | ✅ 완료 (mote.6, 마이그0124) — `utils/issue_search.py` TrigramSimilarity 랭킹(임계0.3, 오타허용)·`ranked_search`가 search/base.py 전 엔티티(issue/project/cycle/module/page/view/workspace)에 적용·gin_trgm 인덱스 8종 DB적용 확인. **오타검색 실검증**('plabe'→'plane fork'). FTS(tsvector)는 미도입=trigram으로 충분 |

> **업데이트(2026-07-08)**: 배포 = 백엔드 v1.3.1-mote.29 + 프론트 v1.3.1-mote.30. **Initiatives**(mote.19–21) + **Updates**(mote.22–23) + **Milestones**(mote.24–28) + **Project States**(mote.29–30, PLANE-30) 완결. 문서 04 남은 것=Project/Module Overview 분석(§5, 프로젝트 side는 대부분 기존, net-new=모듈 3엔드포인트+프론트). ⚠️신규 project 필드(bool/FK)는 `app/views/project/base.py`의 DynamicBaseSerializer 명시 fields allowlist에도 추가해야 프론트 노출(milestone_view·state 교훈). 나머지 대형=문서02(Shared Pages·Collections·Publish Views)·문서05(Teamspaces·Custom RBAC)·문서06(통합·Importers·Automations·Enhanced Search).

## 2026-07-08 CE 기존구현 감사 (헛빌드 방지)
CE v1.3.1이 설계 작성 시점보다 최신 → 일부 "남은" 기능이 이미 존재. 직접 감사 결과:
- **✅ 이미 CE 구현(빌드 불필요)**: Estimates TIME 타입(`EstimateType.TIME` 모델+프론트 enum), Project/Module Overview 분석(§5).
- **🟡 부분 존재**: Importers(`db/models/importer.py`), Integrations(`db/models/integration/`+Slack/GitHub sync 엔드포인트), Shared Pages(page.access pub/priv+is_global 있음, 공개링크 publish 부재), Enhanced Search(icontains 기반; GinIndex+gin_trgm_ops 인프라는 Project/Issue name에 존재하나 trigram 랭킹 미사용).
- **🔴 완전 신규(net-new 빌드 완료)**: ~~Collections~~✅, ~~Publish Views~~✅(DeployBoard anchor 재사용), ~~Automations~~✅(규칙엔진, mote.34), ~~Teamspaces~~✅(orphan Team 재사용, mote.35 P1+P2), ~~Custom RBAC~~✅(Permission/Role/RoleAssignment+additive resolver, mote.36 P1+P2). **전 net-new 대형기능 완료.**

## 다음 착수 권장 (로드맵 Phase 3~4)
1. **Phase 3 콘텐츠·계획**: Shared Pages·Collections·Publish Views(위키 토대 완성) → Milestones·Project States·Updates.
2. **Phase 4 XL 트레인**(각 독립 단계): Initiatives → Teamspaces → **Custom RBAC(맨 마지막)**.
3. **Phase 3 병행 가능**: Automations, Enhanced Search, CSV 임포터, 통합(task-bot 방식).

## 운영 메모
- 배포: `docker compose --env-file plane.env -p plane up -d` (⚠️ `--env-file` 필수 — 없으면 pw 기본값으로 api/worker 전멸).
- 빌드: server3 `/srv/shared/app-src/plane/build-moteN*.sh` `docker build --progress=plain`(quiet 금지—pnpm fetch stall).
- 커밋 정본: `allcle-projects/plane` branch `mote`. 백엔드만 바뀌면 백엔드 4서비스(api/worker/beat-worker/migrator)만 태그 스왑.
