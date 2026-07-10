# 11 — Plane 클라우드 → 사내 셀프호스트 데이터 이관 계획 (2026-07-09)

> 대상: `app.plane.so`(ws motemote, SaaS) → `plane.motemote.co.kr`(CE v1.3.1 fork, server3).
> 이 문서는 **"가져올 수 있는가 / 어떻게 / 언제"** 에 답한다. 조사 근거는 2026-07-09 read-only 실측(클라우드 API GET + 셀프호스트 Postgres SELECT).

## TL;DR

- **가져올 수 있나?** → **부분적으로 가능.** 이슈·코멘트·링크·사이클·모듈·라벨·상태·페이지는 API로 재생성 가능. **바이트 단위 완전 복제는 불가**(클라우드=SaaS라 DB 덤프 불가). `created_at`·작성자·첨부파일·반응·활동이력은 API로 보존 안 됨.
- **지금 상태**: 7/2에 1차 이관(9프로젝트)이 있었으나 **그 이후 클라우드에 계속 쓰이는 드리프트 ≈110개 이슈**가 셀프호스트에 없음(GROWTH +61, TEAMDEV +30 집중). task-bot 운영 스크립트들이 아직 `api.plane.so`(클라우드)로 쓰고 있어 **드리프트는 지금도 증가 중**.
- **어떻게**: 재이관(redo)이 아니라 **델타만 idempotent API 재동기화**. 순서 = ① 클라우드 쓰기 차단(freeze) → ② 백업 → ③ 델타 이슈 재생성 → ④ 첨부파일 별도 이관 → ⑤ 컷오버.
- **언제**: **1단계(freeze)는 즉시** 하는 게 이득(드리프트 정지). 데이터 델타 이관은 준비(멱등 스크립트 + 자체호스트 쓰기토큰) 후 저활동 시간대 1회. 아래 §6 타임라인.

## 1. 현황 실측 (2026-07-09)

### 1.1 드리프트 (클라우드에 있고 셀프호스트에 없는 것)
클라우드=live GET `total_count`, 셀프호스트=`plane-db count(*) WHERE deleted_at IS NULL` / `max(sequence_id)`.

| 프로젝트 | 클라우드 이슈 | 클라우드 maxseq | 셀프호스트 이슈 | 셀프호스트 maxseq | 누락(추정) |
|---|---|---|---|---|---|
| GROWTH | 127 | 129 | 66 | 68 | **≈ +61** ⚠ |
| TEAMDEV | 407 | 419 | 377 | 388 | **≈ +30** |
| ALLCL | 189 | 196 | 176 | 182 | ≈ +14 (수동이관 177/178 포함) |
| STORE | 65 | 67 | 60 | 62 | ≈ +5 |
| MOTEERP | 72 | 72 | 71 | 71 | ≈ +1 |
| MOTEDIGITA / TEST / MOTE / MOTEPARTNE | 10/8/0/0 | | 10/8/0/0 | | 0 |

- **총 드리프트 ≈ 110개 이슈** (GROWTH·TEAMDEV 집중). GROWTH는 지금도 클라우드로 활발히 쓰임(`~/logs/growth-heartbeat.log`).
- **셀프호스트 전용 2 프로젝트**(클라우드에 없음): `PLANE`(47 이슈, 포크 자체 백로그) + `IDEA`(건의함, 0). **절대 덮어쓰면 안 됨.**
- 숫자는 방향성(양쪽 삭제 gap 때문에 정확 seq diff는 별도 필요).

### 1.2 1차 이관(7/2)이 어떻게 됐는지
- **API 기반 재생성**(클라우드 REST 읽기 → 포크의 확장 public v1 API 쓰기). pg 덤프/복원 아님, Plane 내장 importer 아님. **스크립트 자체는 서버에 남아있지 않음**(임시 AI 세션에서 실행 후 폐기). 결과 DB 상태로 메커니즘 확정:
  - **seq_id + 본문 보존**: 셀프호스트 `ALLCL-1` = 클라우드 `ALLCL-1` 동일 제목. 삭제 gap도 재현(seq 명시 기입).
  - **`created_at` 미보존**: 클라우드 `ALLCL-1` 생성=6/8, 셀프호스트 사본=7/2 스탬프. 전 이슈가 07-02~07-07.
  - **작성자 붕괴**: `count(DISTINCT created_by_id)=1`.
  - **첨부파일 누락**: `issue_attachments=0`(클라우드 S3 파일이 MinIO로 재호스팅 안 됨).
- **문서화된 이관 런북 없음**(메모리의 "docs 08"은 오기 — 그건 유료기능 설계).

