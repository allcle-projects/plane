# Design Spec: Structured Canvas (Phase 3, Growth Board 로드맵)

> Target repo: `plane-fork` (Plane CE v1.3.1, branch `mote`). 정본 관계: [`12-growth-board-features.md`](./12-growth-board-features.md) Phase 3의 상세 구현 스펙. 마스터 로드맵과 직교 트랙이라는 원칙은 12번 문서와 동일 승계.
>
> 이 문서는 **design spec, not implementation**. `ALREADY EXISTS`(재사용 가능한 기존 코드)와 `NET-NEW`(신규 작성)를 분리해서 인용한다. 모든 근거는 `file:line`.

---

## 0. AI 판독성 원칙 (재확인 — 이 스펙 전체를 관통하는 제약)

[`12-growth-board-features.md`](./12-growth-board-features.md) 핵심 결론 1·4에서 이미 확정:

> `CanvasCard`는 좌표 없이도 독립적으로 의미가 통해야 한다 — 카드 자체가 이슈이거나(연결), 최소 제목+본문을 가진 완결 텍스트여야 한다. 좌표만 있고 텍스트가 없는 카드는 금지.

이 스펙의 모든 API·모델 설계는 이 제약을 어기면 안 된다. 구체적으로:
- `CanvasCard` 목록 API는 `?fields=text_only` 같은 옵션 없이도 **기본 응답 자체가** 좌표 없이 읽을 수 있는 필드(`title`/`body`/`linked_issue`)를 최우선으로 노출해야 한다(좌표는 부가 필드).
- 순수 이미지만 있고 텍스트 필드가 전부 빈 카드는 생성 시점에 서버가 거부한다(§3.2).

---

## 1. Cross-cutting finding (읽기 전 먼저)

캔버스는 Plane CE에 **좌표 개념 자체가 없어 완전 신규 모델**이지만, "카드 = 이슈 참조 또는 완결 텍스트"라는 제약 덕분에 두 가지 무거운 부분을 이미 있는 기능으로 대체할 수 있다:

| 구성요소 | 상태 | 근거 |
|---|---|---|
| 카드가 이슈를 참조하는 UI/데이터 계약 | **이미 있음** — `work-item-embed` Tiptap 확장 그대로 속성 재사용 | `packages/editor/src/core/extensions/work-item-embed/extension-config.ts:11-35` |
| 대형 인터랙티브 블록을 Tiptap 노드로 심는 패턴 | **이미 있음** — `custom-video`가 `group:"block", atom:true` + React NodeView로 이미 검증됨(오늘 세션에서 확인) | `packages/editor/src/core/extensions/custom-video/extension-config.ts:33-35` |
| workspace/project 이중 스코프 + `column_order` 같은 JSONField 패턴 | **이미 있음** — `IssueView`/`WorkspaceBaseModel`이 그대로 청사진 | `apps/api/plane/db/models/view.py:60-76`, `apps/api/plane/db/models/workspace.py:189-199` |
| 카드 좌표·자유배치·줌 렌더링 | **신규** — Plane에 캔버스 렌더러 없음 | — |
| 카드-이슈 FK, 카드-카드 없음(Phase 3는 엣지 없음, Phase 4로 이연) | **신규 모델**이지만 필드 수 적음 | — |

즉 이 스펙의 실제 신규 작업은 (a) `Canvas`/`CanvasCard` 모델+API, (b) 캔버스 렌더러(줌+드래그) 프론트, (c) 이 둘을 잇는 Tiptap `custom-canvas` 임베드 블록 — 세 가지로 좁혀진다.

---

## 2. 데이터 모델 (신규)

### 2.1 `Canvas`

