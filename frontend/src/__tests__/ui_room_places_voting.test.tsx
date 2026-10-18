import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/handlers';
import { tokenStorage } from '../services/storage/tokenStorage';
import { mockRoom, mockHostMember, mockGuestMember, mockPlaces, MOCK_HOST_TOKEN } from '../mocks/mockData';
import { useRoomStore } from '../store/useRoomStore';
import { usePlaceStore } from '../store/usePlaceStore';

// Common components
import { Button, Input, Modal, Badge, CategoryIcon, Header } from '../components/common';
import { CATEGORY_METADATA } from '../components/common/categoryMetadata';

// Room components
import { CreateRoomModal, JoinRoomModal, MemberList, InviteCard } from '../components/room';
// RoomHeader đã gỡ khỏi index (T-50), file giữ đến T-51
import { RoomHeader } from '../components/room/RoomHeader';

// Places components
import { CategoryFilter, PlaceCard, PlaceForm, PlaceList } from '../components/places';

// Voting components
import { VoteButtons, VoteScoreBadge, TieBreakSelectorModal } from '../components/voting';

// Pages
import { HomePage } from '../pages/HomePage';
import { RoomPage } from '../pages/RoomPage';
import App from '../App';
import type { PlaceCategory } from '../types';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  resetMockDb();
  tokenStorage.clearAll();
  useRoomStore.getState().reset();
  usePlaceStore.getState().reset();
});

afterAll(() => {
  server.close();
});

describe('T-18: Frontend UI - Room Creation, Joining & Member List View', () => {
  it('render Common UI components (Button, Input, Badge, Header, Modal) chính xác', () => {
    const btnHtml = renderToStaticMarkup(
      <Button variant="primary" size="md">
        Khởi tạo
      </Button>,
    );
    expect(btnHtml).toContain('Khởi tạo');
    expect(btnHtml).toContain('bg-sky-500');

    const inputHtml = renderToStaticMarkup(
      <Input label="Biệt danh" placeholder="Nhập tên..." value="HoangNam" readOnly />,
    );
    expect(inputHtml).toContain('Biệt danh');
    expect(inputHtml).toContain('HoangNam');

    const badgeHtml = renderToStaticMarkup(<Badge variant="HOST">HOST</Badge>);
    expect(badgeHtml).toContain('HOST');
    expect(badgeHtml).toContain('bg-amber-100');

    const headerHtml = renderToStaticMarkup(<Header />);
    expect(headerHtml).toContain('Đi Đâu');
    expect(headerHtml).toContain('VI');

    const modalHtml = renderToStaticMarkup(
      <Modal isOpen={true} onClose={() => {}} title="Tiêu đề Modal">
        <div>Nội dung bên trong</div>
      </Modal>,
    );
    expect(modalHtml).toContain('Tiêu đề Modal');
    expect(modalHtml).toContain('Nội dung bên trong');
  });

  it('RoomHeader hiển thị tiêu đề, ngày hẹn, mã phòng và vai trò Host/Member', () => {
    const html = renderToStaticMarkup(
      <RoomHeader
        room={mockRoom}
        currentMember={mockHostMember}
        onGoHome={() => {}}
        onOpenTieBreakModal={() => {}}
      />,
    );

    expect(html).toContain(mockRoom.title);
    expect(html).toContain(mockRoom.code);
    expect(html).toContain('HOST');
    expect(html).toContain('Chốt kết quả (TieBreak)');
    expect(html).toContain('Sao chép mã phòng');
  });

  it('MemberList hiển thị avatar, nickname, nhãn Chủ phòng, Bạn và trạng thái online', () => {
    const members = [mockGuestMember, mockHostMember];
    const html = renderToStaticMarkup(
      <MemberList members={members} currentMemberId={mockHostMember.id} />,
    );

    expect(html).toContain('Thành viên');
    expect(html).toContain(mockHostMember.nickname);
    expect(html).toContain(mockGuestMember.nickname);
    expect(html).toContain('Chủ phòng');
    expect(html).toContain('Bạn');
    expect(html).toContain('Đang online');
  });

  it('MemberList xếp online trước và đổi sang "Không rõ" khi mất kết nối', () => {
    const offline = { ...mockGuestMember, is_active: false };
    const html = renderToStaticMarkup(
      <MemberList members={[offline, mockHostMember]} />,
    );
    expect(html.indexOf(mockHostMember.nickname)).toBeLessThan(
      html.indexOf(offline.nickname),
    );
    expect(html).toContain('Đã rời phòng');

    const disconnected = renderToStaticMarkup(
      <MemberList members={[mockHostMember]} isConnected={false} />,
    );
    expect(disconnected).toContain('Không rõ');
    expect(disconnected).not.toContain('Đang online');
  });

  it('InviteCard hiển thị mã phòng, nút mời và gợi ý khi chỉ có một mình', () => {
    const html = renderToStaticMarkup(
      <InviteCard roomId={mockRoom.id} code={mockRoom.code} title={mockRoom.title} alone />,
    );
    expect(html).toContain(mockRoom.code);
    expect(html).toContain('Mời bạn bè');
    expect(html).toContain('Sao chép mã');
    expect(html).toContain('Chưa có ai khác trong phòng');
  });

  it('tạo phòng mới qua store và modal hoạt động', async () => {
    const res = await useRoomStore.getState().createRoom({
      title: 'Kèo Nhậu Tân Bình',
      event_date: '2026-10-30',
      creator_nickname: 'ThanhTung',
    });

    expect(res.room.title).toBe('Kèo Nhậu Tân Bình');
    expect(res.creator_member.nickname).toBe('ThanhTung');
    expect(res.creator_member.role).toBe('HOST');
    expect(tokenStorage.getToken()).toBe(res.member_token);

    const modalHtml = renderToStaticMarkup(
      <CreateRoomModal isOpen={true} onClose={() => {}} onSuccess={() => {}} />,
    );
    expect(modalHtml).toContain('Tạo phòng mới');
    expect(modalHtml).toContain('Tên phòng');
  });

  it('tham gia phòng qua store và modal hoạt động', async () => {
    const res = await useRoomStore.getState().joinRoom({
      room_code: 'DIDAU8',
      nickname: 'BaoNgoc',
    });

    expect(res.member.nickname).toBe('BaoNgoc');
    expect(res.member.role).toBe('MEMBER');
    expect(tokenStorage.getToken()).toBe(res.member_token);

    const modalHtml = renderToStaticMarkup(
      <JoinRoomModal isOpen={true} onClose={() => {}} onSuccess={() => {}} />,
    );
    expect(modalHtml).toContain('Vào phòng');
    expect(modalHtml).toContain('Mã phòng');
  });
});