## 2. 가져올 수 있는 것 vs 잃는 것 (API 재이관 기준)

| 데이터 | API로 재이관 | 비고 |
|---|---|---|
| 이슈(seq+제목+설명) | ✅ | 포크 확장 API가 sequence_id 명시 기입 가능 |
| 코멘트 | ✅ | 1차 때 1430건 이관됨 |
| 링크(issue_links) | ✅ | 232건 |
| 사이클·모듈·라벨·상태·페이지·멤버 | ✅ | 27·44·42·78·9·3 |
| `created_at`/`updated_at` | ❌ | API가 now로 스탬프. **직접 DB 쓰기만 강제 가능** |
| 작성자(created_by) | ❌ | API 토큰 유저로 붕괴. 직접 DB 쓰기만 보존 |
| 첨부파일 | ❌ | 클라우드 S3 → 셀프호스트 MinIO 별도 다운로드/업로드 필요 |
| 반응(reactions)·활동이력 | ❌ | API 왕복으로 유실 |

**핵심 판단**: `created_at`·작성자·활동이력까지 보존해야 하면 API로는 불가 → 셀프호스트 Postgres에 직접 쓰는 방식 필요(리스크 큼). 실용적으로는 **본문·상태·코멘트만 보존**(누가 언제는 근사)해도 업무 연속성엔 충분 → API 재동기화 권장.

## 3. 토큰·접근 인벤토리 (2026-07-09 실측)

| 대상 | 위치 | 상태 |
|---|---|---|
| 클라우드 API 토큰 `PLANE_API_TOKEN` | `/srv/shared/app-src/task-bot/.env` | ✅ 유효(HTTP 200). **드리프트 원천**(모든 `ops/plane_*` 스크립트가 `api.plane.so` 하드코딩) |
| 셀프호스트 인테이크 토큰 `PLANE_INTAKE_TOKEN` | 같은 `.env` | Slack 인테이크 웹훅 전용(일반 API 키 아님) |
| 셀프호스트 일반 API 쓰기 토큰 | — | ❌ **디스크에 없음**(`~/backups/plane-selfhost-token.txt` 부재). 이관 시 **새로 발급 필요** |
| 셀프호스트 DB 직접 | `plane-plane-db-1` | `docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" plane-plane-db-1 psql -U plane -d plane -h 127.0.0.1`(비번=`plane.env`). 소켓 peer 아님 |
| 백업 | `/srv/shared/stack/server3-data/plane-backup.sh` | ✅ 매일 `pg_dump -Fc` + uploads tar → `/data/backups/server3/plane/daily`(7/9 확인, `--restore-test` 플래그 존재) |

## 4. 권장 이관 방식 (델타 재동기화, redo 아님)

### 4.1 1단계 — 클라우드 쓰기 차단 (freeze) [최우선·즉시]
드리프트가 계속 커지므로 **원천 차단이 먼저**. `api.plane.so`로 쓰는 task-bot 운영 스크립트 4종을 셀프호스트로 리포인트:
- `ops/plane_cycle/plane_cycle_auto.py`
- `ops/plane_weekly_meeting/plane_weekly_meeting_gen.py` (경로 확인 필요)
- `ops/plane_relations.py`
- `ops/plane_snapshot/plane_snapshot.py`

각 스크립트의 `_BASE = "https://api.plane.so/api/v1/workspaces/motemote"` → `https://plane.motemote.co.kr/api/v1/workspaces/motemote` + 셀프호스트 토큰. 그리고 팀에 "이제부터 태스크는 셀프호스트에만" 공지. **이 단계만으로도 드리프트 정지 = 가장 큰 이득.**

### 4.2 2단계 — 백업 (안전망)
이관 직전 최신 덤프: `bash /srv/shared/stack/server3-data/plane-backup.sh` 실행 → `/data/backups/server3/plane/daily`. **복구 드릴 1회 필수**(스크래치 스택에 `pg_restore`, `--restore-test`). → [문서10] P1 항목과 동일.

### 4.3 3단계 — 델타 이슈 재동기화 (멱등)
- **범위**: 프로젝트별 `(클라우드 seq_id 집합) − (셀프호스트 seq_id 집합)` = 누락 seq만(≈110). GROWTH·TEAMDEV·ALLCL·STORE·MOTEERP.
- **멱등 키**: `(project, sequence_id)` 또는 `external_id` 로 skip-if-exists → 재실행해도 중복 생성 안 함.
- **쓰기 대상**: 셀프호스트 확장 API(seq_id 명시 지원). 새 셀프호스트 API 키 발급 필요.
- **보존 범위**: 제목·설명·상태·우선순위·라벨·코멘트. `created_at`/작성자는 근사(API 한계) 또는 설명에 원 메타 주석.
- **PLANE·IDEA 프로젝트 제외**(셀프호스트 전용, 클라우드에 없음).

