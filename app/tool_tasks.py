from __future__ import annotations

from typing import Any

from .models import AppendCall, ToolRequest


TOOL_TASKS = {
    "recruit_calc": ("Recruit", {"times": 0, "confirm": [-1]}),
    "depot": ("Depot", {}), "operbox": ("OperBox", {}),
    "gacha_once": ("Custom", {"task_names": ["GachaOnce"]}),
    "gacha_ten": ("Custom", {"task_names": ["GachaTenTimes"]}),
    "custom": ("Custom", {}),
    "material_synthesis": ("Custom", {"task_names": ["MiniGame@MaterialSynthesis@Begin"]}),
    "auto_potential": ("Custom", {"task_names": ["MiniGame@AutoRaisePotential@Begin"]}),
    "cursed_relic": ("Custom", {"task_names": ["MiniGame@CursedRelic@Begin"]}),
    "pixel_paint": ("Custom", {"task_names": ["MiniGame@PixelPaint@Begin"]}),
}


def tool_append_call(request: ToolRequest) -> AppendCall:
    if request.tool not in TOOL_TASKS:
        raise ValueError(f"Unknown tool: {request.tool}")
    task_type, defaults = TOOL_TASKS[request.tool]
    params: dict[str, Any] = {**defaults, **request.params}
    if request.tool == "auto_potential":
        params = {**defaults, "params": {"auto_raise_potential": {"use_normal_token": request.params.get("use_normal_token") is True}}}
    if request.tool in {"material_synthesis", "cursed_relic"}:
        params = dict(defaults)
    if request.tool == "pixel_paint":
        groups = request.params.get("groups")
        if not isinstance(groups, list) or not 1 <= len(groups) <= 40:
            raise ValueError("像素画需要 1–40 个颜色组")
        points_seen: set[tuple[int, int]] = set()
        for group in groups:
            if not isinstance(group, dict) or type(group.get("color")) is not int or not 0 <= group["color"] < 40:
                raise ValueError("像素画颜色编号无效")
            if not isinstance(group.get("points"), list) or not 1 <= len(group["points"]) <= 576:
                raise ValueError("像素画坐标列表无效")
            for point in group["points"]:
                if not isinstance(point, list) or len(point) != 2 or any(type(v) is not int or not 0 <= v < 24 for v in point):
                    raise ValueError("像素画坐标必须位于 24×24 网格")
                if tuple(point) in points_seen:
                    raise ValueError("像素画坐标重复")
                points_seen.add(tuple(point))
        delay = request.params.get("grid_delay", 0)
        if type(delay) is not int or not 0 <= delay <= 5000:
            raise ValueError("每格延迟须为 0–5000 毫秒")
        params = {**defaults, "params": {"pixel_paint": {"groups": groups, "grid_delay": delay, "swipe": request.params.get("swipe", True) is True}}}
    return AppendCall(task_id=f"tool-{request.tool}", type=task_type, params=params)
