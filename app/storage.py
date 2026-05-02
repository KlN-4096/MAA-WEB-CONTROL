from __future__ import annotations

import json
import re
from pathlib import Path

from .models import Profile


PROFILE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")


class ProfileStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def list_names(self) -> list[str]:
        return sorted(path.stem for path in self.root.glob("*.json"))

    def load(self, name: str) -> Profile:
        path = self._path_for(name)
        if not path.exists():
            raise FileNotFoundError(f"Profile not found: {name}")
        return Profile.model_validate_json(path.read_text(encoding="utf-8"))

    def save(self, profile: Profile) -> Profile:
        path = self._path_for(profile.name)
        payload = profile.model_dump(mode="json", exclude_none=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return profile

    def _path_for(self, name: str) -> Path:
        if not PROFILE_NAME_PATTERN.fullmatch(name):
            raise ValueError("Profile name can only contain letters, numbers, dot, dash, and underscore.")
        return self.root / f"{name}.json"

