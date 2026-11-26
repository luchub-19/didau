// Bảng "Người xa nhất phải đi bao lâu": 3 hàng cùng thang, avatar + phút của người xa nhất trượt theo đầu thanh,
// tổng km cả nhóm; khung chọn trượt giữa các hàng (hàng cao cố định nên chỉ cần translateY theo chỉ số, không đo).
import React from 'react';
import { useTranslation } from 'react-i18next';
import { YOU_SEED, avatarFor } from '../cast';
import { formatNumber } from '../sections/numbers';
import type { BoardModel } from './model';

export interface FarthestBoardProps {
  board: BoardModel;
  /** Ghi chú nguồn số của người xem (lưới / ước lượng); null = chưa đặt điểm (vẫn giữ chỗ, không nhảy bố cục). */
  note: string | null;
}

export const FarthestBoard: React.FC<FarthestBoardProps> = ({ board, note }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'vi';
  return (
    <div className="tie-board">
      <div className="tie-board-head">
        <h3>{t('landing.tie.boardTitle')}</h3>
        <span>{t('landing.tie.boardUnit')}</span>
      </div>
      <div className="tie-rows" style={{ '--sel': board.selIndex } as React.CSSProperties}>
        <span className="tie-sel-frame" aria-hidden="true" />
        <ol>
          {board.rows.map((r) => {
            const isYou = r.farWho === 'you';
            const whoName = r.farWho === 'you' ? t('landing.you') : r.farWho;
            const seed = r.farWho === 'you' ? YOU_SEED : r.farWho;
            return (
              <li key={r.placeId} className="tie-row" data-id={r.placeId} data-sel={r.selected ? 'true' : undefined}>
                <div className="tie-row-top">
                  <span className="tie-row-name">{r.name}</span>
                  <span className="tie-row-km tabular-nums">
                    {t('landing.tie.total', { km: formatNumber(r.km, 1, lang) })}
                  </span>
                </div>
                <div className="tie-track">
                  <span className="tie-fill" style={{ width: `${r.pct}%` }} />
                  <span className="tie-who" data-you={isYou ? 'true' : undefined} style={{ left: `${r.pct}%` }}>
                    <img src={avatarFor(seed)} alt="" width={22} height={22} />
                    <span className="tabular-nums" aria-hidden="true">
                      {r.far}′
                    </span>
                    <span className="sr-only">{t('landing.tie.whoSr', { who: whoName, min: r.far })}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="tie-board-note">{note ?? ''}</p>
    </div>
  );
};
