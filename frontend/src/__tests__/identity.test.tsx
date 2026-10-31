// T-68: avatar nhân vật, "N đang xem", menu danh tính.
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../i18n';
import { Avatar } from '../components/ui';
import {
  AVATAR_STYLE,
  avatarUrlFor,
  characterDataUri,
  parseAvatarUrl,
  randomSeed,
  resolveAvatarSeed,
} from '../components/ui/characterAvatar';
import { IdentityMenu, ViewersButton } from '../components/shell/IdentityMenu';
import { identityMenuItems, splitViewers, viewerIds } from '../components/shell/identity';
import { PRESENCE_TTL_MS, type PeerMap } from '../stage/presence/rules';
import { mockGuestMember, mockHostMember, mockRoom } from '../mocks/mockData';
import { vi } from '../i18n/locales/vi';
import { en } from '../i18n/locales/en';

describe('parseAvatarUrl / avatarUrlFor', () => {
  it('đọc style và seed từ URL DiceBear hợp lệ (kể cả bản 7.x cũ)', () => {
    expect(parseAvatarUrl('https://api.dicebear.com/9.x/thumbs/svg?seed=Lan')).toEqual({ style: 'thumbs', seed: 'Lan' });
    expect(parseAvatarUrl('https://api.dicebear.com/7.x/bottts/svg?seed=HoangNam')).toEqual({
      style: 'bottts',
      seed: 'HoangNam',
    });
  });

  it('giải mã seed có ký tự đặc biệt', () => {
    expect(parseAvatarUrl(avatarUrlFor('Bình An/1'))?.seed).toBe('Bình An/1');
  });

  it('rỗng, lạ, thiếu seed → null và dùng seed dự phòng', () => {
    for (const bad of [undefined, null, '', 'abc', 'https://evil.example/x.svg?seed=a', 'https://api.dicebear.com/9.x/thumbs/svg']) {
      expect(parseAvatarUrl(bad)).toBeNull();
      expect(resolveAvatarSeed(bad, 'member-1')).toBe('member-1');
    }
    expect(resolveAvatarSeed('https://api.dicebear.com/9.x/thumbs/svg?seed=Lan', 'member-1')).toBe('Lan');
  });

  it('avatarUrlFor ra URL chuẩn DiceBear 9.x và parse ngược được', () => {
    const url = avatarUrlFor('abc');
    expect(url).toBe(`https://api.dicebear.com/9.x/${AVATAR_STYLE}/svg?seed=abc`);
    expect(parseAvatarUrl(url)).toEqual({ style: AVATAR_STYLE, seed: 'abc' });
  });

  it('randomSeed khác nhau giữa các lần gọi', () => {
    expect(randomSeed()).not.toBe(randomSeed());
  });
});

describe('CharacterAvatar', () => {
  it('cùng seed ra cùng SVG, khác seed ra SVG khác', () => {
    expect(characterDataUri('lan')).toBe(characterDataUri('lan'));
    expect(characterDataUri('lan')).not.toBe(characterDataUri('binh'));
    expect(characterDataUri('lan')).toMatch(/^data:image\/svg\+xml/);
  });

  it('avatar_url và id cùng seed ra đúng một hình; URL lạ rơi về seed dự phòng', () => {
    const a = renderToStaticMarkup(<Avatar name="Lan" avatarUrl={avatarUrlFor('x1')} seed="m1" />);
    const b = renderToStaticMarkup(<Avatar name="Lan" avatarUrl={avatarUrlFor('x1')} seed="m2" />);
    expect(a).toBe(b); // URL thắng seed dự phòng
    const c = renderToStaticMarkup(<Avatar name="Lan" avatarUrl="" seed="m1" />);
    const d = renderToStaticMarkup(<Avatar name="Lan" avatarUrl="rác" seed="m1" />);
    expect(c).toBe(d);
    expect(c).not.toBe(a);
  });
});

