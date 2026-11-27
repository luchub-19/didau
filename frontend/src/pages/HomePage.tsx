import React, { useReducer } from 'react';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/bricolage-grotesque/vietnamese-800.css';
import { CreateRoomModal, JoinRoomModal } from '../components/room';
import { tokenStorage } from '../services/storage/tokenStorage';
import { LandingPage } from '../landing/LandingPage';
import { HOME_MODAL_INITIAL, homeModalReducer } from '../landing/shell/ctaState';

export interface HomePageProps {
  onNavigateToRoom: (roomId: string) => void;
}

/**
 * Trang chủ (gđ11): landing "Sài Gòn về đêm". Tạo phòng / Nhập mã / Vào lại phòng mở đúng modal thật của app.
 * Hero cũ (quả cầu gđ9) đã xoá ở cổng G2 (2026-11-27); gsap giữ cho `stage/reveal`.
 */
export const HomePage: React.FC<HomePageProps> = ({ onNavigateToRoom }) => {
  const [modals, dispatch] = useReducer(homeModalReducer, HOME_MODAL_INITIAL);
  const savedRoomCode = tokenStorage.getRoomCode();

  return (
    <>
      <LandingPage
        onCreate={() => dispatch({ type: 'create' })}
        onJoin={() => dispatch({ type: 'join' })}
        resumeCode={savedRoomCode}
        onResume={() => dispatch({ type: 'resume', code: savedRoomCode })}
      />

      <CreateRoomModal
        isOpen={modals.modal === 'create'}
        onClose={() => dispatch({ type: 'close' })}
        onSuccess={onNavigateToRoom}
      />

      <JoinRoomModal
        isOpen={modals.modal === 'join'}
        onClose={() => dispatch({ type: 'close' })}
        initialCode={modals.joinCode}
        onSuccess={onNavigateToRoom}
      />
    </>
  );
};
