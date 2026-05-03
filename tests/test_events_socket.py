import asyncio
import unittest

from app.api import events_socket
from app.events import EventBus


class FakeWebSocket:
    def __init__(self):
        self.accepted = False
        self.incoming = asyncio.Queue()
        self.sent = []

    async def accept(self):
        self.accepted = True

    async def send_json(self, payload):
        self.sent.append(payload)

    async def receive(self):
        return await self.incoming.get()


class EventsSocketTest(unittest.IsolatedAsyncioTestCase):
    async def test_disconnect_unblocks_event_queue_wait(self):
        events = EventBus()
        websocket = FakeWebSocket()

        task = asyncio.create_task(events_socket(websocket, events))
        await asyncio.sleep(0)
        await websocket.incoming.put({"type": "websocket.disconnect"})
        await asyncio.wait_for(task, timeout=1)

        self.assertTrue(websocket.accepted)
        self.assertEqual(len(events._subscribers), 0)


if __name__ == "__main__":
    unittest.main()
