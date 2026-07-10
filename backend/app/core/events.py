import asyncio
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from typing import Any


@dataclass
class DomainEvent:
    name: str
    payload: dict[str, Any] = field(default_factory=dict)


EventHandler = Callable[[DomainEvent], Coroutine[Any, Any, None]]


class EventBus:
    def __init__(self) -> None:
        self._handlers: dict[str, list[EventHandler]] = {}
        self._sse_queues: list[asyncio.Queue[DomainEvent]] = []

    def subscribe(self, event_name: str, handler: EventHandler) -> None:
        self._handlers.setdefault(event_name, []).append(handler)

    def register_sse_queue(self, queue: asyncio.Queue[DomainEvent]) -> None:
        self._sse_queues.append(queue)

    def unregister_sse_queue(self, queue: asyncio.Queue[DomainEvent]) -> None:
        if queue in self._sse_queues:
            self._sse_queues.remove(queue)

    async def publish(self, event: DomainEvent) -> None:
        for handler in self._handlers.get(event.name, []):
            await handler(event)
        for handler in self._handlers.get("*", []):
            await handler(event)
        for queue in list(self._sse_queues):
            await queue.put(event)


event_bus = EventBus()
