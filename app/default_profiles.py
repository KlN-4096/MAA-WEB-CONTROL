from __future__ import annotations

from .models import Profile, TaskDefinition


ALL_FACILITIES = ["制造站", "贸易站", "控制中枢", "发电站", "会客室", "办公室", "宿舍", "加工站", "训练室"]


def build_default_profiles() -> list[Profile]:
    return [
        Profile(
            name="daily-shoucai",
            description="Daily resource routine.",
            tasks=[
                _task("startup", "StartUp", _startup_params()),
                _task("recruit", "Recruit", _recruit_params()),
                _task("infrast", "Infrast", _infrast_params()),
                _task("mall", "Mall", _mall_params()),
                _task("award", "Award", _award_params()),
            ],
        ),
        Profile(
            name="daily-shualizhi",
            description="Daily sanity routine.",
            tasks=[
                _task("startup", "StartUp", _startup_params()),
                _task("fight", "Fight", _fight_params()),
                _task("award", "Award", _award_params()),
            ],
        ),
    ]


def _task(task_id: str, task_type: str, params: dict[str, object]) -> TaskDefinition:
    return TaskDefinition(id=task_id, type=task_type, enabled=True, name=_task_name(task_type), params=params)


def _task_name(task_type: str) -> str:
    return {
        "StartUp": "开始唤醒",
        "Recruit": "自动公招",
        "Infrast": "基建换班",
        "Fight": "理智作战",
        "Mall": "信用收支",
        "Award": "领取奖励",
    }.get(task_type, task_type)


def _startup_params() -> dict[str, object]:
    return {
        "account": "",
        "start_game_enabled": True,
        "client_type": "官服",
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
        "drop": "不选择",
        "series": 0,
        "custom_annihilation": False,
        "dr_grandet": False,
        "use_expiring_medicine": True,
        "medicine_expire_hours": "48h",
        "use_activity_expire": False,
        "hide_series": False,
        "allow_stone_save": False,
        "custom_stage_code": False,
        "stage_reset": "当前/上次",
        "use_alternate_stage": True,
        "hide_unavailable_stage": True,
        "weekly_schedule": False,
        "auto_restart": True,
        "report_to_penguin": True,
        "penguin_id": "614858333",
        "server": "CN",
    }
