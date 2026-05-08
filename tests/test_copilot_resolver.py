import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.copilot_resolver import (
    CopilotResolveError,
    extract_copilot_id,
    resolve,
)


SAMPLE_COPILOT = {
    "stage_name": "1-7",
    "minimum_required": "v4.0.0",
    "doc": {"title": "1-7 三星速通", "details": "干员尽量练满。"},
    "opers": [
        {"name": "山", "skill": 2},
        {"name": "讯使", "skill": 1},
    ],
    "groups": [{"name": "近卫"}, {"name": "辅助"}],
    "actions": [
        {"type": "Deploy"},
        {"type": "Skill"},
        {"type": "Retreat"},
    ],
}


def _api_response_factory(payload: dict):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    class _FakeResponse:
        def read(self_inner):
            return body

        def __enter__(self_inner):
            return self_inner

        def __exit__(self_inner, exc_type, exc, tb):
            return False

    def _factory(*args, **kwargs):
        return _FakeResponse()

    return _factory


class ExtractIdTest(unittest.TestCase):
    def test_pure_numeric_input(self):
        self.assertEqual(extract_copilot_id("12345"), 12345)

    def test_maa_scheme_input(self):
        self.assertEqual(extract_copilot_id("maa://98765"), 98765)
        self.assertEqual(extract_copilot_id(" MAA://4242 some note "), 4242)

    def test_prts_plus_url(self):
        self.assertEqual(extract_copilot_id("https://prts.plus/copilot/777"), 777)
        self.assertEqual(extract_copilot_id("https://prts.plus/copilots/555"), 555)
        self.assertEqual(extract_copilot_id("prts.plus/copilot/operation/333"), 333)

    def test_local_path_returns_none(self):
        self.assertIsNone(extract_copilot_id("D:/MAA/resource/copilot/x.json"))
        self.assertIsNone(extract_copilot_id(""))


class ResolveTest(unittest.TestCase):
    def test_resolve_local_file_extracts_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache"
            local = Path(directory) / "x.json"
            local.write_text(json.dumps(SAMPLE_COPILOT, ensure_ascii=False), encoding="utf-8")

            path, info = resolve(str(local), cache)

        self.assertEqual(path, local)
        self.assertEqual(info.source, "local")
        self.assertEqual(info.stage_name, "1-7")
        self.assertEqual(info.title, "1-7 三星速通")
        self.assertEqual(len(info.opers), 2)
        self.assertEqual(info.opers[0].name, "山")
        self.assertEqual(info.opers[0].skill, 2)
        self.assertEqual(info.group_count, 2)
        self.assertEqual(info.action_count, 3)

    def test_resolve_missing_local_file_raises(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache"
            with self.assertRaises(CopilotResolveError):
                resolve("/no/such/file.json", cache)

    def test_resolve_mystery_code_downloads_and_caches(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache"
            wrapper = {
                "data": {
                    "id": 12345,
                    "uploader": "boss",
                    "rating_level": 4,
                    "stage_name": "1-7",
                    "content": json.dumps(SAMPLE_COPILOT),
                }
            }
            with patch("app.copilot_resolver.urlrequest.urlopen", side_effect=_api_response_factory(wrapper)) as urlopen:
                path, info = resolve("maa://12345", cache)
                self.assertTrue(path.exists())
                self.assertEqual(path.name, "maa-prts-12345.json")
                self.assertEqual(info.source, "prts.plus")
                self.assertEqual(info.upstream_id, 12345)
                self.assertEqual(info.stage_name, "1-7")
                self.assertEqual(info.rating_level, 4)
                self.assertEqual(info.uploader, "boss")
                urlopen.assert_called_once()

    def test_resolve_uses_cache_on_second_request(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache"
            wrapper = {
                "data": {
                    "id": 999,
                    "rating_level": 3,
                    "uploader": "tester",
                    "stage_name": "CV-1",
                    "content": json.dumps(SAMPLE_COPILOT),
                }
            }
            with patch("app.copilot_resolver.urlrequest.urlopen", side_effect=_api_response_factory(wrapper)):
                resolve("999", cache)
            with patch("app.copilot_resolver.urlrequest.urlopen") as urlopen2:
                path2, info2 = resolve("999", cache)
                self.assertTrue(path2.exists())
                self.assertEqual(info2.upstream_id, 999)
                urlopen2.assert_not_called()

    def test_resolve_handles_empty_content(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache"
            wrapper = {"data": {"id": 1, "content": ""}}
            with patch("app.copilot_resolver.urlrequest.urlopen", side_effect=_api_response_factory(wrapper)):
                with self.assertRaises(CopilotResolveError):
                    resolve("maa://1", cache)


if __name__ == "__main__":
    unittest.main()