describe('T-19: Frontend UI - Place Suggestion, Auto-category Badge & Place Cards', () => {
  it('CategoryIcon render chính xác biểu tượng và nhãn cho 7 danh mục', () => {
    const categories: PlaceCategory[] = [
      'FOOD',
      'DRINK',
      'ENTERTAINMENT',
      'SIGHTSEEING',
      'ACCOMMODATION',
      'SHOPPING',
      'OTHER',
    ];

    categories.forEach((cat) => {
      const html = renderToStaticMarkup(<CategoryIcon category={cat} />);
      const meta = CATEGORY_METADATA[cat];
      const expectedLabel = meta.label.replace('&', '&amp;');
      expect(html).toContain(expectedLabel);
      expect(html).toContain('<svg');
    });
  });

  it('CategoryFilter hiển thị số lượng quán chính xác cho từng danh mục', () => {
    const html = renderToStaticMarkup(
      <CategoryFilter
        places={mockPlaces}
        selectedCategory="ALL"
        onSelectCategory={() => {}}
      />,
    );

    expect(html).toContain('Tất cả');
    expect(html).toContain(mockPlaces.length.toString());
    expect(html).toContain('Ăn uống');
    expect(html).toContain('Cà phê');
  });

  it('PlaceCard hiển thị tên quán, giá, giờ mở cửa, badge danh mục và người gửi', () => {
    const place = mockPlaces[0];
    const html = renderToStaticMarkup(
      <PlaceCard
        place={place}
        roomId={mockRoom.id}
        currentMemberId={mockHostMember.id}
        isHost={true}
        onDeletePlace={() => {}}
      />,
    );

    expect(html).toContain(place.name);
    expect(html).toContain('55.000');
    expect(html).toContain('07:00 - 23:00');
    expect(html).toContain('HoangNam');
    expect(html).toContain('VOTING');
  });

  it('PlaceForm hiển thị đầy đủ trường nhập và thêm quán thành công qua MSW', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);

    const newPlace = await usePlaceStore.getState().addPlace(mockRoom.id, {
      name: 'Trà Sữa Koi Thé',
      estimated_cost: 65000,
    });

    expect(newPlace.name).toBe('Trà Sữa Koi Thé');
    // Auto-category detector in MSW maps "Trà" to DRINK
    expect(newPlace.category).toBe('DRINK');

    const formHtml = renderToStaticMarkup(
      <PlaceForm isOpen={true} onClose={() => {}} roomId={mockRoom.id} />,
    );
    expect(formHtml).toContain('Đề xuất quán mới');
    expect(formHtml).toContain('Tên quán hoặc link');
  });

  it('PlaceList hiển thị danh sách các quán và thanh sắp xếp', () => {
    const html = renderToStaticMarkup(
      <PlaceList
        places={mockPlaces}
        roomId={mockRoom.id}
        selectedCategory="ALL"
        currentMemberId={mockHostMember.id}
        isHost={true}
        onOpenAddModal={() => {}}
        onDeletePlace={() => {}}
      />,
    );

    expect(html).toContain('Điểm cao nhất');
    expect(html).toContain('Thêm quán');
    mockPlaces.forEach((p) => {
      expect(html).toContain(p.name);
    });
  });

  it('PlaceList hiển thị ô tìm kiếm khi danh sách có hơn 8 quán', () => {
    const manyPlaces = Array.from({ length: 9 }, (_, i) => ({
      ...mockPlaces[0],
      id: `p-${i}`,
      name: `Quán ăn số ${i + 1}`,
    }));
    const html = renderToStaticMarkup(
      <PlaceList
        places={manyPlaces}
        roomId={mockRoom.id}
        selectedCategory="ALL"
        onOpenAddModal={() => {}}
        onDeletePlace={() => {}}
      />,
    );
    expect(html).toContain('Tìm theo tên quán, địa chỉ…');
  });
});

