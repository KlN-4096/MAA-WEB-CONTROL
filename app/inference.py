from __future__ import annotations

import ctypes
import json
import os
import platform
from pathlib import Path
from threading import Lock
from typing import Any

from .models import InferenceConfig
from .storage import _replace_with_retry


_APPLIED: dict[str, InferenceConfig] = {}
_CONFIG_ERRORS: dict[str, str] = {}
_LOCK = Lock()
CPU_OPTION = 1
GPU_OPTION = 2


def read_inference_config(root: Path) -> InferenceConfig:
    path = root / "data" / "inference.json"
    _CONFIG_ERRORS.pop(str(root.resolve()), None)
    if not path.exists():
        return InferenceConfig()
    try:
        return InferenceConfig.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        _CONFIG_ERRORS[str(root.resolve())] = "推理配置无法读取，已保留原文件并使用核心默认配置。"
        return InferenceConfig()


def inference_config_error(root: Path) -> str:
    return _CONFIG_ERRORS.get(str(root.resolve()), "")


def save_inference_config(root: Path, config: InferenceConfig) -> None:
    if config.backend == "directml" and platform.system() != "Windows":
        raise ValueError("DirectML 仅支持 Windows；Linux 可使用 CPU 或 WebGPU。")
    path = root / "data" / "inference.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(config.model_dump(), indent=2) + "\n", encoding="utf-8")
    _replace_with_retry(tmp, path)


def prepare_inference(core_dir: Path, config: InferenceConfig, user_dir: Path) -> Any:
    """只加载动态库，在官方 Python wrapper 的首个 AsstLoadResource 之前设静态选项。"""
    key = str(core_dir.resolve())
    user_dir.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        if key in _APPLIED:
            if _APPLIED[key] != config:
                raise RuntimeError("推理设置已变更，请重启服务后生效。")
            return None
        library = None
        if config.backend != "default":
            system = platform.system()
            filename = {"Windows": "MaaCore.dll", "Linux": "libMaaCore.so", "Darwin": "libMaaCore.dylib"}.get(system)
            if filename is None:
                raise RuntimeError("当前操作系统不受支持")
            if config.backend == "directml" and system != "Windows":
                raise RuntimeError("DirectML 仅支持 Windows")
            if system == "Windows":
                with os.add_dll_directory(key):
                    library = ctypes.WinDLL(str(core_dir / filename))
            else:
                library = ctypes.CDLL(str(core_dir / filename))
            user_setter = library.AsstSetUserDir
            user_setter.argtypes = [ctypes.c_char_p]
            user_setter.restype = ctypes.c_bool
            if not user_setter(str(user_dir.resolve()).encode("utf-8")):
                raise RuntimeError("MaaCore 拒绝设置用户目录。")
            setter = library.AsstSetStaticOption
            setter.argtypes = [ctypes.c_int, ctypes.c_char_p]
            setter.restype = ctypes.c_bool
            backend = config.backend
            value = "" if backend == "cpu" else str(config.device) if backend == "auto" else f"{backend}:{config.device}"
            if not setter(CPU_OPTION if backend == "cpu" else GPU_OPTION, value.encode()):
                raise RuntimeError("MaaCore 拒绝推理设置，请检查驱动和后端支持，未静默切换后端。")
        _APPLIED[key] = config.model_copy(deep=True)
        return library
