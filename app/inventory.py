from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .options import (
    PERMANENT_STAGES, _activity_is_open, _load_activity_stages, _load_stage_options,
    _read_json, _read_stage_activity_data,
)
from .resource_paths import resource_client_type


CORE_UNLIMITED_TIMES = 2147483647


def inventory_context(source: Path, client: str) -> dict[str, Any]:
    client = resource_client_type(client)
    now = datetime.now(timezone.utc)
    activity = (_read_stage_activity_data(source) or {}).get(client, {})
    side_story = activity.get("sideStoryStage", {})
    activity_stages = set()
    if isinstance(side_story, dict):
        for group in side_story.values():
            if isinstance(group, dict):
                activity_stages.update(str(stage.get("Value") or stage.get("Display") or "") for stage in group.get("Stages", []) if isinstance(stage, dict))
    return {
        "open_stages": {entry["value"] for entry in _load_stage_options(source, client, now_utc=now)},
        "known_stages": {entry["value"] for entry in PERMANENT_STAGES} | activity_stages,
        "activity_open": bool(_load_activity_stages(activity, now)),
        "resource_open": _activity_is_open(activity.get("resourceCollection"), now),
        "items": _read_json(source / "resource" / "item_index.json") or {},
    }


def stock_with_dual_chips(item_id: str, items: dict[str, int], definitions: dict[str, Any], convert: bool) -> int:
    count = items.get(item_id, 0)
    if convert:
        for product_id, definition in definitions.items():
            formula = definition.get("formula", {}) if isinstance(definition, dict) else {}
            if "32001" in formula and item_id in formula:
                count += items.get(product_id, 0) * int(formula[item_id])
    return count
