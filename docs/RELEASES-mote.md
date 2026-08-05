# mote 포크 릴리즈 노트 (plane.motemote.co.kr)

CE v1.3.1 기반 `mote` 브랜치. 이미지 태그 `mote/plane-{backend,frontend}:v1.3.1-mote.N`.
배포: `docker compose --env-file plane.env -p plane up -d` (server3, `/srv/shared/stack/plane-server3/`).

> ⚠️ 배포 시 `--env-file plane.env` 필수 — 누락하면 인터폴레이션이 DB 비밀번호를 기본값으로 떨어뜨려 컨테이너가 인증 실패한다.

## v1.3.1-mote.51 (2026-08-05) — 문서(Pages) 저장 500 + 감사로그가 웹을 끊는 문제 fix

도트/쿠키 "plane 페이지가 잘 안들어가진다" 리포트에서 출발. 서버·로그인·이슈 API는 전부 정상이었고(12시간 5xx 0건, SSO 정상, 홈 API 전건 200) 실제 결함은 아래 3건.

- **문서 본문 저장이 100% 500** — `PageBinaryUpdateSerializer`의 `validate_description_binary` / `validate_description_html` / `update` 세 메서드가 병합 사고로 **`PageCommentSerializer` 안에 들어가 있었다**(331줄 docstring이 "Update the *page* instance"라고 말하는 게 증거). `PageBinaryUpdateSerializer`는 `serializers.Serializer`라 `update()`가 없으면 DRF가 `NotImplementedError`를 던진다 → 저장 시도 전건 500. 세 메서드를 원래 클래스로 되돌렸다.
  - 부수 피해 2건도 같이 해소: ① 페이지 저장 시 **HTML 살균(`validate_html_content`)이 아예 실행되지 않고 있었다**(#7507의 목적이 무력화), ② 잘못 붙은 `update()`가 `ModelSerializer.update()`를 가려서 **페이지 댓글 수정이 조용히 아무것도 저장하지 않았다**(`PageComment`에는 `description_*` 필드가 없다).
- **감사로그가 AMQP 채널을 죽여 웹 화면 진입이 500** — `APITokenLogMiddleware`가 요청/응답 본문을 **무제한** 복사하고 `mongo_log`가 그걸 한 번 더 복제 → 실측 **354,911,882바이트** 메시지가 RabbitMQ 한도(128MB)를 넘겨 `PRECONDITION_FAILED (406)`으로 채널이 통째로 죽었다. 그러면 같은 커넥션을 쓰는 **다음 요청**이 터진다 — Plane은 프로젝트·문서를 열 때마다 `recent_visited_task.delay()`를 부르므로 실제 증상은 `GET /api/workspaces/{slug}/projects/{id}/ → 500` + `/pages/` 499(사용자가 기다리다 포기)로 나타났다. 본문을 64KB로 캡했다(메시지 최대 ~128KB).
  - 같이 처리: `X-Api-Key`를 `headers` 블롭에서 **마스킹**(PLANE-75 일부), `StreamingHttpResponse`(문서 바이너리 다운로드)에서 `.content` 접근이 매번 AttributeError를 내던 것 차단.
- **`logger_task` 등록이 mote.50에서 유실(회귀)** — mote.49에서 넣은 `CELERY_IMPORTS`의 `"plane.bgtasks.logger_task"` 한 줄이 **배포 이미지에만 없었다**(레포에는 있음). mote.50이 stash 대피/복원을 거친 `/srv/shared/app-src/plane`에서 빌드된 결과(위 mote.50 ⚠️ 항목 참조). 코드 수정은 불필요하고 **재빌드·재배포가 곧 수정**. 재발 방지로 `CELERY_IMPORTS` 회귀 테스트를 추가했다.
- **테스트 25건 추가** — `test_page_binary_update.py`, `test_api_token_log.py`, `test_celery_imports.py`. 기준선(origin/mote) 대비 회귀 0건(89 → 114 passed, 실패·에러 동일).
- ⚠️ 남은 PLANE-75: `api_activity_logs.token_identifier`에 API 키 원문이 그대로 들어간다(감사 조인키라 이번엔 손대지 않음). 마스킹 여부는 otro 판단 대기.

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
