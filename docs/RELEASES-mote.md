# mote 포크 릴리즈 노트 (plane.motemote.co.kr)

CE v1.3.1 기반 `mote` 브랜치. 이미지 태그 `mote/plane-{backend,frontend}:v1.3.1-mote.N`.
배포: `docker compose --env-file plane.env -p plane up -d` (server3, `/srv/shared/stack/plane-server3/`).

> ⚠️ 배포 시 `--env-file plane.env` 필수 — 누락하면 인터폴레이션이 DB 비밀번호를 기본값으로 떨어뜨려 컨테이너가 인증 실패한다.

## v1.3.1-mote.50 (2026-07-21) — .md/.mdx 첨부파일 업로드 실패 fix
- **원인**: `.md`/`.mdx`는 매직바이트가 없는 순수 텍스트라 프론트엔드 `file-type` 시그니처 감지가 빈 문자열을 반환 → 백엔드가 `not type` 체크로 400 "Invalid file type." 거부. 인프라(MinIO/S3) 문제 아님, API 직접 호출로 재현·검증 완료(TEST-32).
- **수정**: upstream Plane `feat/file-uploads-md-mdx-support` 커밋 2개 cherry-pick(`dac358b2aa`, `9eb1148dde`) — 확장자 기반 MIME fallback(`EXTENSION_MIME_TYPE_MAP`) 추가, `text/mdx` allowlist 등록, 이중확장자(`foo.exe.md`) 우회 차단.
- **배포**: server3 canary-swap으로 api×2/worker/beat-worker/web×2 전체 무중단 교체, 배포 이미지 내부에 fix 코드 포함 확인(백엔드 `common.py`, 프론트엔드 번들 grep) + API 재검증(`text/markdown` 첨부 200 확인) 완료.
- ⚠️ server3 빌드소스(`/srv/shared/app-src/plane`)가 GROWTH-144 관련 uncommitted 변경(문서 정리·비디오 MIME 추가)을 갖고 있어 stash 대피 후 cherry-pick, stash pop으로 병합 복원(손실 없음). `mote.50` 태그가 07-16에 한 번 임시로 쓰인 이력과 우연히 겹쳐 이미지가 재생성됐다 — 태그 재사용 시 `docker inspect --format '{{.Created}}'`로 실제 재빌드 여부 확인 필수.

## v1.3.1-mote.49 (2026-07-20) — API 활동 로그 감사추적 fix
- **`logger_task` Celery 태스크 등록** (PR #1) — `APITokenLogMiddleware`가 큐잉하는 `plane.bgtasks.logger_task.process_logs`가 `CELERY_IMPORTS`에서 누락되어 worker가 전량 "unregistered task"로 거부, `api_activity_logs`가 처음부터 count=0으로 감사추적 완전 유실 상태였음. 한 줄 등록으로 해결.
- 배포: server3 canary-swap으로 api×2/worker/beat-worker 무중단 전체 교체, 실측 검증(0건→7건 적재 확인) 완료.
- ⚠️ 후속(미착수, PLANE-75): `api_activity_logs`에 `X-Api-Key` 원문·요청/응답 바디가 평문 저장됨. 일 1회 cleanup(`delete_api_logs`)으로 보존기간은 짧으나 마스킹/redact는 otro 판단 대기.

## v1.3.1-mote.6 (2026-07-05) — Phase 1 유료기능
마이그레이션 0123~0126.
- **Estimates 시간(TIME) 타입** (0123) — 시간 단위 견적, 숫자 롤업 포함
- **검색 강화 pg_trgm** (0124, CONCURRENTLY) — 오타 허용 유사도 랭킹, GIN 트라이그램 인덱스 8종
- **간트 타임라인 드래그로 의존성 생성** — 기존 IssueRelation 재사용
- **Project/Module Overview 분석 페이지** — 기존 advance-analytics 재사용
- **사이클 수동 시작/정지 + auto_schedule** (0125) — state 상태머신, 기존 사이클 백필, `cycle_status_annotation` 헬퍼로 상태 계산 일원화
- **Slack/GitHub 통합 매핑** (0126) — Option B(웹훅+task-bot), admin 게이팅 CRUD. ⚠️task-bot 배선은 OPS 후속

## v1.3.1-mote.5 (빌드만, mote.6에 포함) — 공개 v1 API 2차
- views · favorites · notifications(+preferences) · search(global/entity/issue) · draft work items(+변환)
- 보안리뷰 수정: draft `project_id` 멤버십 검증, favorite `get_entity_data` 워크스페이스/멤버십 스코핑

## v1.3.1-mote.4 (2026-07-03) — Free 결핍 기능 1차 + 공개 API 1차
마이그레이션 0122.
- **Private 프로젝트** (network=1, 0122)
- **Active Cycles 워크스페이스 페이지** (+ WorkspaceCyclesEndpoint 500·교차프로젝트 누수 fix)
- **간트 의존성 화살표**(시각화)
- 공개 v1 API 1차: reactions · subscribers · archive+bulk · sub-issues · description-versions · workspace labels/states · state mark-default · module-links · relation-remove
- 좌측 하단 Community 뱃지 제거, 코멘트 이미지/영상 첨부, Bulk operations UI 잠금해제
- 보안리뷰 수정: subscriber 임의구독 authZ, state mark-default 무결성

## v1.3.1-mote.2 (2026-07-03) — OIDC SSO
- generic OIDC 프로바이더 자체구현(Keycloak). 설정키 OIDC_URL_*/CLIENT_ID/SECRET (god-mode)
- 공개 v1 Pages API + 사이클 v1 API 400 백포트(upstream 9f77ea5eb)

## v1.3.1-mote.1 (2026-07-03) — 자체 이미지 최초
- 포크 최초 로컬빌드 이미지 운영 시작

---
전체 유료기능 자체구현 로드맵: `docs/mote-design/` (00 마스터 + 01~06 도메인). Phase 1 완료, Phase 2~4 백로그(PLANE 프로젝트 PLANE-37~42).
