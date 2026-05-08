from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib import request as urlrequest
from urllib.error import URLError

from .models import CopilotInfo, CopilotOperatorInfo


PRTS_PLUS_API = "https://prts.plus/api/v1/copilot/get/{id}"
PRTS_PLUS_URL_PATTERNS = [
    re.compile(r"^maa://(\d+)\b", re.IGNORECASE),
    re.compile(r"prts\.plus/(?:copilot|copilot/operation|copilots?)/(\d+)", re.IGNORECASE),
    re.compile(r"copilot[_-]?id[=:](\d+)", re.IGNORECASE),
    re.compile(r"^\s*(\d{1,9})\s*$"),
]


class CopilotResolveError(RuntimeError):
    """Raised when a copilot code cannot be resolved into a usable file."""


def extract_copilot_id(code: str) -> int | None:
    text = (code or "").strip()
    if not text:
        return None
    for pattern in PRTS_PLUS_URL_PATTERNS:
        match = pattern.search(text)
        if match:
            try:
                return int(match.group(1))
            except (TypeError, ValueError):
                continue
    return None


def resolve(code: str, cache_dir: Path) -> tuple[Path, CopilotInfo]:
    """Resolve a mystery code or local path to a JSON file + extracted metadata.

    - "maa://12345" / "12345" / "https://prts.plus/copilot/12345" → download from prts.plus.
    - Anything else is treated as a local path; the file must already exist.
    """
    raw = (code or "").strip()
    if not raw:
        raise CopilotResolveError("作业路径或神秘代码不能为空。")
    copilot_id = extract_copilot_id(raw)
    if copilot_id is not None:
        path = _download_copilot(copilot_id, cache_dir)
        info = _parse_copilot_metadata(path)
        info.source = "prts.plus"
        info.upstream_id = copilot_id
        return path, info
    candidate = Path(raw)
    if not candidate.exists():
        raise CopilotResolveError(f"作业文件不存在：{raw}")
    info = _parse_copilot_metadata(candidate)
    info.source = "local"
    return candidate, info


def _download_copilot(copilot_id: int, cache_dir: Path) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / f"maa-prts-{copilot_id}.json"
    if target.exists() and target.stat().st_size > 0:
        return target
    url = PRTS_PLUS_API.format(id=copilot_id)
    req = urlrequest.Request(url, headers={"User-Agent": "maa-web-control/1.0"})
    try:
        with urlrequest.urlopen(req, timeout=15) as response:
            payload_bytes = response.read()
    except URLError as exc:
        raise CopilotResolveError(f"作业站请求失败：{exc.reason}") from exc
    except Exception as exc:
        raise CopilotResolveError(f"作业站请求出错：{exc}") from exc
    try:
        wrapper = json.loads(payload_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CopilotResolveError("作业站返回非 JSON 数据。") from exc
    data = wrapper.get("data") if isinstance(wrapper, dict) else None
    if not isinstance(data, dict):
        raise CopilotResolveError("作业站返回缺少 data 字段。")
    content = data.get("content")
    if not isinstance(content, str) or not content.strip():
        raise CopilotResolveError(f"作业 #{copilot_id} 内容为空。")
    try:
        copilot_json = json.loads(content)
    except json.JSONDecodeError as exc:
        raise CopilotResolveError(f"作业 #{copilot_id} 内容不是合法 JSON。") from exc
    target.write_text(
        json.dumps(copilot_json, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if isinstance(data.get("rating_level"), int):
        target.with_suffix(".meta.json").write_text(
            json.dumps(
                {
                    "id": copilot_id,
                    "rating_level": data.get("rating_level"),
                    "uploader": data.get("uploader") or "",
                    "stage_name": data.get("stage_name") or "",
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
    return target


def _parse_copilot_metadata(path: Path) -> CopilotInfo:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise CopilotResolveError(f"无法读取作业文件：{exc}") from exc
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise CopilotResolveError(f"作业文件不是合法 JSON：{exc}") from exc
    if not isinstance(data, dict):
        raise CopilotResolveError("作业文件根节点不是对象。")
    info = CopilotInfo()
    info.stage_name = _str(data.get("stage_name"))
    doc = data.get("doc") if isinstance(data.get("doc"), dict) else {}
    info.title = _str(doc.get("title"))
    info.details = _str(doc.get("details"))
    minimum_required = _str(data.get("minimum_required"))
    info.minimum_required = minimum_required
    if isinstance(data.get("difficulty"), int):
        info.difficulty = int(data["difficulty"])
    opers_raw = data.get("opers")
    if isinstance(opers_raw, list):
        opers: list[CopilotOperatorInfo] = []
        for item in opers_raw:
            if isinstance(item, dict):
                name = _str(item.get("name"))
                skill = item.get("skill")
                opers.append(CopilotOperatorInfo(
                    name=name,
                    skill=int(skill) if isinstance(skill, int) else 1,
                ))
        info.opers = opers
    if isinstance(data.get("groups"), list):
        info.group_count = sum(1 for item in data["groups"] if isinstance(item, dict))
    if isinstance(data.get("actions"), list):
        info.action_count = sum(1 for item in data["actions"] if isinstance(item, dict))
    sidecar = path.with_suffix(".meta.json")
    if sidecar.exists():
        try:
            meta = json.loads(sidecar.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            meta = {}
        if isinstance(meta, dict):
            if isinstance(meta.get("rating_level"), int):
                info.rating_level = int(meta["rating_level"])
            info.uploader = _str(meta.get("uploader"))
            if not info.stage_name:
                info.stage_name = _str(meta.get("stage_name"))
    return info


def _str(value: Any) -> str:
    if value is None:
        return ""
    return str(value)