```python
# apps/api/plane/db/models/canvas.py (신규 파일)
from .workspace import WorkspaceBaseModel
from django.db import models


class Canvas(WorkspaceBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # 페이지에 임베드된 캔버스라면 원본 페이지를 가리킨다(옵션).
    # 페이지 없이 프로젝트/워크스페이스에 독립 캔버스로 존재하는 것도 허용.
    page = models.ForeignKey(
        "db.Page", on_delete=models.CASCADE, null=True, blank=True, related_name="canvases"
    )
    # 줌/뷰포트 저장(사람 편의 — AI 조회 경로에는 영향 없음)
    viewport = models.JSONField(default=dict, blank=True)  # {"x":0,"y":0,"zoom":100}
    archived_at = models.DateTimeField(null=True)

    class Meta:
        db_table = "canvases"
        ordering = ("-created_at",)
```

- `WorkspaceBaseModel` 상속으로 workspace 필수+project nullable 이중 스코프가 **자동으로** 따라온다. `IssueView`와 동일 패턴이라 워크스페이스 전역 캔버스/프로젝트 캔버스를 모델 하나로 커버 — Phase 2에서 워크스페이스뷰가 `IssueView` 재사용만으로 됐던 것과 같은 이유(`apps/api/plane/db/models/view.py:60-61`).
- `page` FK는 **필수가 아니다.** Tiptap 블록으로 페이지 안에 심을 수도 있고(§4), 독립 엔티티로 프로젝트 사이드바에 노출할 수도 있다(§5, MVP 제외).

### 2.2 `CanvasCard`

```python
class CanvasCard(WorkspaceBaseModel):
    canvas = models.ForeignKey(Canvas, on_delete=models.CASCADE, related_name="cards")

    # 좌표 — 사람용 부가 메타데이터. AI 조회 시 옵션 필드(§3.1).
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)
    width = models.FloatField(default=280)
    height = models.FloatField(default=160)

    # AI 판독성 핵심 필드 — 최소 하나는 값이 있어야 카드가 존재할 수 있다(§3.2).
    linked_issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, null=True, blank=True, related_name="canvas_cards"
    )
    title = models.CharField(max_length=255, blank=True)
    body = models.TextField(blank=True)  # 완결된 텍스트. 좌표 없이도 그대로 읽힌다.

    label = models.ForeignKey(
        "db.Label", on_delete=models.SET_NULL, null=True, blank=True, related_name="canvas_cards"
    )
    color = models.CharField(max_length=20, blank=True)  # 사람용 시각 분류, AI 무시

    sort_order = models.FloatField(default=65535)  # 카드 목록 API 기본 정렬(좌표 대신)

    class Meta:
        db_table = "canvas_cards"
        ordering = ("sort_order",)
```

- `linked_issue`는 `work-item-embed`가 쓰는 `entity_identifier`(문자열 식별자) 대신 **진짜 FK**로 설계한다 — 캔버스는 서버 사이드 모델이라 임베드 확장의 클라이언트 attribute 문자열 계약을 그대로 가져올 필요가 없고, FK가 있으면 `select_related("linked_issue")`로 N+1 없이 한 번에 텍스트를 가져올 수 있다(§3.1 응답 예시).
- `title`+`body`는 `linked_issue`가 없을 때만 의미 있는 "순수 텍스트 카드" — Phase 3 스펙의 "카드 자체가 이슈이거나(연결), 최소 제목+본문을 가진 완결 텍스트여야 한다"를 그대로 필드로 옮긴 것.

### 2.3 마이그레이션

다음 여유 번호는 `0146`이지만, **오늘 세션에서 `manage.py makemigrations --check`가 `issuetimer` 제약조건 관련 미생성 마이그레이션(0146 후보)을 이미 발견**했다(이번 작업과 무관한 기존 drift, 손대지 않고 그대로 둠 — [[project_growth_board_ai_readability_roadmap_2026_07_15]] 메모리 참고). 실제 착수 시 `makemigrations` 직전에 번호 재확인 필수 — 그 drift가 먼저 정리됐는지, 아니면 `0147`로 밀어야 하는지 그때 실측.

---

## 3. API (신규)

### 3.1 엔드포인트

