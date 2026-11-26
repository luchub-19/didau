// ★ Phần 5 của landing: "Hoà rồi. Ai phải chạy xa nhất?" (gđ11 T-128, PLAN §4.1 phần 5, mock v3 khối "3. Hoà phiếu").
// Người xem là người thứ 5: chọn quận / bấm / kéo / phím mũi tên → `evaluate` (OMP thật hoặc tổng km, dữ liệu Valhalla
// tính sẵn) → bảng người xa nhất + lời kết luận + đường trên bản đồ. Điểm của người xem không rời trình duyệt.
import React, { useMemo, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMotionTier } from '../../motion/useMotionTier';
import { playSound } from '../../sound/useSound';
import { CAST, avatarFor } from '../cast';
import demoJson from '../data/demoCase.json';
import gridJson from '../data/grid.json';
import { evaluate, type ExploreMode } from '../logic/explore';
import type { DemoCaseData, GridData, LngLat } from '../logic/types';
import { Section } from '../shell/Section';
import { DistrictChips } from './DistrictChips';
import { FarthestBoard } from './FarthestBoard';
import { ModeSwitch } from './ModeSwitch';
import { TieMap } from './TieMap';
import { Verdict } from './Verdict';
import { boardModel, initialTie, legMinutes, tieReducer, verdictModel, type TieAction, type TieState } from './model';
import './explore.css';

export const DEMO = demoJson as unknown as DemoCaseData;
export const GRID = gridJson as unknown as GridData;

export interface ExploreTieProps {
  /** Chỉ cho test: trạng thái đầu khác (đã đặt điểm, chế độ tổng km…). */
  initial?: TieState;
}

export const ExploreTie: React.FC<ExploreTieProps> = ({ initial }) => {
  const { t } = useTranslation();
  const tier = useMotionTier();
  const still = tier === 'static';
  const [state, rawDispatch] = useReducer(tieReducer, initial ?? initialTie());
  // Lần dựng đầu không diễn lời kết luận; từ thao tác đầu tiên trở đi mới diễn
  const touched = useRef(false);
  const dispatch = (a: TieAction) => {
    touched.current = true;
    rawDispatch(a);
  };

  const result = useMemo(() => evaluate(DEMO, GRID, state.you, state.mode), [state.you, state.mode]);
  const board = useMemo(() => boardModel(DEMO, result), [result]);
  const verdict = useMemo(() => verdictModel(result, state.mode), [result, state.mode]);
  const legs = useMemo(() => legMinutes(result), [result]);
  const note = state.you ? t(result.estimated ? 'landing.tie.noteEstimate' : 'landing.tie.noteGrid') : null;

  const place = (ll: LngLat) => {
    dispatch({ type: 'place', ll });
    playSound('tick');
  };

  return (
    <Section id="tie" titleId="tie-title" tone="night-2" title={t('landing.tie.title')} sub={t('landing.tie.sub')}>
      <ul className="tie-cast">
        {CAST.map((c) => (
          <li key={c.id}>
            <img src={avatarFor(c.id)} alt="" width={28} height={28} />
            {c.id} · {t(`landing.district.${c.district}`)}
          </li>
        ))}
      </ul>
      <div className="tie-explore">
        <TieMap
          demo={DEMO}
          you={state.you}
          drop={state.drop}
          still={still}
          pickId={result.pickId}
          legs={legs}
          ask={
            <DistrictChips
              area={state.area}
              onPick={(area) => {
                dispatch({ type: 'chip', area });
                playSound('tick');
              }}
            />
          }
          onPlace={place}
          onDrag={(ll) => dispatch({ type: 'drag', ll })}
          onDragEnd={() => playSound('tick')}
          onNudge={(key) => dispatch({ type: 'nudge', key })}
        />
        <div className="tie-side">
          <ModeSwitch mode={state.mode} onChange={(mode: ExploreMode) => dispatch({ type: 'mode', mode })} />
          <Verdict model={verdict} animate={touched.current && !still} />
          <FarthestBoard board={board} note={note} />
        </div>
      </div>
    </Section>
  );
};
