# Plane 유료기능 자체구현 — 마스터 로드맵 (설계 취합)

> 작성 2026-07-04. 대상: `plane.motemote.co.kr` (CE v1.3.1 fork, branch `mote`).
> 상세 설계는 `01`~`06` 문서 참조. 이 문서는 전체 순서·공수·의존성을 관통 정리한다.
>
> **📊 구현 상태(2026-07-08): [`08-implementation-status.md`](./08-implementation-status.md) 참조.**
> 24개 중 ~절반 완료 — 문서 03(Work Item Power) 전량 완결, 02·05 부분, 04·06 거의 미착수.
> 배포 = 백엔드 `v1.3.1-mote.18` + 프론트 `v1.3.1-mote.15`.

## 핵심 결론 (먼저 읽기)

1. **silo 불필요.** 24개 기능 중 외부 closed "silo" 서비스가 **반드시** 필요한 것은 **하나도 없다.** 이 포크의 유료 게이팅은 (a) 프론트 alias `@/plane-web/* → ce/*` 스텁, (b) 백엔드 미구현 엔드포인트 — **둘 다 우리가 제어**한다. 백엔드에는 라이선스 검사가 전혀 없다.
2. **통합만 예외적 판단.** GitHub/Slack/Sentry는 네이티브 OAuth(옵션 A)로 만들면 사실상 silo를 monolith 안에 재건(XL, inbound 서명검증 보안위험)하는 것 → **비권장**. 대신 이미 동작하는 **아웃바운드 웹훅 + task-bot(옵션 B, S)**로 대체 권장.
3. **XL 4종은 단계 분할 + 디리스킹 필수:** Custom Fields, Initiatives, Teamspaces, Custom RBAC. 특히 Custom RBAC은 **모든 권한검사를 건드리는 최대 blast radius** → 우선 프리셋 역할 2종 추가(저위험 80% 가치)로 시작 권고.
4. **재사용 가능한 기존 자산:** `Team` 모델(orphan, `workspace.py:261`), `Page.is_global`, `DeployBoard`(entity-agnostic), 통합 모델 3종(orphan), `Importer` 모델, 아웃바운드 웹훅+HMAC, celery-beat, 인증 Adapter 퍼널, 분석 엔진(`app/views/analytic/`).

## 전체 기능 × 공수 × 의존성

| 문서 | 기능 | 공수 | silo | 선행 의존 |
|---|---|---|---|---|
| 01 | Estimates 시간(TIME) 타입 | **S** | No | — |
| 01 | 사이클 수동 시작/정지 + 자동스케줄 | **M** | No | — |
| 01 | 간트 드래그로 의존성 생성 | **M** | No | (화살표 시각화는 완료) |
| 02 | 워크스페이스 레벨 위키 | **M** | No | **먼저** — 03·04·05번 페이지기능의 토대 |
| 02 | Page Comments (문서레벨 rail) | **L** | No | — (인라인 앵커는 별도 XL) |
| 02 | Shared Pages | **M** | No | 워크스페이스 위키 |
| 02 | Collections | **M** | No | 워크스페이스 위키 |
| 02 | Publish Views (+페이지 게시경로) | **L** | No | 익명 뷰셋 공통화 |
| 03 | **Custom Fields / Work Item Properties** | **XL**(분할) | No | — |
| 03 | Templates (작업/프로젝트) | **M** | No | — |
| 03 | Recurring Work Items | **M** | No | celery-beat(있음) |
| 03 | Time Tracking | **M** | No | — |
| 04 | **Initiatives** | **XL** | No | Updates의 initiative FK·사이드바 IA 선행 |
| 04 | Milestones | **M** | No | Module 패턴 클론 |
| 04 | Project States (상태별 그룹) | **M** | No | — |
| 04 | Updates (상태 포스트) | **M** | No | Initiatives(선택적) |
| 04 | Project/Module Overview 분석 | **S–M** | No | 분석엔진 재사용 |
| 05 | **Teamspaces** | **XL**(분할) | No | orphan `Team` 모델 재사용 |
| 05 | **Custom RBAC** | **XL** | No | 최대 blast radius — 맨 마지막 |
| 05 | 2FA (TOTP) | **M** | No | 인증 Adapter |
| 05 | Guest 좌석비율(1:5) | **S** | No | (선택/생략 권고) |
| 05 | Customers + 인테이크 라우팅 | **M–L** | No | 인테이크(있음) |
| 06 | 통합 Slack/GitHub (task-bot 방식) | **S**/S–M | No(옵션B) | 아웃바운드 웹훅(있음) |
| 06 | 통합 Sentry/GitLab/Draw.io | S/S/M | No | — |
| 06 | Importers CSV+멤버 | **M** | No | — |
| 06 | Importers Notion/Confluence | L | No | 파서 레지스트리 |
| 06 | Automations (규칙엔진) | **L** | No | issue_activity 훅 |
| 06 | Enhanced Search (pg_trgm+FTS) | **M** | No | — |

