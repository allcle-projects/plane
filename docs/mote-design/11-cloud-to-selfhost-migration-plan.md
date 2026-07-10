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

### 2.1 라이브 feasibility 검토 (2026-07-10, read-only 실측)

> otro 주말 계획 = **클라우드의 모든 데이터(워크아이템·페이지 등)를 셀프호스트로 전량 가져오기**. 아래는 "가져올 수 있는가"를 공개 API GET으로 직접 찔러 확인한 결과. **쓰기 0건.**

| 데이터 타입 | 공개 API로 pull | 실측 |
|---|---|---|
| 워크아이템(이슈) | ✅ 전량 | 필드: `name·description_html·description_binary·sequence_id·priority·state·assignees·labels·parent·cycle_id·start_date·target_date·created_at·created_by·external_id` 등 노출. GROWTH 135건 페이징 확인 |
| **페이지(위키)** | ✅ **본문까지** | `/pages/`(워크스페이스 17) + `/projects/{id}/pages/`(프로젝트별). detail에 `description_binary`(Yjs 편집원본 base64) + `description_html`(2350자 실HTML) + `description_json` 모두 존재 → **편집원본 그대로 이관 가능**(HTML 근사 아님) |
| 이슈 코멘트 | ✅ | `/issues/{id}/comments/` count 확인 |
| 이슈 링크 | ✅ | `/issues/{id}/links/` |
| 이슈 첨부 | ✅ 목록 O | `/issues/{id}/issue-attachments/` 응답 O. 파일 바이너리는 presigned S3 다운로드 후 재업로드 필요 |
| sub-issue 계층 | ✅ | 전용 `/sub-issues/`는 404지만 이슈 `parent` 필드로 복원 |
| 활동이력 | ✅ 조회 O | `/issues/{id}/activities/`. 단 시스템 감사로그라 **재현 이관 부적합**(제외 권장) |
| 사이클·모듈·상태·라벨·멤버 | ✅ | 프로젝트별 전부 200 |
| 컬렉션(페이지 폴더) | ✅ | 페이지에 `collection_id` 노출 |

**READ vs WRITE 구분(위 §2 표의 `❌`는 WRITE 기준)**: `created_at`/`created_by`는 **읽기로는 다 나온다**. 잃는 건 **재생성(POST) 시점** — 공개 POST가 created_at 무시·작성자를 토큰소유자로 스탬프하기 때문. 원본 타임스탬프/작성자까지 보존하려면 (a) 셀프호스트 **직접 DB write**, 또는 (b) 포크 확장 API가 `created_at`/`external_id` 명시 기입을 받아주는지 확인 후 사용. **이슈에 `external_id`/`external_source` 필드가 있어 external_id=클라우드 UUID로 멱등 재이관(재실행 중복방지) 가능.**

**결론**: 워크아이템·페이지(본문 포함) 포함 **클라우드의 거의 모든 데이터가 공개 API로 pullable**. 제약은 "가져오기(READ)"가 아니라 **"자체호스트에 쓸 때(WRITE)"** 있음 → §2.2.

### 2.2 WRITE 쪽 계약 실측 (2026-07-10, 포크 API 코드 확인)

> 자체호스트 포크 공개 v1 API의 **생성(create) serializer/view**를 직접 읽어 확정. 이게 스크립트가 보존할 수 있는 것의 실제 상한. 정본 스크립트+런북 = `scripts/plane-migration/`(dry-run 기본).

