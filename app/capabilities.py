from __future__ import annotations

from copy import deepcopy
from typing import Any


CAPABILITIES: dict[str, Any] = {
    "version": 1,
    "features": {
        "basement": {"enabled": True},
        "copilot": {
            "enabled": True,
            "available": True,
        },
        "tools": {
            "enabled": True,
            "available": True,
        },
        "settings": {"enabled": True},
    },
    "resources": {
        "enabled": False,
        "reason": "资源驱动选项尚未接 MaaCore resource，本轮继续使用静态/自由输入降级。",
    },
    "profiles": {
        "defaults": ["daily-shoucai", "daily-shualizhi"],
    },
    "tasks": {
        "StartUp": {
            "enabled": True,
            "title": "开始唤醒",
            "supports_advanced": False,
            "default_params": {
                "account": "",
                "start_game_enabled": True,
                "client_type": "官服",
            },
        },
        "Fight": {
            "enabled": True,
            "title": "理智作战",
            "supports_advanced": True,
            "default_params": {
                "stage": "当前/上次",
                "stage_plan": ["当前/上次"],
                "use_medicine": False,
                "use_stone": False,
                "has_times_limited": False,
                "medicine": 0,
                "stone": 0,
                "times": 99999,
                "series": 0,
            },
        },
        "Recruit": {
            "enabled": True,
            "title": "自动公招",
            "supports_advanced": True,
            "default_params": {
                "refresh": True,
                "force_refresh": True,
                "confirm_3": True,
                "confirm_4": True,
                "confirm_5": False,
                "confirm_6": False,
                "max_times": 99,
                "set_time": True,
                "expedite": False,
                "skip_robot": True,
                "extra_tags_mode": 0,
                "first_tags": [],
                "recruitment_time": {"3": 540, "4": 540, "5": 540, "6": 540},
            },
        },
        "Infrast": {
            "enabled": True,
            "title": "基建换班",
            "supports_advanced": True,
            "default_params": {
                "mode": "常规模式",
                "drone": "贸易站-龙门币",
                "mood": 30,
                "facilities": ["制造站", "贸易站", "控制中枢", "发电站", "会客室", "办公室", "宿舍", "加工站", "训练室"],
                "dorm_trust": False,
                "skip_entered": True,
                "stone_fragment": True,
                "collect_credit": True,
                "clue_exchange": True,
                "send_clue": True,
                "continue_training": False,
            },
        },
        "Mall": {
            "enabled": True,
            "title": "信用收支",
            "supports_advanced": True,
            "default_params": {
                "visit_friends": True,
                "shopping": True,
                "buy_first": [],
                "blacklist": ["家具零件"],
                "overflow_blacklist": False,
                "discount_only": False,
                "stop_if_low": False,
                "credit_fight": False,
            },
        },
        "Award": {
            "enabled": True,
            "title": "领取奖励",
            "supports_advanced": False,
            "default_params": {
                "daily": True,
                "mail": False,
                "free_gacha": False,
                "orundum": True,
                "limited_orundum": False,
                "monthly_card": False,
            },
        },
        "Roguelike": {
            "enabled": True,
            "title": "自动肉鸽",
            "supports_advanced": True,
            "default_params": {
                "theme": "萨卡兹",
                "difficulty": "MAX (18)",
                "strategy": "刷等级，尽可能稳定地打更多层数",
            },
        },
        "Reclamation": {
            "enabled": True,
            "title": "生息演算",
            "supports_advanced": True,
            "default_params": {
                "theme": "沙洲遗闻",
                "strategy": "有存档，通过组装支援道具刷生息点数",
            },
        },
        "CloseDown": {
            "enabled": True,
            "title": "关闭游戏",
            "supports_advanced": False,
            "default_params": {
                "client_type": "官服",
            },
        },
        "Custom": {
            "enabled": True,
            "title": "自定义任务",
            "supports_advanced": True,
            "default_params": {
                "task_names": [],
            },
        },
        "UserDataUpdate": {
            "enabled": True,
            "title": "更新用户数据",
            "supports_advanced": False,
            "default_params": {
                "update_oper_box": True,
                "update_depot": True,
            },
        },
    },
    "supports_visit_as_mall_subtask": True,
}


def build_capabilities() -> dict[str, Any]:
    return deepcopy(CAPABILITIES)
