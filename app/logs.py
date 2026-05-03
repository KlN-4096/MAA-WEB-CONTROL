from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from fastapi import HTTPException, Response
from pydantic import BaseModel, Field

from .events import EventBus
from .models import EventRecord


LogSplitMode = Literal["None", "Before", "After", "Both"]
LogWeight = Literal["Regular", "Bold"]

DEFAULT_MAX_THUMBNAILS = 100
PLACEHOLDER_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc````\x00"
    b"\x00\x00\x05\x00\x01\xa5\xf6E@\x00\x00\x00\x00IEND\xaeB`\x82"
)


class MaaLogItem(BaseModel):
    id: str
    time: str
    content: str
    color_key: str = "MessageLogBrush"
    weight: LogWeight = "Regular"
    show_time: bool = True
    tooltip: Any = None
    raw: Any = Field(default_factory=dict)


class MaaLogCard(BaseModel):
    id: str
    items: list[MaaLogItem] = Field(default_factory=list)
    thumbnail_id: str | None = None

    def payload(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "items": [item.model_dump(mode="json") for item in self.items],
            "start_time": self.items[0].time if self.items else "",
            "end_time": self.items[-1].time if self.items else "",
            "thumbnail_id": self.thumbnail_id,
            "thumbnail_url": f"/api/logs/thumbnails/{self.thumbnail_id}" if self.thumbnail_id else None,
            "show_thumbnail": self.thumbnail_id is not None,
        }


