import inspect
from uuid import UUID, uuid4

import pytest

from app.domain.phase2_interfaces import (
    IExpenseSplittingService,
    IExternalPlacesProvider,
    IRouteOptimizationService,
)
from tests.mocks.phase2_stubs import (
    StubExpenseSplittingService,
    StubExternalPlacesProvider,
    StubRouteOptimizationService,
)


def test_phase2_interfaces_cannot_be_instantiated_directly() -> None:
    """Đảm bảo các Abstract Base Class (ABC) không thể được khởi tạo trực tiếp."""
    with pytest.raises(TypeError):
        IRouteOptimizationService()  # type: ignore[abstract]

    with pytest.raises(TypeError):
        IExternalPlacesProvider()  # type: ignore[abstract]

    with pytest.raises(TypeError):
        IExpenseSplittingService()  # type: ignore[abstract]


def test_route_optimization_service_interface_and_stub_signature() -> None:
    """Kiểm tra chữ ký phương thức và kiểu dữ liệu của IRouteOptimizationService."""
    method = IRouteOptimizationService.optimize_route
    assert inspect.iscoroutinefunction(method), "optimize_route phải là async coroutine"

    sig = inspect.signature(method)
    params = list(sig.parameters.keys())
    assert params == ["self", "place_ids"], f"Tham số không khớp CONTRACTS.md: {params}"


@pytest.mark.asyncio
async def test_stub_route_optimization_service_execution() -> None:
    """Kiểm tra thực thi của StubRouteOptimizationService tuân thủ interface và trả về list[UUID]."""
    stub = StubRouteOptimizationService(reversed_order=True)
    assert isinstance(stub, IRouteOptimizationService)

    p1 = uuid4()
    p2 = uuid4()
    p3 = uuid4()
    input_ids = [p1, p2, p3]

    result = await stub.optimize_route(input_ids)
    assert isinstance(result, list)
    assert len(result) == 3
    assert result == [p3, p2, p1]
    assert all(isinstance(pid, UUID) for pid in result)
    assert stub.invocations == [input_ids]

    # Kiểm tra trường hợp danh sách rỗng
    empty_res = await stub.optimize_route([])
    assert empty_res == []


def test_external_places_provider_interface_and_stub_signature() -> None:
    """Kiểm tra chữ ký phương thức và kiểu dữ liệu của IExternalPlacesProvider."""
    method = IExternalPlacesProvider.search_places
    assert inspect.iscoroutinefunction(method), "search_places phải là async coroutine"

    sig = inspect.signature(method)
    params = list(sig.parameters.keys())
    assert params == ["self", "query", "lat", "lng"], f"Tham số không khớp CONTRACTS.md: {params}"


@pytest.mark.asyncio
async def test_stub_external_places_provider_execution() -> None:
    """Kiểm tra thực thi của StubExternalPlacesProvider tuân thủ interface và trả về list[dict]."""
    stub = StubExternalPlacesProvider()
    assert isinstance(stub, IExternalPlacesProvider)

    query = "cà phê trứng"
    lat = 10.7769
    lng = 106.7009

    results = await stub.search_places(query, lat, lng)
    assert isinstance(results, list)
    assert len(results) >= 1

    first_item = results[0]
    assert isinstance(first_item, dict)
    assert "name" in first_item
    assert "latitude" in first_item
    assert "longitude" in first_item
    assert "address" in first_item
    assert stub.searched_queries == [{"query": query, "lat": lat, "lng": lng}]

    # Kiểm tra predefined results
    custom_results = [{"name": "Quán Tùy Biến", "rating": 5.0}]
    stub_custom = StubExternalPlacesProvider(predefined_results=custom_results)
    res_custom = await stub_custom.search_places("bất kỳ", 0.0, 0.0)
    assert res_custom == custom_results


def test_expense_splitting_service_interface_and_stub_signature() -> None:
    """Kiểm tra chữ ký phương thức và kiểu dữ liệu của IExpenseSplittingService."""
    method = IExpenseSplittingService.calculate_split
    assert inspect.iscoroutinefunction(method), "calculate_split phải là async coroutine"

    sig = inspect.signature(method)
    params = list(sig.parameters.keys())
    assert params == ["self", "room_id", "expenses"], f"Tham số không khớp CONTRACTS.md: {params}"


@pytest.mark.asyncio
async def test_stub_expense_splitting_service_execution() -> None:
    """Kiểm tra thực thi của StubExpenseSplittingService tuân thủ interface và chia hóa đơn chuẩn."""
    stub = StubExpenseSplittingService()
    assert isinstance(stub, IExpenseSplittingService)

    room_id = uuid4()
    member_a = str(uuid4())
    member_b = str(uuid4())
    member_c = str(uuid4())

    expenses = [
        {
            "description": "Ăn trưa cơm tấm",
            "amount": 150000,
            "paid_by_id": member_a,
            "participant_ids": [member_a, member_b, member_c],
        },
        {
            "description": "Cà phê",
            "amount": 90000,
            "paid_by_id": member_b,
            "participant_ids": [member_a, member_b, member_c],
        },
    ]

    result = await stub.calculate_split(room_id, expenses)
    assert isinstance(result, dict)
    assert result["room_id"] == str(room_id)
    assert result["total_expense"] == 240000
    assert result["participant_count"] == 3
    # Mỗi người chịu 80,000 VND
    assert result["per_member_share"] == 80000

    # A đã trả 150k, chịu 80k -> net balance = +70k (được nhận lại)
    # B đã trả 90k, chịu 80k -> net balance = +10k (được nhận lại)
    # C đã trả 0k, chịu 80k -> net balance = -80k (phải trả)
    balances = result["net_balances"]
    assert balances[member_a] == 70000
    assert balances[member_b] == 10000
    assert balances[member_c] == -80000