describe('T-20: Frontend UI - Realtime Voting & Host TieBreak Modal', () => {
  it('VoteScoreBadge và VoteButtons hiển thị điểm số và trạng thái vote', () => {
    const scoreBadgeHtml = renderToStaticMarkup(
      <VoteScoreBadge score={4} upvotes={5} downvotes={1} />,
    );
    expect(scoreBadgeHtml).toContain('+4');
    expect(scoreBadgeHtml).toContain('(+5/-1)');

    // Upvoted state (currentUserVote = 1) -> accent-soft active style
    const upvotedButtonsHtml = renderToStaticMarkup(
      <VoteButtons
        roomId={mockRoom.id}
        placeId={mockPlaces[0].id}
        upvotes={5}
        downvotes={1}
        score={4}
        currentUserVote={1}
      />,
    );
    expect(upvotedButtonsHtml).toContain('bg-accent-soft');
    expect(upvotedButtonsHtml).toContain('+4');

    // Downvoted state (currentUserVote = -1) -> danger-soft active style
    const downvotedButtonsHtml = renderToStaticMarkup(
      <VoteButtons
        roomId={mockRoom.id}
        placeId={mockPlaces[0].id}
        upvotes={2}
        downvotes={3}
        score={-1}
        currentUserVote={-1}
      />,
    );
    expect(downvotedButtonsHtml).toContain('bg-danger-soft');
    expect(downvotedButtonsHtml).toContain('-1');
  });

  it('bỏ phiếu (+1) và hủy vote cập nhật điểm số qua store', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    await usePlaceStore.getState().fetchPlaces(mockRoom.id);

    const places = usePlaceStore.getState().places;
    expect(places.length).toBeGreaterThan(0);
    // Choose place with current_user_vote === 0
    const targetPlace = places.find((p) => p.current_user_vote === 0) || places[0];
    const initialUpvotes = targetPlace.upvotes;

    // Cast vote +1
    await usePlaceStore.getState().castVote(mockRoom.id, targetPlace.id, 1);
    const updated = usePlaceStore.getState().places.find((p) => p.id === targetPlace.id);
    expect(updated?.current_user_vote).toBe(1);
    expect(updated?.upvotes).toBe(initialUpvotes + 1);

    // Retract vote
    await usePlaceStore.getState().retractVote(mockRoom.id, targetPlace.id);
    const retracted = usePlaceStore.getState().places.find((p) => p.id === targetPlace.id);
    expect(retracted?.current_user_vote).toBe(0);
    expect(retracted?.upvotes).toBe(initialUpvotes);
  });

  it('TieBreakSelectorModal hiển thị 5 chiến lược phân định và chốt vote thành công', async () => {
    tokenStorage.setToken(MOCK_HOST_TOKEN);
    await usePlaceStore.getState().fetchPlaces(mockRoom.id);

    const modalHtml = renderToStaticMarkup(
      <TieBreakSelectorModal
        isOpen={true}
        onClose={() => {}}
        roomId={mockRoom.id}
        defaultStrategy="MOST_UPVOTES"
      />,
    );

    expect(modalHtml).toContain('Chốt kết quả bình chọn');
    expect(modalHtml).toContain('Xử lý hòa phiếu');
    expect(modalHtml).toContain('Nhiều Upvote nhất (Most Upvotes)');
    expect(modalHtml).toContain('Đề xuất sớm nhất (Earliest Submission)');
    expect(modalHtml).toContain('Ưu tiên Host (Creator Priority)');
    expect(modalHtml).toContain('Đa dạng danh mục (Category Diversity)');
    expect(modalHtml).toContain('Ngẫu nhiên công bằng (Random)');

    // Resolve voting
    const res = await usePlaceStore.getState().resolveVoting(mockRoom.id, {
      strategy: 'MOST_UPVOTES',
      max_accepted_places: 2,
    });

    expect(res.tie_break_applied).toBe(true);
    expect(res.resolved_places.length).toBeLessThanOrEqual(2);
    expect(res.resolved_places[0].status).toBe('ACCEPTED');

    // Check store updated
    const acceptedPlaces = usePlaceStore.getState().places.filter((p) => p.status === 'ACCEPTED');
    expect(acceptedPlaces.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Page Integration & App Routing', () => {
  it('HomePage render tiêu đề, hai nút chính và 3 bước cách chơi', () => {
    const html = renderToStaticMarkup(<HomePage onNavigateToRoom={() => {}} />);
    expect(html).toContain('Tối nay nhóm mình đi đâu?');
    expect(html).toContain('Tạo phòng');
    expect(html).toContain('Nhập mã phòng');
    expect(html).toContain('Cách chơi');
    expect(html.match(/<li/g)?.length).toBe(3);
  });

  it('RoomPage render trạng thái loading ban đầu khi chưa mount', () => {
    const html = renderToStaticMarkup(
      <RoomPage roomId={mockRoom.id} onGoHome={() => {}} />,
    );

    expect(html).toContain('Đang tải dữ liệu chuyến đi...');
  });

  it('App render mặc định vào HomePage', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Tối nay nhóm mình đi đâu?');
  });
});

describe('T-45: Tab Quán (danh sách, lọc, vote, thêm quán)', () => {
  it('tên quán dài 80 ký tự hiển thị an toàn với line-clamp-2', () => {
    const longNamePlace = {
      ...mockPlaces[0],
      name: 'Quán ăn ngon ơi là ngon có một không hai tại số 123 đường Nguyễn Huệ quận nhất Sài Gòn',
    };
    const html = renderToStaticMarkup(
      <PlaceCard place={longNamePlace} roomId={mockRoom.id} onDeletePlace={() => {}} />,
    );
    expect(html).toContain('line-clamp-2');
    expect(html).toContain(longNamePlace.name);
  });

  it('danh sách 50 quán render thành công không gặp lỗi', () => {
    const fiftyPlaces = Array.from({ length: 50 }, (_, i) => ({
      ...mockPlaces[0],
      id: `place-${i}`,
      name: `Quán ăn thử nghiệm ${i + 1}`,
    }));
    const html = renderToStaticMarkup(
      <PlaceList
        places={fiftyPlaces}
        roomId={mockRoom.id}
        selectedCategory="ALL"
        onOpenAddModal={() => {}}
        onDeletePlace={() => {}}
      />,
    );
    expect(html).toContain('Quán ăn thử nghiệm 1');
    expect(html).toContain('Quán ăn thử nghiệm 50');
  });

  it('quán đang dẫn đầu được nhấn bằng viền/nền coral nhẹ', () => {
    const places = [
      { ...mockPlaces[0], id: 'p-1', score: 10 },
      { ...mockPlaces[1], id: 'p-2', score: 3 },
    ];
    const html = renderToStaticMarkup(
      <PlaceList
        places={places}
        roomId={mockRoom.id}
        selectedCategory="ALL"
        onOpenAddModal={() => {}}
        onDeletePlace={() => {}}
      />,
    );
    expect(html).toContain('bg-accent-soft/30');
  });

  it('quán ACCEPTED hiển thị nhãn Đã chốt màu success', () => {
    const acceptedPlace = { ...mockPlaces[0], status: 'ACCEPTED' as const };
    const html = renderToStaticMarkup(
      <PlaceCard place={acceptedPlace} roomId={mockRoom.id} />,
    );
    expect(html).toContain('Đã chốt');
    expect(html).toContain('bg-success-soft');
    expect(html).toContain('text-success');
  });

  it('nút vote có kích thước chạm tối thiểu 44x44px phục vụ mobile', () => {
    const html = renderToStaticMarkup(
      <VoteButtons
        roomId={mockRoom.id}
        placeId={mockPlaces[0].id}
        upvotes={3}
        downvotes={0}
        score={3}
        currentUserVote={0}
      />,
    );
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('min-w-[44px]');
  });
});