describe('viewerIds / splitViewers (TTL 15 s)', () => {
  const members = [mockHostMember, mockGuestMember];
  const peer = (at: number): PeerMap[string] => ({ focus: { kind: 'map', lng: 1, lat: 1 }, at });

  it('chỉ mình khi chưa có peer', () => {
    expect(viewerIds({}, mockHostMember.id, members, 1000)).toEqual([mockHostMember.id]);
  });

  it('cộng peer còn hạn, bỏ peer quá hạn, bỏ peer không còn trong phòng, không đếm mình hai lần', () => {
    const now = 100_000;
    const peers: PeerMap = {
      [mockGuestMember.id]: peer(now - 1000),
      [mockHostMember.id]: peer(now - 10), // chính mình
      ghost: peer(now - 10),
    };
    expect(viewerIds(peers, mockHostMember.id, members, now)).toEqual([mockHostMember.id, mockGuestMember.id]);
    expect(viewerIds({ [mockGuestMember.id]: peer(now - PRESENCE_TTL_MS) }, mockHostMember.id, members, now)).toEqual([
      mockHostMember.id,
    ]);
  });

  it('chia Đang xem / Vắng, mình đứng đầu nhóm xem', () => {
    const both = splitViewers(members, [mockGuestMember.id, mockHostMember.id]); // mình = khách
    expect(both.viewing.map((m) => m.id)).toEqual([mockGuestMember.id, mockHostMember.id]);
    expect(both.away).toEqual([]);
    const solo = splitViewers(members, [mockGuestMember.id]);
    expect(solo.viewing.map((m) => m.id)).toEqual([mockGuestMember.id]);
    expect(solo.away.map((m) => m.id)).toEqual([mockHostMember.id]);
  });
});

describe('IdentityMenu', () => {
  const base = {
    room: mockRoom,
    members: [mockHostMember, mockGuestMember],
    placesCount: 3,
    scheduleCount: 2,
    isConnected: true,
    defaultOpen: true,
    onOpenTieBreakModal: () => {},
  };

  it('chỉ chủ phòng, khi chưa chốt, thấy nút chọn chiến lược hoà phiếu', () => {
    expect(identityMenuItems(true, 'VOTING').tieBreak).toBe(true);
    expect(identityMenuItems(true, 'FINALIZED').tieBreak).toBe(false);
    expect(identityMenuItems(false, 'VOTING').tieBreak).toBe(false);

    const host = renderToStaticMarkup(
      <IdentityMenu {...base} room={{ ...mockRoom, status: 'VOTING' }} currentMember={mockHostMember} isHost />,
    );
    const guest = renderToStaticMarkup(
      <IdentityMenu {...base} room={{ ...mockRoom, status: 'VOTING' }} currentMember={mockGuestMember} isHost={false} />,
    );
    expect(host).toContain(vi.room.summary.tieBreakAction);
    expect(guest).not.toContain(vi.room.summary.tieBreakAction);
  });

  it('có đủ mục: mời, thành viên, thông tin chuyến, ngôn ngữ, giao diện, âm thanh; nhãn nút nêu vai trò', () => {
    const html = renderToStaticMarkup(<IdentityMenu {...base} currentMember={mockHostMember} isHost />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain(vi.invite.codeLabel);
    expect(html).toContain(vi.member.title);
    expect(html).toContain(vi.room.summary.title);
    expect(html).toContain(vi.group.language);
    expect(html).toContain(vi.group.theme);
    expect(html).toContain(vi.group.sound);
    expect(html).toContain(vi.member.host); // vai trò trong nhãn nút
    const guest = renderToStaticMarkup(<IdentityMenu {...base} currentMember={mockGuestMember} isHost={false} />);
    expect(guest).toContain(vi.member.guest);
  });

  it('đóng thì không dựng panel; nút có aria-expanded', () => {
    const html = renderToStaticMarkup(<IdentityMenu {...base} defaultOpen={false} currentMember={mockHostMember} isHost />);
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it('viền avatar phản ánh kết nối, không còn pill "Trực tiếp"', () => {
    const on = renderToStaticMarkup(<IdentityMenu {...base} defaultOpen={false} currentMember={mockHostMember} isHost />);
    const off = renderToStaticMarkup(
      <IdentityMenu {...base} defaultOpen={false} isConnected={false} currentMember={mockHostMember} isHost />,
    );
    expect(on).toContain('ring-success');
    expect(on).toContain('data-connected="true"');
    expect(off).toContain('ring-warning');
    expect(off).toContain('data-connected="false"');
  });
});

describe('ViewersButton', () => {
  it('đếm mình khi chưa có peer', () => {
    const html = renderToStaticMarkup(
      <ViewersButton members={[mockHostMember, mockGuestMember]} currentMember={mockHostMember} isConnected />,
    );
    expect(html).toContain('1 người đang xem');
    expect(html).toContain('aria-haspopup="dialog"');
  });
});

describe('i18n identity', () => {
  it('VI và EN có cùng bộ khoá identity/avatar', () => {
    expect(Object.keys(en.identity).sort()).toEqual(Object.keys(vi.identity).sort());
    expect(Object.keys(en.avatar).sort()).toEqual(Object.keys(vi.avatar).sort());
  });
});
