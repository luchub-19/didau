"""Script seed dữ liệu mẫu khởi tạo cho ứng dụng Đi Đâu.

Tạo sẵn:
- 1 Phòng hoàn chỉnh (Mã phòng: DIDAU8)
- 3 Thành viên (1 Host, 2 Members)
- Điểm hẹn Q.1 (TP.HCM) và khung giờ 17:00-23:00 để demo bản đồ và tự lên lịch
- 5 Địa điểm thêm tay thuộc nhiều danh mục (Food, Drink, Entertainment)
- 2 Địa điểm từ OSM (có external_id thật trong snapshot) cùng dẫn đầu 3 upvotes để demo Chọn hộ
- 1 Mục lịch trình mẫu sẵn sàng cho demo
"""

import asyncio
from datetime import date
from uuid import UUID

from sqlalchemy import delete, select

from app.core.database import AsyncSessionLocal
from app.domain.enums import (
    CityCode,
    MemberRole,
    PlaceCategory,
    PlaceSource,
    PlaceStatus,
    RoomStatus,
    TieBreakStrategyName,
)
from app.domain.models import Member, Place, Room, ScheduleItem, Vote

# Fixed UUIDs matching CONTRACTS.md specifications
ROOM_ID = UUID("c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21")
HOST_MEMBER_ID = UUID("e4a2d815-1a3b-4c22-b5f7-920478bf1144")
MEMBER_2_ID = UUID("f5c3b927-2b4c-4d33-a6e8-031589ca2255")
MEMBER_3_ID = UUID("0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d")

PLACE_1_ID = UUID("8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b")  # Cà Phê Trứng 3T
PLACE_2_ID = UUID("9a8b7c6d-5e4f-3a2b-1c0d-e9f8a7b6c5d4")  # Cơm Tấm Ba Ghiền
PLACE_3_ID = UUID("1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e")  # CGV Vincom Đồng Khởi
PLACE_4_ID = UUID("2c3d4e5f-6a7b-8c9d-0e1f-2a3b4c5d6e7f")  # Lẩu Dê 404
PLACE_5_ID = UUID("3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a")  # Trà Sữa Phê La

PLACE_6_ID = UUID("5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b")  # Quán Bụi (OSM)
PLACE_7_ID = UUID("6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c")  # Propaganda Saigon Bistro (OSM)

# Điểm hẹn: trung tâm Q.1 (gần phố đi bộ Nguyễn Huệ)
ORIGIN_LAT = 10.7769
ORIGIN_LNG = 106.7009

SCHEDULE_1_ID = UUID("4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d")


