import asyncio
import inspect
import logging
from abc import ABC, abstractmethod
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any, Generic, TypeVar

logger = logging.getLogger(__name__)

TEvent = TypeVar("TEvent")


class IEventHandler(ABC, Generic[TEvent]):
    """Interface cho các lớp xử lý Domain Event (Observer/Subscriber)."""

    @abstractmethod
    async def handle(self, event: TEvent) -> None:
        """Thực thi logic khi sự kiện được phát tán.

        Args:
            event: Đối tượng sự kiện được phát tán.
        """


class CallableEventHandler(IEventHandler[TEvent]):
    """Adapter chuyển đổi một async callable function thành IEventHandler."""

    def __init__(self, callback: Callable[[TEvent], Awaitable[None]]) -> None:
        self._callback = callback

    @property
    def callback(self) -> Callable[[TEvent], Awaitable[None]]:
        return self._callback

    async def handle(self, event: TEvent) -> None:
        await self._callback(event)

    def __repr__(self) -> str:
        name = getattr(self._callback, "__name__", str(self._callback))
        return f"CallableEventHandler({name})"


class IEventBus(ABC):
    """Interface trừu tượng của EventBus theo CONTRACTS.md."""

    @abstractmethod
    def register(self, event_type: type, handler: IEventHandler) -> None:
        """Đăng ký subscriber lắng nghe một kiểu sự kiện cụ thể.

        Args:
            event_type: Lớp loại sự kiện (ví dụ: PlaceAddedEvent).
            handler: Đối tượng xử lý sự kiện IEventHandler.
        """

    @abstractmethod
    async def publish(self, event: Any) -> None:
        """Xuất bản sự kiện bất đồng bộ tới toàn bộ subscribers phù hợp.

        Args:
            event: Đối tượng sự kiện cần phát tán.
        """


class InMemoryEventBus(IEventBus):
    """EventBus vận hành trong bộ nhớ (In-Memory Pub/Sub) cho ứng dụng Đi Đâu.

    Hỗ trợ:
    - Đăng ký IEventHandler hoặc async callable.
    - Phân giải polymorphic (subscriber lắng nghe class cha sẽ nhận cả sự kiện class con).
    - Thực thi bất đồng bộ concurrent hoặc sequential.
    - Cơ chế kiểm soát lỗi (graceful isolation hoặc raise_exceptions).
    """

    def __init__(self, concurrent: bool = True, raise_exceptions: bool = False) -> None:
        """Khởi tạo InMemoryEventBus.

        Args:
            concurrent: Nếu True, các handler được kích hoạt song song qua asyncio.gather.
                        Nếu False, các handler được kích hoạt tuần tự.
            raise_exceptions: Nếu True, lỗi từ handler sẽ được propagate ra ngoài.
                              Nếu False, lỗi được log lại và không làm gián đoạn các handler khác.
        """
        self._handlers: dict[type, list[IEventHandler[Any]]] = defaultdict(list)
        self._concurrent = concurrent
        self._raise_exceptions = raise_exceptions

    @property
    def concurrent(self) -> bool:
        return self._concurrent

    @concurrent.setter
    def concurrent(self, value: bool) -> None:
        self._concurrent = value

    @property
    def raise_exceptions(self) -> bool:
        return self._raise_exceptions

    @raise_exceptions.setter
    def raise_exceptions(self, value: bool) -> None:
        self._raise_exceptions = value

    def register(
        self,
        event_type: type,
        handler: IEventHandler[Any] | Callable[[Any], Awaitable[None]],
    ) -> None:
        """Đăng ký handler cho một kiểu sự kiện.

        Hỗ trợ cả instance của IEventHandler lẫn coroutine function (async callable).
        """
        if not isinstance(event_type, type):
            raise TypeError(f"event_type phải là một class/type, nhận được: {type(event_type)}")

        adapted_handler: IEventHandler[Any]
        if isinstance(handler, IEventHandler):
            adapted_handler = handler
        elif inspect.iscoroutinefunction(handler) or callable(handler):
            adapted_handler = CallableEventHandler(handler)
        else:
            raise TypeError(
                f"handler phải kế thừa IEventHandler hoặc là một async callable, nhận được: {type(handler)}"
            )

        if adapted_handler not in self._handlers[event_type]:
            self._handlers[event_type].append(adapted_handler)

    def unregister(
        self,
        event_type: type,
        handler: IEventHandler[Any] | Callable[[Any], Awaitable[None]],
    ) -> bool:
        """Hủy đăng ký handler khỏi một kiểu sự kiện.

        Returns:
            True nếu đã hủy thành công, False nếu không tìm thấy handler.
        """
        if event_type not in self._handlers:
            return False

        handlers_list = self._handlers[event_type]

        # Kiểm tra khớp trực tiếp
        if handler in handlers_list:
            handlers_list.remove(handler)
            return True

        # Kiểm tra nếu handler là callable tương ứng bên trong CallableEventHandler
        for h in list(handlers_list):
            if isinstance(h, CallableEventHandler) and h.callback == handler:
                handlers_list.remove(h)
                return True

        return False

    def subscribe(self, event_type: type) -> Callable[[Callable[[Any], Awaitable[None]]], Callable[[Any], Awaitable[None]]]:
        """Decorator hỗ trợ đăng ký hàm async trực tiếp vào EventBus.

        Ví dụ:
            @bus.subscribe(PlaceAddedEvent)
            async def on_place_added(event: PlaceAddedEvent) -> None:
                ...
        """

        def decorator(fn: Callable[[Any], Awaitable[None]]) -> Callable[[Any], Awaitable[None]]:
            self.register(event_type, fn)
            return fn

        return decorator

    def get_handlers_for(self, event_type: type) -> list[IEventHandler[Any]]:
        """Lấy danh sách tất cả các handler phù hợp với event_type (bao gồm kế thừa)."""
        matched_handlers: list[IEventHandler[Any]] = []
        seen: set[IEventHandler[Any]] = set()

        for registered_type, handlers in self._handlers.items():
            if issubclass(event_type, registered_type):
                for handler in handlers:
                    if handler not in seen:
                        seen.add(handler)
                        matched_handlers.append(handler)

        return matched_handlers

    def handler_count(self, event_type: type | None = None) -> int:
        """Đếm số lượng handler đã đăng ký."""
        if event_type is not None:
            return len(self._handlers.get(event_type, []))
        return sum(len(handlers) for handlers in self._handlers.values())

    def clear(self) -> None:
        """Xóa toàn bộ subscribers đã đăng ký."""
        self._handlers.clear()

    async def publish(self, event: Any) -> None:
        """Xuất bản sự kiện tới tất cả các subscribers phù hợp."""
        if event is None:
            return

        event_class = type(event)
        handlers = self.get_handlers_for(event_class)

        if not handlers:
            logger.debug("Không có handler nào đăng ký cho sự kiện %s", event_class.__name__)
            return

        async def _run_handler(h: IEventHandler[Any]) -> None:
            try:
                await h.handle(event)
            except Exception:
                logger.exception(
                    "Lỗi khi thực thi handler %s cho sự kiện %s",
                    h,
                    event_class.__name__,
                )
                if self._raise_exceptions:
                    raise

        if self._concurrent:
            results = await asyncio.gather(
                *[_run_handler(h) for h in handlers],
                return_exceptions=not self._raise_exceptions,
            )
            if self._raise_exceptions:
                for res in results:
                    if isinstance(res, Exception):
                        raise res
        else:
            for h in handlers:
                await _run_handler(h)