`apps/api/plane/app/views/canvas/` 신규 디렉토리, `page/` 뷰 디렉토리 구조를 그대로 따른다(`apps/api/plane/app/views/page/base.py` 패턴 — `comment.py`/`version.py`처럼 서브리소스별 파일 분리).

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET/POST` | `/workspaces/<slug>/canvases/` | 워크스페이스 전역 캔버스 목록/생성 |
| `GET/POST` | `/workspaces/<slug>/projects/<project_id>/canvases/` | 프로젝트 스코프 캔버스 목록/생성 |
| `GET/PATCH/DELETE` | `/workspaces/<slug>/canvases/<id>/` | 캔버스 상세 |
| `GET/POST` | `/workspaces/<slug>/canvases/<id>/cards/` | 카드 목록/생성 |
| `PATCH/DELETE` | `/workspaces/<slug>/canvases/<id>/cards/<card_id>/` | 카드 수정(좌표 이동 포함)/삭제 |

카드 목록 응답이 AI 판독성 원칙(§0)을 지키는 형태 — 좌표는 있지만 부가 필드로 뒤에 위치, 텍스트가 먼저:

```json
{
  "id": "...",
  "text": "PDP→장바구니 이탈률 38% (GROWTH-126 근거)",
  "linked_issue": { "id": "...", "identifier": "GROWTH-126", "name": "퍼널 이탈 전수분석" },
  "label": "퍼널이탈",
  "position": { "x": 120, "y": 80, "width": 280, "height": 160 }
}
```

`text` 필드는 서버가 계산해서 내려준다 — `linked_issue`가 있으면 이슈 제목+본문 앞부분을, 없으면 `title`+`body`를 합성. 프론트가 좌표를 안 쓰는 클라이언트(다른 AI 에이전트가 이 API를 직접 호출하는 경우)여도 `position`을 무시하고 `text`만 읽으면 완결된다 — 이게 "캔버스 API가 카드 목록을 좌표 없이도 순수 텍스트 배열로 반환"한다는 로드맵 문서 원칙의 실제 구현.

### 3.2 서버 사이드 검증 (AI 판독성 강제)

```python
# serializer validate()
def validate(self, data):
    has_link = data.get("linked_issue") is not None
    has_text = bool(data.get("title", "").strip()) or bool(data.get("body", "").strip())
    if not has_link and not has_text:
        raise serializers.ValidationError(
            "카드는 linked_issue 또는 title/body 중 하나는 있어야 합니다 — "
            "좌표만 있는 카드는 AI 판독 불가능하여 금지됩니다."
        )
    return data
```

이 검증이 §0의 "순수 이미지+화살표 카드 금지"를 API 레벨에서 실제로 막는 지점이다 — 로드맵 문서는 원칙만 선언했고, 이 스펙에서 처음으로 강제 지점을 코드로 명시한다.

### 3.3 Export 재사용 가능성

오늘 완료한 CSV export 패턴(`_apply_column_order`, `apps/api/plane/bgtasks/export_task.py`)은 캔버스 카드 목록에도 그대로 적용 가능 — `CanvasCard.text`를 한 컬럼으로 export하면 "캔버스 내용을 스프레드시트로" 같은 후속 요청에 이미 대비된 구조다. **이번 Phase 3 MVP 범위에는 포함하지 않음** — 필요 시 후속 P-item으로 별도 스펙.

---

## 4. 프론트 — Tiptap 임베드 블록

### 4.1 `custom-canvas` 확장 (NET-NEW, `custom-video` 패턴 그대로 복제)

```
packages/editor/src/core/extensions/custom-canvas/
  extension-config.ts   # custom-video/extension-config.ts:33-35 그대로 — group:"block", atom:true
  extension.tsx
  components/
    node-view.tsx        # 캔버스 렌더러 마운트 지점
    block.tsx             # placeholder/로딩 상태
  types.ts
