import unittest

from app.events import EventBus
from app.logs import MaaLogService


class MaaLogServiceTest(unittest.TestCase):
    def test_split_modes_match_card_state_machine(self):
        events = EventBus()
        logs = MaaLogService(events)

        logs.clear()
        logs.append("first")
        logs.append("second")
        logs.append("third", split_mode="Before")
        logs.append("fourth", split_mode="Both")
        logs.append("fifth")

        cards = logs.cards()
        self.assertEqual([len(card["items"]) for card in cards], [2, 1, 1, 1])
        self.assertEqual(cards[0]["items"][0]["content"], "first")
        self.assertEqual(cards[2]["items"][0]["content"], "fourth")
        self.assertEqual(cards[3]["items"][0]["content"], "fifth")
        self.assertEqual(cards[0]["start_time"], cards[0]["items"][0]["time"])
        self.assertEqual(cards[0]["end_time"], cards[0]["items"][-1]["time"])

    def test_create_new_card_does_not_duplicate_empty_tail(self):
        logs = MaaLogService(EventBus())

        logs.clear()
        logs.append("only", split_mode="Both")
        logs.append("", split_mode="Before")

        cards = logs.cards()
        self.assertEqual(len(cards), 2)
        self.assertEqual([len(card["items"]) for card in cards], [1, 0])
        self.assertTrue(logs.has_last_content_prefix("only"))

    def test_log_item_event_preserves_maa_color_and_raw_detail(self):
        events = EventBus()
        logs = MaaLogService(events)

        logs.clear()
        logs.append(
            "error",
            color_key="ErrorLogBrush",
            weight="Bold",
            split_mode="Both",
            tooltip={"kind": "image"},
            raw={"what": "TaskChainError"},
        )

        item_event = [event for event in events.recent() if event.type == "maa.log.item"][-1]
        self.assertEqual(item_event.level, "error")
        self.assertEqual(item_event.detail["color_key"], "ErrorLogBrush")
        self.assertEqual(item_event.detail["split_mode"], "Both")
        self.assertEqual(item_event.detail["weight"], "Bold")
        self.assertEqual(item_event.detail["tooltip"], {"kind": "image"})
        self.assertEqual(item_event.detail["raw"], {"what": "TaskChainError"})


if __name__ == "__main__":
    unittest.main()