| 항목 | WRITE 보존 | 근거 |
|---|---|---|
| 제목·description_html·우선순위·상태·라벨·담당자·일정·parent | ✅ | 이슈 create serializer 수용 |
| **`created_at`/`created_by`** | ✅ 보존됨 | view가 save 후 세팅. 단 `created_by`는 자체호스트 유저 id여야 → **이메일로 매핑**(`/members/`), 미스매치 시 토큰 유저로 폴백 |
| `external_id`/`external_source` | ✅ | 이슈·코멘트·라벨 수용 → **멱등 재이관**(재실행 skip) 가능 |
| **`sequence_id`(이슈 번호)** | ❌ **공개 API로 불가** | `Issue.save()`가 `last_seq+1`로 덮음. **연속 gap 없는 프로젝트만 우연히 번호 일치**(GROWTH·ALLCL·STORE·MOTEERP 예상 일치). **TEAMDEV는 gap 있어 번호 어긋남.** 정확 번호 보존은 **직접 DB write만**(risky, 미승인 경로). 검증은 번호일치가 아니라 **커버리지(누락 0)** 기준 |
| **페이지 본문** | ⚠️ **HTML만** | 페이지 create serializer는 `name·description_html·access`만 수용. **`description_binary`(Yjs) 못 받음** → 텍스트는 보존되나 협업 편집 원본/일부 임베드 유실. **`external_id` 없음 → 이름으로만 dedup**(리네임 재실행 시 중복 위험). **워크스페이스-레벨(프로젝트 미연결) 페이지는 create 불가** → 수동 |
| 첨부파일 | ⚠️ 별도 패스 | presigned 다운로드→재업로드(느림, 선택) |
| 이슈 링크 | ⚠️ `external_id` 없음 → URL로 dedup | 중복 URL은 서버 409 |
| 반응·활동이력 | ❌ | 재현 부적합(제외) |

**주말 결정 필요**: (1) 이슈 번호 정확 보존이 필요하면(예: 외부에서 TEAMDEV-395 식 참조) 공개 API론 부족 → 직접 DB write 경로 별도 검토·승인. 아니면 커버리지 기준 수용. (2) 페이지 협업본문(binary) 보존 필요 여부 — 필요시 직접 DB write, 아니면 HTML로 충분.

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
- **범위**: 프로젝트별 `(클라우드 seq_id 집합) − (셀프호스트 seq_id 집합)` = 누락 seq만. **7/10 정밀 실측 = 총 123건**: GROWTH 68(seq 69–136)·TEAMDEV 33(389–410 일부 gap)·ALLCL 15(183–197)·STORE 5(63–67)·MOTEERP 2(72–73). (전량 재이관을 택하면 이미 있는 것은 external_id 멱등으로 skip.)
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

> **가져올 수 있는가? = 예 (2026-07-10 §2.1 라이브 확인).** 워크아이템·페이지(본문 포함) 전량 pullable. 남은 건 아래 정책 결정뿐. **주말 실행 예정 — 그 전 착수 금지.**

1. **경로 선택 = 공개 API vs 직접 DB-write** (§8 검토 완료). 이슈 번호(seq_id)·페이지 Yjs 본문 보존이 필요하면 **DB-write**(§8, 이 팀은 번호 인용 잦아 권고). created_at/작성자는 양쪽 다 이메일매핑으로 보존됨.
2. **첨부파일 이관 범위**: 전체 vs 최근/특정 프로젝트만 vs 생략. (파일별 S3 다운로드→재업로드 공수)
3. **컷오버 후 클라우드 워크스페이스**: 언제 구독 해지/삭제할지(안정화 기간).
4. **freeze 착수 시점**: 주말 이관과 함께 할지, 그 전에 먼저 드리프트만 멈출지.
5. **범위 = 전량 vs 델타**: otro 의사 = "클라우드 모든 데이터 다 가져오기". 실무상 셀프호스트가 이미 7/2 이관분 보유(ALLCL 182·TEAMDEV 388 등) → **external_id 멱등 전량 재이관**(있으면 skip)이 안전. 순수 wipe-and-redo는 셀프호스트 전용 PLANE/IDEA·커스텀 포크데이터 유실 위험이라 **비권장**.

### 남은 선결 블로커 (주말 실행 전 준비)
- **셀프호스트 일반 API 쓰기 토큰 발급** (현재 디스크에 없음 — §3). Django `APIToken`/관리 커맨드로 발급.
- **멱등 델타/전량 재이관 스크립트 작성** + dry-run(생성 0, diff 리포트만).
- **복구 드릴 1회**(백업은 매일 있음, 검증된 restore 이력만 부재 — 문서10 P1).
- 페이지 이관은 `description_binary`(Yjs) 그대로 write 하는 경로 확인 필요(포크 페이지 생성 API가 binary 수용하는지).