```

`extension-config.ts`는 `custom-video`(오늘 검증한 패턴)와 구조가 동일 — `attrs`만 다르다:

```ts
addAttributes() {
  return {
    canvas_id: { default: undefined },
  };
},
parseHTML() {
  return [{ tag: "canvas-component" }];
},
renderHTML({ HTMLAttributes }) {
  return ["canvas-component", mergeAttributes(HTMLAttributes)];
},
```

`CORE_EXTENSIONS` enum(`packages/editor/src/core/constants/extension.ts:7`)에 `CUSTOM_CANVAS` 추가, `extensions.ts`의 확장 등록 배열(`custom-video` 옆)에 추가.

### 4.2 캔버스 렌더러 (NET-NEW, 신규 개발 — MVP 범위)

- 라이브러리: 자체 구현(줌+드래그만이라 무거운 캔버스 라이브러리 불필요) — `transform: scale()` + `translate()` 컨테이너 하나, 카드는 `position: absolute`.
- 줌 범위 20~200%(로드맵 문서 MVP 범위 그대로), 휠+핀치 제스처.
- 카드 드래그 시 `PATCH .../cards/<id>/`로 `x`/`y`만 갱신 — Phase 2 컬럼 이동 버튼과 동일하게 낙관적 업데이트(optimistic update) 후 실패 시 롤백.
- **명시적 MVP 제외**(로드맵 문서 승계): 실시간 협업(WebSocket 동시편집), 무한캔버스(경계 없는 좌표), 그리드 스냅.

### 4.3 카드 생성 UX

- "+ 카드 추가" → 모달에서 두 탭: **"이슈 연결"**(기존 이슈 검색 — `work-item-embed`가 쓰는 이슈 검색 컴포넌트 재사용 가능한지 확인 필요, `packages/editor/src/core/extensions/work-item-embed/` 주변 컴포넌트) / **"텍스트 카드"**(제목+본문 직접 입력).
- 순수 이미지 첨부만 하고 텍스트 없이 저장 시도 시 §3.2 서버 검증이 400을 반환 → 프론트는 "카드에 제목이나 본문을 최소 한 줄 입력해주세요" 에러 표시.

---

## 5. MVP 범위 확정 (로드맵 문서 승계 + 이번 스펙에서 구체화)

**포함**:
- Canvas/CanvasCard 모델+API(§2, §3)
- 카드 자유배치(드래그)+줌 20~200%(§4.2)
- 이슈 연결 카드 / 텍스트 카드 2종
- AI 판독성 서버 검증(§3.2)

**명시적 제외**(다음 Phase 또는 별도 P-item):
- 실시간 협업, 무한캔버스, 그리드 스냅(로드맵 문서 원 범위)
- 카드-카드 엣지/관계선(Phase 4로 이연 — `CanvasEdge` 모델은 Phase 4 스펙에서)
- 캔버스를 페이지 임베드 없이 독립 사이드바 엔티티로 노출하는 것(2.1의 `page` nullable 필드는 미리 만들어두되, 프로젝트 사이드바 UI 노출은 이번 범위 밖)
- 카드 export(§3.3, 구조는 대비하되 구현 안 함)

---

## 6. 열린 질문 (착수 전 otro 확인)

1. **카드-이슈 연결 시 원본 이슈 데이터 갱신 반영**: 이슈 제목이 나중에 바뀌면 카드의 `text`도 그때그때 재계산(FK 참조라 자동 반영됨, §2.2 설계상 기본값)할지, 아니면 카드 생성 시점 스냅샷으로 고정할지 — 기본 설계는 "항상 최신"(FK 참조 방식)이지만, "회의 당시 상태를 남기고 싶다"는 니즈가 있으면 스냅샷 필드 추가 필요.
2. **캔버스 소유 스코프**: 워크스페이스 전역 캔버스(그로스 OS 같은 범용 대시보드용)와 프로젝트 캔버스(특정 프로젝트 전용) 둘 다 지금 설계(`WorkspaceBaseModel`)로 커버되는데, UI 진입점을 어디에 둘지(사이드바 신규 메뉴 vs 기존 페이지 안에서만 임베드) 결정 필요 — §5에서 "독립 사이드바 노출은 범위 밖"으로 잠정 제외했지만 실사용 니즈에 따라 앞당길 수 있음.
3. **마이그레이션 번호**: §2.3에서 언급한 `issuetimer` drift가 이번 착수 시점까지 안 풀렸으면 번호 재조정 필요.
