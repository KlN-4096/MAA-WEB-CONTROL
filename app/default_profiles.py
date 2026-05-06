from __future__ import annotations

from .models import Profile, TaskDefinition


ALL_FACILITIES = ["制造站", "贸易站", "控制中枢", "发电站", "会客室", "办公室", "宿舍", "加工站", "训练室"]
BUILTIN_TASK_ORDER = [
    "startup",
    "recruit",
    "infrast",
    "fight",
    "remaining-sanity",
    "mall",
    "award",
    "roguelike",
    "reclamation",
]


def build_default_profiles() -> list[Profile]:
    return [
        Profile(
            name="daily-shoucai",
            description="Daily resource routine.",
            tasks=_profile_tasks({"startup", "recruit", "infrast", "mall", "award"}),
        ),
        Profile(
            name="daily-shualizhi",
            description="Daily sanity routine.",
            tasks=_profile_tasks({"startup", "fight", "award"}),
        ),
    ]


def complete_profile_tasks(profile: Profile) -> Profile:
    existing_by_id = {task.id: task for task in profile.tasks}
    ordered_tasks: list[TaskDefinition] = []
    used_ids: set[str] = set()
    for template in _profile_tasks(set()):
        task = existing_by_id.get(template.id) or template
        ordered_tasks.append(task)
        used_ids.add(task.id)
    ordered_tasks.extend(task for task in profile.tasks if task.id not in used_ids)
    return profile.model_copy(update={"tasks": ordered_tasks}, deep=True)


def _profile_tasks(enabled_ids: set[str]) -> list[TaskDefinition]:
    return [_builtin_task(task_id, task_id in enabled_ids) for task_id in BUILTIN_TASK_ORDER]


def _builtin_task(task_id: str, enabled: bool) -> TaskDefinition:
    task_type = _task_type(task_id)
    return TaskDefinition(
        id=task_id,
        type=task_type,
        enabled=enabled,
        name=_task_name(task_id),
        params=_task_params(task_id),
    )


def _task_type(task_id: str) -> str:
    return {
        "startup": "StartUp",
        "recruit": "Recruit",
        "infrast": "Infrast",
        "fight": "Fight",
        "remaining-sanity": "Fight",
        "mall": "Mall",
        "award": "Award",
        "roguelike": "Roguelike",
        "reclamation": "Reclamation",
    }[task_id]


def _task_name(task_id: str) -> str:
    return {
        "startup": "开始唤醒",
        "recruit": "自动公招",
        "infrast": "基建换班",
        "fight": "理智作战",
        "remaining-sanity": "剩余理智",
        "mall": "信用收支",
        "award": "领取奖励",
        "roguelike": "自动肉鸽",
        "reclamation": "生息演算",
    }.get(task_id, task_id)


def _task_params(task_id: str) -> dict[str, object]:
    return {
        "startup": _startup_params,
        "recruit": _recruit_params,
        "infrast": _infrast_params,
        "fight": _fight_params,
        "remaining-sanity": _remaining_sanity_params,
        "mall": _mall_params,
        "award": _award_params,
        "roguelike": _roguelike_params,
        "reclamation": _reclamation_params,
    }[task_id]()


def _startup_params() -> dict[str, object]:
    return {
        "account": "",
        "start_game_enabled": True,
        "client_type": "Official",
        "auto_detect": True,
        "detect_every_time": True,
        "connection": "雷电模拟器",
        "touch_mode": "Minitouch（默认）",
    }


def _recruit_params() -> dict[str, object]:
    return {
        "auto_expedited": False,
        "max_times": 99,
        "extra_tags": "",
        "refresh": True,
        "skip_robot": True,
        "reserve_level_1": True,
        "confirm_3": True,
        "time3": "09:00",
        "confirm_4": True,
        "time4": "09:00",
        "confirm_5": False,
        "time5": "09:00",
        "confirm_6": False,
    }


def _infrast_params() -> dict[str, object]:
    return {
        "mode": "常规模式",
        "drone": "贸易站-龙门币",
        "mood": 30,
        "facilities": list(ALL_FACILITIES),
        "dorm_trust": False,
        "skip_entered": True,
        "stone_fragment": True,
        "collect_credit": True,
        "clue_exchange": True,
        "send_clue": True,
        "continue_training": False,
    }


def _mall_params() -> dict[str, object]:
    return {
        "visit_friends": True,
        "visit_once": False,
        "credit_fight": False,
        "credit_fight_once": False,
        "formation_index": 0,
        "shopping": True,
        "buy_first": [],
        "blacklist": ["家具零件"],
        "overflow_blacklist": False,
        "discount_only": False,
        "stop_if_low": False,
    }


def _award_params() -> dict[str, object]:
    return {
        "daily": True,
        "mail": False,
        "free_gacha": False,
        "orundum": True,
        "limited_orundum": False,
        "monthly_card": False,
    }


def _fight_params() -> dict[str, object]:
    return {
        "stage_plan": ["CE-6", "1-7"],
        "stage": "CE-6",
        "use_remaining_sanity_stage": True,
        "use_medicine": False,
        "medicine": 0,
        "use_stone": False,
        "stone": 0,
        "has_times_limited": False,
        "times": 99999,
        "use_drops": False,
        "drop": "",
        "series": 0,
        "custom_annihilation": False,
        "dr_grandet": False,
        "use_expiring_medicine": True,
        "medicine_expire_hours": "48h",
        "use_activity_expire": False,
        "hide_series": False,
        "allow_stone_save": False,
        "custom_stage_code": False,
        "stage_reset": "CurrentStage",
        "use_alternate_stage": True,
        "hide_unavailable_stage": True,
        "weekly_schedule": False,
        "auto_restart": True,
        "report_to_penguin": True,
        "penguin_id": "614858333",
        "server": "CN",
    }


def _remaining_sanity_params() -> dict[str, object]:
    params = _fight_params()
    params.update({
        "stage_plan": ["1-7", "CurrentStage"],
        "stage": "1-7",
        "use_remaining_sanity_stage": False,
        "medicine": 0,
        "stone": 0,
        "times": 999,
    })
    return params


def _roguelike_params() -> dict[str, object]:
    return {
        "theme": "萨卡兹",
        "difficulty": "MAX (18)",
        "strategy": "刷等级，尽可能稳定地打更多层数",
        "squad": "指挥分队",
        "roles": "稳扎稳打（重装、术师、狙击）",
        "operator": "",
        "starts_count": 99999,
        "investment_enabled": True,
        "use_support_unit": False,
        "stop_at_final_boss": False,
        "stop_at_max_level": False,
        "start_with_seed": False,
        "delay_abort": True,
    }


def _reclamation_params() -> dict[str, object]:
    return {
        "theme": "沙洲遗闻",
        "strategy": "有存档，通过组装支援道具刷生息点数",
        "tool_to_craft": "荧光棒",
        "increment_mode": "连点",
        "max_craft_count": 16,
    }