## 8. 대안 경로 — 직접 DB write (seq_id·작성자·페이지 binary 완전 보존) [2026-07-10 검토]

공개 API로는 §2.2의 3가지가 유실된다: **이슈 번호(seq_id)**, **페이지 협업본문(Yjs binary)**, (일부) 작성자. otro 요청으로 **DB 직접 쓰기 경로**를 스키마·모델 코드로 검토함. 결론: **기술적으로 완전 가능하고, 이 팀 상황에선 리스크가 낮다.** 단 공개 API보다 손이 많이 가고 안전망(DB 제약)이 적어 신중 실행 필요.

### 8.1 왜 되는가 — seq_id 배정 메커니즘
`Issue.save()`는 **생성 시(`self._state.adding`)** advisory lock 잡고 `IssueSequence` 최대값+1로 `sequence_id`를 **무조건 덮어씀**(내가 세팅해도 무시). 그래서 공개 API·ORM `.save()` 모두 번호 보존 불가.
→ **Django `bulk_create()`는 `save()`도 signal도 호출하지 않는다.** 따라서 `sequence_id`를 명시한 채 `Issue.objects.bulk_create([...])` 하면 **그대로 들어간다.** 대신 매칭되는 `IssueSequence(issue, sequence=seq_id, project, workspace)` 행을 **수동 bulk_create** 해야 함(정상 경로에선 save()가 만들어 줌).

### 8.2 스키마 실측 (2026-07-10, 자체호스트 DB)
- **`issues` 유니크 제약 = PK(id) 뿐** — (project, sequence_id) DB 유니크가 **없음**(앱 레벨 advisory lock만). → 번호 충돌 시 DB가 안 막아줌 → **external_id 사전필터로 중복 방지 필수**(안전망을 스크립트가 대신).
- **충돌 없음(실측)**: 델타가 전부 자체호스트 max seq **위쪽**(GROWTH 68→69~136·ALLCL 182→183~197·STORE 62→63~67·MOTEERP 71→72~73·TEAMDEV 388→389~410). 기존 번호와 안 겹침 → 안전.
- **`issue_versions` 0행(822 이슈)** → IssueVersion 미사용 → bulk_create가 version-sync signal 건너뛰어도 **무해**(오히려 알림·활동로그 노이즈 없음 = 이관에 바람직).
- **`issues`/`pages` 둘 다 `external_id`·`external_source`·`description_binary(bytea)` 보유** → 이슈·**페이지 모두** 멱등 + **binary 완전 보존**(공개 API 페이지엔 external_id/binary 둘 다 없었음 — DB-write만의 이점).
- issues NOT NULL: `name·description_json(jsonb)·description_html(text)·priority·sequence_id·sort_order·is_draft·project_id·workspace_id·created_at·updated_at`. 페이지 NOT NULL 추가: `owned_by_id·access·color·view_props·logo_props·is_global·sort_order`. `project_pages`(page_id·project_id·workspace_id) 링크 테이블 별도.
- issue_comments NOT NULL: `comment_html·comment_json·comment_stripped·access`(→ stripped는 html에서 파생).

### 8.3 쓰기 대상 테이블 (per 프로젝트, transaction.atomic)
1. `issues` — id=uuid4, **sequence_id=클라우드값**, name, description_json/html/stripped, description_binary=`base64decode(클라우드 description_binary)`, priority, state_id=**이름매핑**, created_by_id=**이메일매핑**(없으면 NULL), created_at/updated_at=클라우드값, external_id=클라우드 uuid, external_source=`plane-cloud`, sort_order, is_draft.
2. `issue_sequences` — issue_id, sequence=seq_id, project, workspace, deleted=false.
3. `issue_assignees`·`issue_labels` — 매핑된 id로 bulk_create(라벨 없으면 생성).
4. `issue_comments` — comment_html/json/stripped, actor_id·created_by_id=이메일매핑, created_at=원본, external_id.
5. `issue_links` — url dedup.
6. **2차 패스**: parent_id 업데이트(모든 이슈 존재 후).
7. **페이지**: `pages`(description_binary 포함, owned_by_id=이메일매핑 or 이관유저, external_id) + `project_pages` 링크. 워크스페이스-글로벌 페이지는 `is_global=true`.