## 권장 단계별 실행 순서 (6개 문서 관통)

### Phase 1 — 즉효 퀵윈 (S~M, 독립·고가치)
1. Estimates TIME 타입 (S)
2. Enhanced Search pg_trgm (S→M, 즉각 UX 개선)
3. Slack + GitHub via task-bot (S)
4. Project/Module Overview 분석 (S–M, 엔드포인트 존재)
5. 사이클 수동 시작/정지 (M) · 간트 드래그 의존성 (M)

### Phase 2 — 토대 + 보안 + 개발팀 실사용
6. **워크스페이스 위키** (M) — 페이지 계열 토대 (Shared/Collections/page-publish 선행)
7. 2FA TOTP (M, 보안)
8. Templates (M) · Recurring (M) · Time Tracking (M)

### Phase 3 — 콘텐츠·계획 기능
9. Page Comments 문서레벨 rail (L) · Shared Pages (M) · Collections (M)
10. Publish Views (L)
11. Milestones (M) · Project States (M) · Updates (M)
12. Customers + 인테이크 라우팅 (M–L) · Automations (L) · CSV/멤버 임포터 (M)

### Phase 4 — XL 전용 트레인 (각각 독립 단계로)
13. **Custom Fields** (XL, 3~4단계 분할) — 개발팀 실사용 가치 높음, 조기 착수 고려 가능
14. **Initiatives** (XL) — 사이드바 IA·Updates FK 선행
15. **Teamspaces** (XL, 분할; orphan Team 모델 재사용)
16. **Custom RBAC** (XL, **맨 마지막**) — 우선 **프리셋 역할 2종**(Restricted Member/Viewer)으로 시작, 부족하면 풀 RBAC

### 별도 스코프 (XL, 여력될 때)
- Page Comments 인라인 앵커(ProseMirror mark, editor+live) — XL, 문서레벨 rail의 phase 2
- Notion/Confluence 임포터 (리치텍스트/첨부 충실도 리스크)
- 통합 네이티브 OAuth(옵션 A) — 재검토만, 현재 비권장

## 공통 구현 원칙 (전 기능 적용)
- 프론트는 전부 `apps/web/ce/**`에 구현 → 기존 alias가 자동 픽업(임포트 변경 0).
- 백엔드는 `app/`(내부)+`api/`(공개 v1) 양쪽 미러, 워크스페이스/프로젝트/멤버십 스코핑 필수.
- 모델/필드명은 upstream EE 명명을 따라가 향후 병합 용이성 유지.
- 이슈 관련 변경은 `IssueActivity` 발화(피드 일관성), serializer 확장은 1패스로 묶어 N+1 회귀 방지.
- 모든 신규 공개 API는 이번 세션 보안리뷰 기준(교차 사용자/프로젝트 격리) 준수.
