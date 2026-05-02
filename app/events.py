from __future__ import annotations

import asyncio
from collections import deque

from .models import EventRecord


class EventBus:
    def __init__(self, max_events: int = 300) -> None:
        self._events: deque[EventRecord] = deque(maxlen=max_events)
        self._subscribers: set[asyncio.Queue[EventRecord]] = set()

    def publish(self, event: EventRecord) -> None:
        self._events.append(event)
        for queue in list(self._subscribers):
            queue.put_nowait(event)

    def recent(self, limit: int = 100) -> list[EventRecord]:
        if limit <= 0:
            return []
        return list(self._events)[-limit:]

    def add_subscriber(self) -> asyncio.Queue[EventRecord]:
        queue: asyncio.Queue[EventRecord] = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def remove_subscriber(self, queue: asyncio.Queue[EventRecord]) -> None:
        self._subscribers.discard(queue)