### 4.4 4단계 — 첨부파일 이관 (별도 패스)
1차 때 완전 누락된 부분. 클라우드 이슈의 attachment signed URL 다운로드 → 셀프호스트 MinIO(`/data/plane/uploads`) 업로드 → issue_attachments row 연결. **첨부 많은 프로젝트만 선별**해도 됨(공수 대비 가치 판단).

### 4.5 5단계 — 컷오버 & 검증
- 프로젝트별 seq_id 집합 diff = 0 확인(클라우드=셀프호스트).
- 카운트 대조(이슈·코멘트).
- 클라우드 워크스페이스는 read-only 참조로 당분간 잔존(즉시 삭제 X), 안정 후 정리.

## 5. 리스크

| 리스크 | 완화 |
|---|---|
| `created_at`·작성자 이미 7/2 배치에서 유실 | API 재동기화는 신규 델타만. 과거 메타 복원은 직접 DB 쓰기만 가능(권장 안 함) |
| 멱등성 미확보 시 중복 | `(project, seq_id)`/external_id skip-if-exists 필수 |
| 셀프호스트 전용 PLANE(47)/IDEA 덮어쓰기 | 재동기화를 델타·프로젝트 스코프로 한정 |
| 첨부파일 컷오버 시 유실 | 4단계 별도 명시 이관 |
| 진행 중 드리프트(GROWTH 이미 +61) | 1단계 freeze를 **가장 먼저** |
| seq 충돌(셀프 maxseq < 클라우드) | freeze 후 이관 순서 관리 |
| 커스텀 포크 기능(Custom Fields/Teamspaces/RBAC) 단방향 | 재동기화가 이들 건드리지 않게 스코프 한정 |

## 6. 실행 타임라인 (권장)

| 시점 | 작업 | 소유 | 되돌릴 수 있나 |
|---|---|---|---|
| **즉시 (D0)** | **1단계 freeze**: task-bot 스크립트 4종 셀프호스트 리포인트 + 팀 공지 | (승인 시 Claude가 수정→검증) | 예(스크립트 revert) |
| D0 | 2단계 백업 + 복구 드릴 1회 | Claude | — |
| D0~D2 | 멱등 델타 스크립트 작성 + 셀프호스트 API 키 발급 + dry-run(생성 0, diff 리포트만) | Claude | 예(dry-run) |
| **저활동 시간대 (D2~D3)** | 3단계 델타 재동기화 실행(≈110 이슈) + 4단계 첨부(선택) | Claude(승인 후) | 부분(멱등이라 재실행 안전, 삭제는 수동) |
| D3 | 5단계 검증(seq diff=0) + 컷오버 확정 | Claude | — |
| D3+ | 클라우드 read-only 유지 → 안정 후 구독 정리 | otro | — |

> **승인 필요 지점**: (a) 1단계 freeze(운영 스크립트 수정), (b) 3단계 실제 쓰기 실행. 나머지(백업·dry-run·검증)는 read-only/안전이라 선실행 가능.

## 7. 열린 질문 (otro 결정 필요)
1. **`created_at`/작성자 보존이 중요한가?** 아니오면 API 재동기화로 충분. 예면 직접 DB 쓰기(리스크↑) 검토.
2. **첨부파일 이관 범위**: 전체 vs 최근/특정 프로젝트만 vs 생략.
3. **컷오버 후 클라우드 워크스페이스**: 언제 구독 해지/삭제할지(안정화 기간).
4. **freeze 즉시 착수 승인 여부**(드리프트가 계속 커지므로 권장).

## 참고 (재사용 커맨드)
- 클라우드 읽기: `. /srv/shared/app-src/task-bot/.env` → `curl -H "X-API-Key: $PLANE_API_TOKEN" -H "User-Agent: mote" https://api.plane.so/api/v1/workspaces/motemote/...`
- 셀프호스트 DB: `. /srv/shared/stack/plane-server3/plane.env` → `docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" plane-plane-db-1 psql -U plane -d plane -h 127.0.0.1 -c "…"`
- 포크 repo: `/srv/shared/app-src/plane`(branch `mote`) / 로컬 `~/git/plane-fork`. 백업: `/srv/shared/stack/server3-data/plane-backup.sh`.