### 8.4 실행 방식 (권장)
- **In-container Django ORM 스크립트**: `docker exec plane-api-1 python manage.py shell` 또는 standalone `django.setup()` 스크립트. 순수 SQL보다 **타입·FK 안전**하고 bulk_create가 seq 보존.
- **advisory lock 불필요**: freeze로 단일 writer 보장 시 동시성 없음.
- **dry-run 기본**: 카운트·매핑 미스(무매칭 state/label/user) 리포트만 → `--execute`로만 실제 삽입.
- **프로젝트별 atomic 트랜잭션** → 실패 시 그 프로젝트만 롤백.

### 8.5 리스크 & 완화
| 리스크 | 완화 |
|---|---|
| DB에 (project,seq) 유니크 없음 → 중복 삽입 가능 | external_id 사전필터 + dry-run 카운트 검토. 델타가 max 위쪽이라 실질 충돌 0 |
| signal 우회로 부수효과 누락(검색벡터·activity·notification) | description_stripped는 저장컬럼이라 직접 채움. activity/notification 누락은 이관에 바람직. IssueVersion 미사용 확인됨 |
| FK 무결성(state/user 무매핑) | state 이름 무매칭 시 생성 or 기본상태 폴백, user 무매칭 시 created_by NULL(허용). dry-run이 미매핑 리포트 |
| 페이지 owned_by_id NOT NULL | 이메일 매핑 실패 시 이관 유저로 폴백 |
| 잘못 삽입 롤백 | 사전 백업(§4.2) + external_source=`plane-cloud` 태그로 선별 soft-delete 가능 |
| collaborative(Yjs) 문서 동기화 | binary는 넣지만 live 서버(hocuspocus) 캐시와 정합은 페이지 최초 오픈 시 재수화 — 검증 필요 |

### 8.6 API vs DB-write 선택 매트릭스
| 원하는 것 | 공개 API | 직접 DB-write |
|---|---|---|
| 본문·상태·라벨·담당자·코멘트 | ✅ | ✅ |
| created_at/작성자 | ✅(이메일매핑) | ✅(이메일매핑) |
| **이슈 번호(seq_id) 정확 보존** | ❌ | ✅ |
| **페이지 Yjs 협업본문(binary)** | ❌(HTML만) | ✅ |
| **페이지 멱등(external_id)** | ❌(이름 dedup) | ✅ |
| 구현·검증 공수 | 낮음 | 중간(스키마 정합·트랜잭션) |
| 안전망(DB 제약·signal) | 높음(정식경로) | 낮음(스크립트가 책임) |

**권고**: 이슈 번호를 외부에서 참조(예: 슬랙·문서에 `TEAMDEV-395`)하거나 페이지 협업본문 보존이 중요하면 **DB-write 채택**. 이 팀은 번호로 태스크를 자주 인용하므로(예: ALLCL-177/178 사건) **DB-write 경로가 실질적으로 더 적합**. 실행 전 **복구 드릴 1회 필수**(안전망이 백업뿐). 스캐폴드=`scripts/plane-migration/11_dbwrite_issues.py`(dry-run 기본, in-container 실행).

## 참고 (재사용 커맨드)
- 클라우드 읽기: `. /srv/shared/app-src/task-bot/.env` → `curl -H "X-API-Key: $PLANE_API_TOKEN" -H "User-Agent: mote" https://api.plane.so/api/v1/workspaces/motemote/...`
- 셀프호스트 DB: `. /srv/shared/stack/plane-server3/plane.env` → `docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" plane-plane-db-1 psql -U plane -d plane -h 127.0.0.1 -c "…"`
- 포크 repo: `/srv/shared/app-src/plane`(branch `mote`) / 로컬 `~/git/plane-fork`. 백업: `/srv/shared/stack/server3-data/plane-backup.sh`.