async def seed_data() -> None:
    """Nạp dữ liệu mẫu vào PostgreSQL."""
    async with AsyncSessionLocal() as session:
        print("🌱 Bắt đầu nạp dữ liệu mẫu (Seeding Đi Đâu Database)...")

        # 1. Xóa dữ liệu cũ nếu phòng DIDAU8 đã tồn tại
        existing_room = await session.scalar(
            select(Room).where((Room.id == ROOM_ID) | (Room.code == "DIDAU8"))
        )
        if existing_room:
            print(f"🔄 Tìm thấy phòng cũ ({existing_room.code}), đang làm sạch...")
            await session.execute(delete(Room).where(Room.id == existing_room.id))
            await session.commit()

        # 2. Tạo phòng mẫu (Room)
        room = Room(
            id=ROOM_ID,
            code="DIDAU8",
            title="Cuối tuần ăn sập Sài Gòn",
            description="Lên kèo ăn uống từ sáng tới đêm thứ 7 cùng nhóm bạn thân",
            event_date=date(2026, 10, 24),
            status=RoomStatus.PLANNING.value,
            tie_break_strategy=TieBreakStrategyName.EARLIEST_SUBMISSION.value,
            budget_limit=500000,
            city=CityCode.HCM.value,
            origin_lat=ORIGIN_LAT,
            origin_lng=ORIGIN_LNG,
            start_minute=1020,  # 17:00
            end_minute=1380,  # 23:00
        )
        session.add(room)
        await session.flush()
        print(f"✅ Đã tạo phòng: {room.title} (Code: {room.code})")

        # 3. Tạo 3 thành viên (Members)
        host = Member(
            id=HOST_MEMBER_ID,
            room_id=ROOM_ID,
            nickname="HoangNam",
            avatar_url="https://api.dicebear.com/7.x/bottts/svg?seed=HoangNam",
            role=MemberRole.HOST.value,
            token="a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
            is_active=True,
        )
        member2 = Member(
            id=MEMBER_2_ID,
            room_id=ROOM_ID,
            nickname="ThuTrang",
            avatar_url="https://api.dicebear.com/7.x/bottts/svg?seed=ThuTrang",
            role=MemberRole.MEMBER.value,
            token="b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
            is_active=True,
        )
        member3 = Member(
            id=MEMBER_3_ID,
            room_id=ROOM_ID,
            nickname="MinhKhoa",
            avatar_url="https://api.dicebear.com/7.x/bottts/svg?seed=MinhKhoa",
            role=MemberRole.MEMBER.value,
            token="c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
            is_active=True,
        )
        session.add_all([host, member2, member3])
        await session.flush()
        print("✅ Đã tạo 3 thành viên: HoangNam (Host), ThuTrang (Member), MinhKhoa (Member)")

        # 4. Tạo 5 địa điểm (Places)
        place1 = Place(
            id=PLACE_1_ID,
            room_id=ROOM_ID,
            submitted_by_id=HOST_MEMBER_ID,
            name="Cà Phê Trứng 3T",
            address="1A Tôn Đức Thắng, Bến Nghé, Quận 1, TP.HCM",
            latitude=10.7769,
            longitude=106.7058,
            category=PlaceCategory.DRINK.value,
            status=PlaceStatus.VOTING.value,
            url="https://shopeefood.vn/ho-chi-minh/ca-phe-trung-3t",
            notes="View ngắm bến Bạch Đằng và sông Sài Gòn cực đẹp",
            estimated_cost=55000,
            open_minute=420,  # 07:00
            close_minute=1380,  # 23:00
        )
        place2 = Place(
            id=PLACE_2_ID,
            room_id=ROOM_ID,
            submitted_by_id=MEMBER_2_ID,
            name="Cơm Tấm Ba Ghiền",
            address="84 Đặng Văn Ngữ, P.10, Q.Phú Nhuận, TP.HCM",
            latitude=10.7932,
            longitude=106.6743,
            category=PlaceCategory.FOOD.value,
            status=PlaceStatus.VOTING.value,
            url="https://shopeefood.vn/ho-chi-minh/com-tam-ba-ghien",
            notes="Sườn nướng siêu to khổng lồ đậm vị truyền thống",
            estimated_cost=95000,
            open_minute=450,  # 07:30
            close_minute=1260,  # 21:00
        )
        place3 = Place(
            id=PLACE_3_ID,
            room_id=ROOM_ID,
            submitted_by_id=HOST_MEMBER_ID,
            name="CGV Vincom Center Đồng Khởi",
            address="72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM",
            latitude=10.7781,
            longitude=106.7018,
            category=PlaceCategory.ENTERTAINMENT.value,
            status=PlaceStatus.VOTING.value,
            url="https://www.cgv.vn",
            notes="Xem phim bom tấn cuối tuần phòng chiếu IMAX",
            estimated_cost=150000,
            open_minute=480,  # 08:00
            close_minute=1410,  # 23:30
        )
        place4 = Place(
            id=PLACE_4_ID,
            room_id=ROOM_ID,
            submitted_by_id=MEMBER_3_ID,
            name="Lẩu Dê 404",
            address="436 Nguyễn Thị Thập, Tân Quy, Quận 7, TP.HCM",
            latitude=10.7412,
            longitude=106.7088,
            category=PlaceCategory.FOOD.value,
            status=PlaceStatus.PROPOSED.value,
            url="https://shopeefood.vn/ho-chi-minh/lau-de-404",
            notes="Lẩu dê thơm ngon, nước dùng đậm đà phù hợp ăn tối",
            estimated_cost=180000,
            open_minute=600,  # 10:00
            close_minute=1320,  # 22:00
        )
        place5 = Place(
            id=PLACE_5_ID,
            room_id=ROOM_ID,
            submitted_by_id=MEMBER_2_ID,
            name="Trà Sữa Phê La",
            address="125 Hồ Tùng Mậu, Bến Nghé, Quận 1, TP.HCM",
            latitude=10.7725,
            longitude=106.7032,
            category=PlaceCategory.DRINK.value,
            status=PlaceStatus.PROPOSED.value,
            url="https://phela.vn",
            notes="Ô long sữa chảo đặc sản nốt hương đậm đà",
            estimated_cost=60000,
            open_minute=480,  # 08:00
            close_minute=1380,  # 23:00
        )
        # Hai quán lấy từ snapshot OSM (external_id có thật trong app/data/pois_hcm.json.gz)
        place6 = Place(
            id=PLACE_6_ID,
            room_id=ROOM_ID,
            submitted_by_id=HOST_MEMBER_ID,
            name="Quán Bụi",
            address="39 Lý Tự Trọng, Quận 1",
            latitude=10.779185,
            longitude=106.702288,
            category=PlaceCategory.FOOD.value,
            status=PlaceStatus.VOTING.value,
            estimated_cost=150000,
            open_minute=480,  # 08:00
            close_minute=1380,  # 23:00
            source=PlaceSource.OSM.value,
            external_id="osm:node/6235215186",
            cuisine="vietnamese",
            opening_hours_raw="Mo-Su 08:00-23:00",
            coords_source="OSM",
        )
        place7 = Place(
            id=PLACE_7_ID,
            room_id=ROOM_ID,
            submitted_by_id=MEMBER_2_ID,
            name="Propaganda Saigon Bistro",
            address="21 Hàn Thuyên, Quận 1",
            latitude=10.778708,
            longitude=106.698088,
            category=PlaceCategory.FOOD.value,
            status=PlaceStatus.VOTING.value,
            estimated_cost=170000,
            open_minute=450,  # 07:30
            close_minute=1380,  # 23:00
            source=PlaceSource.OSM.value,
            external_id="osm:node/4183849494",
            cuisine="sandwich",
            opening_hours_raw="Mo-Su 07:30-23:00",
            coords_source="OSM",
        )
        session.add_all([place1, place2, place3, place4, place5, place6, place7])
        await session.flush()
        print("✅ Đã tạo 7 địa điểm (5 thêm tay + 2 từ OSM: Quán Bụi, Propaganda Saigon Bistro)")

        # 5. Tạo dữ liệu bỏ phiếu hòa phiếu (Tied Votes: mỗi quán 2 votes)
        votes = [
            # HoangNam upvotes Place 1 & Place 2
            Vote(place_id=PLACE_1_ID, member_id=HOST_MEMBER_ID, vote_value=1),
            Vote(place_id=PLACE_2_ID, member_id=HOST_MEMBER_ID, vote_value=1),
            # ThuTrang upvotes Place 1 & Place 3
            Vote(place_id=PLACE_1_ID, member_id=MEMBER_2_ID, vote_value=1),
            Vote(place_id=PLACE_3_ID, member_id=MEMBER_2_ID, vote_value=1),
            # MinhKhoa upvotes Place 2 & Place 3
            Vote(place_id=PLACE_2_ID, member_id=MEMBER_3_ID, vote_value=1),
            Vote(place_id=PLACE_3_ID, member_id=MEMBER_3_ID, vote_value=1),
            # Cả 3 người cùng upvote 2 quán OSM -> hòa ở đầu bảng (3 điểm) để demo Chọn hộ
            Vote(place_id=PLACE_6_ID, member_id=HOST_MEMBER_ID, vote_value=1),
            Vote(place_id=PLACE_6_ID, member_id=MEMBER_2_ID, vote_value=1),
            Vote(place_id=PLACE_6_ID, member_id=MEMBER_3_ID, vote_value=1),
            Vote(place_id=PLACE_7_ID, member_id=HOST_MEMBER_ID, vote_value=1),
            Vote(place_id=PLACE_7_ID, member_id=MEMBER_2_ID, vote_value=1),
            Vote(place_id=PLACE_7_ID, member_id=MEMBER_3_ID, vote_value=1),
        ]
        session.add_all(votes)
        await session.flush()
        print("✅ Đã tạo phiếu: Quán Bụi = Propaganda = 3 (hòa đầu bảng, demo Chọn hộ); Cà Phê 3T = Cơm Tấm = CGV = 2")

        # 6. Tạo 1 mục lịch trình mẫu (Schedule Item)
        schedule1 = ScheduleItem(
            id=SCHEDULE_1_ID,
            room_id=ROOM_ID,
            place_id=PLACE_1_ID,
            day_offset=0,
            start_minute=1020,  # 17:00
            end_minute=1080,  # 18:00
            order_index=0,
            note="Uống cà phê chiều tối và ngắm tàu thuyền trên sông Sài Gòn",
        )
        session.add(schedule1)
        await session.commit()
        print("✅ Đã tạo 1 mục lịch trình mẫu: Cà Phê Trứng 3T (17:00 - 18:00)")

        print("\n🎉 HOÀN THÀNH SEED DỮ LIỆU THÀNH CÔNG!")
        print("👉 Mã phòng tham gia: DIDAU8")
        print("👉 Token Host (HoangNam): a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d")
        print("👉 Token Member 2 (ThuTrang): b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e")
        print("👉 Token Member 3 (MinhKhoa): c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f")


def main() -> None:
    """Hàm chạy script chính."""
    asyncio.run(seed_data())


if __name__ == "__main__":
    main()
