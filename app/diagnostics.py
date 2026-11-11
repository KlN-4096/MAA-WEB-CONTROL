from __future__ import annotations

import io
import json
import re
from pathlib import Path
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

from .version import WEB_VERSION


SECRET_KEYS = re.compile(r"token|password|secret|authorization|api.?key|webhook|credential", re.I)
SECRET_ASSIGNMENT = re.compile(r"""((?:token|password|secret|authorization|api.?key)["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\r\n,;]+)""", re.I)
URL = re.compile(r"https?://[^\s<>\"']+", re.I)


def redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: "[REDACTED]" if SECRET_KEYS.search(str(key)) else redact(item) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str):
        text = URL.sub("[URL REDACTED]", value)
        return SECRET_ASSIGNMENT.sub(r"\1[REDACTED]", text)
    return value


def build_log_archive(cards: list[dict[str, Any]], events: list[dict[str, Any]], core_dir: Path | None) -> bytes:
    output = io.BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("web-logs.json", json.dumps(redact({"version": WEB_VERSION, "cards": cards, "events": events}), ensure_ascii=False, indent=2))
        archive.writestr("README.txt", "本包仅含网页运行日志，不打包配置、截图或无法保证脱敏的 Core 原始日志。敏感字段和完整 URL 已遮盖；游戏账号、干员名等个人信息仍需在分享前检查。\n")
    return output.getvalue()
