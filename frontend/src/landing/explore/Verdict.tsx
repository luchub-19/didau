// Lời kết luận (aria-live polite): dòng đề xuất (chữ display) + vì sao + câu "nếu chỉ cộng tổng km" khi hai chế độ khác.
// Chữ lấy từ `landing.tie.verdict.*`; tên 'you' dịch qua `landing.tie.youInline`, km định dạng theo ngôn ngữ.
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { formatNumber } from '../sections/numbers';
import type { WhoId } from '../logic/types';
import type { VerdictLine, VerdictModel } from './model';

export interface VerdictProps {
  model: VerdictModel;
  /** false = không diễn lại dòng chính (lần dựng đầu, giảm chuyển động). */
  animate: boolean;
}

const strong = <strong />;

export const Verdict: React.FC<VerdictProps> = ({ model, animate }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'vi';
  const who = (w?: WhoId) => (w === 'you' ? t('landing.tie.youInline') : (w ?? ''));
  const values = (l: VerdictLine) => ({
    name: l.vars.name ?? '',
    who: who(l.vars.who),
    min: l.vars.min ?? 0,
    yours: l.vars.yours ?? 0,
    km: l.vars.km === undefined ? '' : formatNumber(l.vars.km, 1, lang),
  });
  const line = (l: VerdictLine) => (
    <Trans i18nKey={`landing.tie.verdict.${l.key}`} values={values(l)} components={{ strong }} />
  );
  return (
    <div className="tie-verdict" aria-live="polite" aria-atomic="true">
      <p key={animate ? model.swapKey : 'still'} className="tie-pick" data-swap={animate ? 'true' : undefined}>
        {t(`landing.tie.verdict.${model.pick.key}`, values(model.pick))}
      </p>
      <p className="tie-why">
        {line(model.why)}
        {model.diff ? <> {line(model.diff)}</> : null}
      </p>
    </div>
  );
};
