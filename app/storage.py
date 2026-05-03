from __future__ import annotations

import json
import re
from pathlib import Path
from threading import Lock

from .models import Profile


PROFILE_NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+$")


class ProfileStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self._write_lock = Lock()

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
        content = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
        with self._write_lock:
            tmp = path.with_suffix(".json.tmp")
            tmp.write_text(content, encoding="utf-8")
            tmp.replace(path)
        return profile

    def ensure_defaults(self, profiles: list[Profile]) -> list[str]:
        created: list[str] = []
        for profile in profiles:
            path = self._path_for(profile.name)
            if path.exists():
                continue
            self.save(profile)
            created.append(profile.name)
        return created

    def _path_for(self, name: str) -> Path:
        if not PROFILE_NAME_PATTERN.fullmatch(name):
            raise ValueError("Profile name can only contain letters, numbers, dot, dash, and underscore.")
        return self.root / f"{name}.json"