class MaaLogService:
    def __init__(self, events: EventBus, max_thumbnails: int = DEFAULT_MAX_THUMBNAILS) -> None:
        self._events = events
        self._cards: list[MaaLogCard] = []
        self._thumbnails: dict[str, bytes] = {}
        self._run_id = "current"
        self._max_thumbnails = max_thumbnails
        self._run_started_at: datetime | None = None

    def clear(self, run_id: str = "current") -> None:
        self._run_id = run_id or "current"
        self._cards.clear()
        self._thumbnails.clear()
        self._run_started_at = datetime.now(timezone.utc)
        self._events.publish(EventRecord.now("maa.log.clear", "Log cards cleared."))

    def cards(self, run_id: str = "current") -> list[dict[str, Any]]:
        if run_id not in {"", "current", self._run_id}:
            return []
        return [card.payload() for card in self._cards]

    def append(
        self,
        content: str = "",
        *,
        color_key: str = "MessageLogBrush",
        weight: LogWeight = "Regular",
        tooltip: Any = None,
        split_mode: LogSplitMode = "None",
        thumbnail: dict[str, Any] | None = None,
        raw: Any = None,
        show_time: bool = True,
    ) -> MaaLogItem | None:
        wants_thumbnail = bool((thumbnail or {}).get("capture"))
        if split_mode in {"Before", "Both"}:
            self._create_new_card()
        if not self._cards and (content or wants_thumbnail):
            self._create_new_card()
        item = self._append_item(content, color_key, weight, tooltip, raw, show_time, split_mode)
        if wants_thumbnail and self._cards:
            self._attach_thumbnail(self._cards[-1], placeholder=bool((thumbnail or {}).get("placeholder")))
        if split_mode in {"After", "Both"}:
            self._create_new_card()
        return item

    def complete_run(self, message: str) -> None:
        if self._last_content_startswith("任务已全部完成"):
            if "(用时" in message and not self._last_content_contains("(用时"):
                suffix = message.split("\n", 1)[1] if "\n" in message else ""
                self.append(suffix, color_key="SuccessLogBrush", weight="Bold")
        else:
            self.append(message, color_key="SuccessLogBrush", weight="Bold", split_mode="Both")
        self._events.publish(EventRecord.now("maa.log.run.completed", message))

    def thumbnail_response(self, thumbnail_id: str) -> Response:
        data = self._thumbnails.get(thumbnail_id)
        if data is None:
            raise HTTPException(status_code=404, detail="Thumbnail is not available.")
        return Response(content=data, media_type="image/png")

    def elapsed_text(self) -> str:
        if self._run_started_at is None:
            return "0h 0m 0s"
        seconds = max(0, int((datetime.now(timezone.utc) - self._run_started_at).total_seconds()))
        return f"{seconds // 3600}h {(seconds % 3600) // 60}m {seconds % 60}s"

    def _append_item(
        self,
        content: str,
        color_key: str,
        weight: LogWeight,
        tooltip: Any,
        raw: Any,
        show_time: bool,
        split_mode: LogSplitMode,
    ) -> MaaLogItem | None:
        if not content or not self._cards:
            return None
        item = MaaLogItem(
            id=f"{self._run_id}-item-{uuid4().hex[:10]}",
            time=datetime.now(timezone.utc).isoformat(),
            content=content,
            color_key=color_key,
            weight=weight,
            tooltip=tooltip,
            raw=raw or {},
            show_time=show_time,
        )
        card = self._cards[-1]
        card.items.append(item)
        self._publish_item(card, item, split_mode=split_mode)
        return item

    def _create_new_card(self) -> MaaLogCard | None:
        if self._cards and not self._cards[-1].items:
            return None
        card = MaaLogCard(id=f"{self._run_id}-card-{len(self._cards) + 1:03d}")
        self._cards.append(card)
        self._events.publish(EventRecord.now("maa.log.card.created", "Log card created.", detail={"card": card.payload()}))
        return card

    def attach_real_thumbnail(self, card_id: str, image_data: bytes) -> None:
        """Attach real screenshot data to an existing card by ID."""
        card = next((c for c in self._cards if c.id == card_id), None)
        if card is None:
            return
        old_thumb = card.thumbnail_id
        if old_thumb:
            self._thumbnails.pop(old_thumb, None)
        thumbnail_id = f"{self._run_id}-thumb-{uuid4().hex[:10]}"
        card.thumbnail_id = thumbnail_id
        self._thumbnails[thumbnail_id] = image_data
        self._trim_old_thumbnails()
        self._events.publish(EventRecord.now("maa.log.thumbnail.updated", "Real thumbnail attached.", detail={"card": card.payload()}))

    def _attach_thumbnail(self, card: MaaLogCard, placeholder: bool = False, image_data: bytes | None = None) -> None:
        thumbnail_id = f"{self._run_id}-thumb-{uuid4().hex[:10]}"
        card.thumbnail_id = thumbnail_id
        self._thumbnails[thumbnail_id] = image_data if image_data else PLACEHOLDER_PNG
        self._trim_old_thumbnails()
        self._events.publish(EventRecord.now("maa.log.thumbnail.updated", "Log thumbnail updated.", detail={"card": card.payload()}))

    def _trim_old_thumbnails(self) -> None:
        cards_with_thumbnails = [card for card in self._cards if card.thumbnail_id]
        overflow = len(cards_with_thumbnails) - self._max_thumbnails
        for card in cards_with_thumbnails[:max(0, overflow)]:
            if card.thumbnail_id:
                self._thumbnails.pop(card.thumbnail_id, None)
                card.thumbnail_id = None

    def _publish_item(self, card: MaaLogCard, item: MaaLogItem, split_mode: LogSplitMode) -> None:
        detail = {
            "card_id": card.id,
            "item_id": item.id,
            "split_mode": split_mode,
            "color_key": item.color_key,
            "weight": item.weight,
            "tooltip": item.tooltip,
            "raw": item.raw,
            "item": item.model_dump(mode="json"),
            "card": card.payload(),
        }
        level = _level_from_color(item.color_key)
        self._events.publish(EventRecord.now("maa.log.item", item.content, level=level, detail=detail))

    def _last_content_startswith(self, prefix: str) -> bool:
        for card in reversed(self._cards):
            for item in reversed(card.items):
                if item.content:
                    return item.content.startswith(prefix)
        return False

    def has_last_content_prefix(self, prefix: str) -> bool:
        return self._last_content_startswith(prefix)

    def _last_content_contains(self, text: str) -> bool:
        for card in reversed(self._cards):
            for item in reversed(card.items):
                if item.content:
                    return text in item.content
        return False


def _level_from_color(color_key: str) -> Literal["debug", "info", "warning", "error"]:
    if color_key == "ErrorLogBrush":
        return "error"
    if color_key == "WarningLogBrush":
        return "warning"
    if color_key == "TraceLogBrush":
        return "debug"
    return "info"
