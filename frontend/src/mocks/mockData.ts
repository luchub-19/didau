import type {
  ConflictAlert,
  Member,
  Place,
  Room,
  ScheduleItem,
} from '../types';

export const MOCK_HOST_TOKEN = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
export const MOCK_MEMBER_TOKEN = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';

export const mockRoom: Room = {
  id: 'c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21',
  code: 'DIDAU8',
  title: 'Cuối tuần ăn sập Sài Gòn',
  description: 'Lên kèo ăn uống từ sáng tới đêm thứ 7',
  event_date: '2026-10-24',
  status: 'PLANNING',
  tie_break_strategy: 'EARLIEST_SUBMISSION',
  budget_limit: 500000,
  created_at: '2026-10-17T07:30:00Z',
  updated_at: '2026-10-17T07:30:00Z',
};

export const mockHostMember: Member = {
  id: 'e4a2d815-1a3b-4c22-b5f7-920478bf1144',
  room_id: 'c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21',
  nickname: 'HoangNam',
  avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=HoangNam',
  role: 'HOST',
  is_active: true,
  joined_at: '2026-10-17T07:30:00Z',
};

export const mockGuestMember: Member = {
  id: 'f5c3b927-2b4c-4d33-a6e8-031589ca2255',
  room_id: 'c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21',
  nickname: 'ThuTrang',
  avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=ThuTrang',
  role: 'MEMBER',
  is_active: true,
  joined_at: '2026-10-17T07:35:00Z',
};

export const mockPlaces: Place[] = [
  {
    id: '8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b',
    room_id: 'c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21',
    submitted_by_id: 'e4a2d815-1a3b-4c22-b5f7-920478bf1144',
    submitted_by_nickname: 'HoangNam',
    name: 'Cà Phê Trứng 3T',
    address: '1A Tôn Đức Thắng, Bến Nghé, Quận 1, TP.HCM',
    latitude: 10.7769,
    longitude: 106.7058,
    category: 'DRINK',
    status: 'VOTING',
    url: 'https://shopeefood.vn/ho-chi-minh/ca-phe-trung-3t',
    notes: 'View bờ sông Sài Gòn cực đẹp',
    estimated_cost: 55000,
    open_minute: 420,
    close_minute: 1380,
    upvotes: 4,
    downvotes: 1,
    score: 3,
    current_user_vote: 1,
    created_at: '2026-10-17T07:40:00Z',
  },
  {
    id: '9a4f3c2b-0d5e-5f6a-9b2c-8d7e6f5a4b3c',
    room_id: 'c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21',
    submitted_by_id: 'f5c3b927-2b4c-4d33-a6e8-031589ca2255',
    submitted_by_nickname: 'ThuTrang',
    name: 'Cơm Tấm Ba Ghiền',
    address: '84 Đặng Văn Ngữ, P.10, Q.Phú Nhuận, TP.HCM',
    latitude: 10.7932,
    longitude: 106.6743,
    category: 'FOOD',
    status: 'VOTING',
    url: 'https://shopeefood.vn/ho-chi-minh/com-tam-ba-ghien',
    notes: 'Sườn nướng siêu to khổng lồ',
    estimated_cost: 95000,
    open_minute: 450,
    close_minute: 1260,
    upvotes: 3,
    downvotes: 0,
    score: 3,
    current_user_vote: 1,
    created_at: '2026-10-17T07:42:00Z',
  },
  {
    id: '1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e',
    room_id: 'c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21',
    submitted_by_id: 'e4a2d815-1a3b-4c22-b5f7-920478bf1144',
    submitted_by_nickname: 'HoangNam',
    name: 'CGV Vincom Center Đồng Khởi',
    address: '72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM',
    latitude: 10.7781,
    longitude: 106.7018,
    category: 'ENTERTAINMENT',
    status: 'PROPOSED',
    url: 'https://www.cgv.vn',
    notes: 'Xem phim bom tấn',
    estimated_cost: 150000,
    open_minute: 480,
    close_minute: 1410,
    upvotes: 1,
    downvotes: 0,
    score: 1,
    current_user_vote: 0,
    created_at: '2026-10-17T07:45:00Z',
  },
];

export const mockScheduleItems: ScheduleItem[] = [
  {
    id: '4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d',
    room_id: 'c1f7a0b3-6c8a-4d45-9e28-86d48e89ef21',
    place_id: '8f3e2b1a-9c4d-4e5f-8a1b-7c6d5e4f3a2b',
    place_name: 'Cà Phê Trứng 3T',
    place_address: '1A Tôn Đức Thắng, Q1',
    day_offset: 0,
    start_minute: 540,
    end_minute: 630,
    order_index: 0,
    note: 'Uống cà phê sáng và ngắm tàu thuyền',
  },
];

export const mockConflicts: ConflictAlert[] = [
  {
    id: '3c4d5e6f-7a8b-9c0d-1e2f-3a4b5c6d7e8f',
    rule_code: 'TIME_OVERLAP',
    level: 'CRITICAL',
    message:
      "Trùng lặp thời gian: 'Cà Phê Trứng 3T' (09:00 - 10:30) bị đè khung giờ với 'Cơm Tấm Ba Ghiền' (10:00 - 11:30)",
    entity_type: 'SCHEDULE',
    entity_ids: [
      '4a5b6c7d-8e9f-0a1b-2c3d-4e5f6a7b8c9d',
      '5b6c7d8e-9f0a-1b2c-3d4e-5f6a7b8c9d0e',
    ],
    resolved: false,
    created_at: '2026-10-17T07:45:00Z',
  },
];
