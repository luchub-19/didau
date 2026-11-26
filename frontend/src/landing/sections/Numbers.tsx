// Phần 6 "Số đo" (T-129, PLAN §4.1 dòng 6): dải vàng đèn đường, 2 số lớn chạy từ 0 một lần + 2 biểu đồ cùng thang 0–50%,
// bảng đầy đủ là <details> (không modal). Mặc định (SSR/static/đã ở màn đầu) hiện đủ số cuối; chỉ 'waiting' → 0.
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Section } from '../shell/Section';
import { useOnceInView } from '../shell/useOnceInView';
import {
  BIG_NUMBERS,
  CHART_FAR,
  CHART_SUM,
  COUNT_MS,
  TABLE_ROWS,
  barWidthPct,
  countValue,
  decimalsOf,
  formatNumber,
  labelInside,
  type BarDatum,
} from './numbers';
import './sections.css';

const Bars: React.FC<{ data: readonly BarDatum[]; lang: string; label: string }> = ({ data, lang, label }) => {
  const { t } = useTranslation();
  return (
    <div className="num-bars" role="list" aria-label={label}>
      {data.map((d, i) => {
        const w = barWidthPct(d.value);
        const inside = labelInside(d.value);
        return (
          <div key={d.algo} role="listitem" className={`num-bar${d.us ? ' is-us' : ''}`} style={{ '--i': i } as React.CSSProperties}>
            <span className="num-bar-lab">{t(`landing.numbers.algo.${d.algo}`)}</span>
            <span className="num-bar-tr">
              <i style={{ width: `${w}%` }} />
              <em style={inside ? { right: `${100 - w}%`, marginRight: 10 } : { left: `calc(${w}% + 10px)` }}>
                {formatNumber(d.value, decimalsOf(d.value), lang)}%
              </em>
            </span>
          </div>
        );
      })}
    </div>
  );
};

export const Numbers: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'vi';
  const chartsRef = useRef<HTMLDivElement>(null);
  const state = useOnceInView(chartsRef, { threshold: 0.25 });
  const [p, setP] = useState(1);

  useEffect(() => {
    if (state === 'waiting') {
      setP(0);
      return;
    }
    if (state !== 'entered') return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / COUNT_MS);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    setP(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state]);

  const big = (i: number) => {
    const b = BIG_NUMBERS[i];
    return `${b.sign}${formatNumber(countValue(b.value, p), b.decimals, lang)}%`;
  };
  const final = (i: number) => `${BIG_NUMBERS[i].sign}${formatNumber(BIG_NUMBERS[i].value, BIG_NUMBERS[i].decimals, lang)}%`;
  const mark = (m: 'yes' | 'part' | 'no') => t(`landing.numbers.${m}`);

  return (
    <Section
      id="numbers"
      titleId="numbers-title"
      tone="lamp"
      title={t('landing.numbers.title')}
      sub={t('landing.numbers.sub')}
    >
      <div ref={chartsRef} className="num-charts" data-state={state}>
        {[0, 1].map((i) => (
          <div className="num-chart" key={i}>
            <p className="num-big">
              {/* aria-label không hợp lệ trên <p> (axe aria-prohibited-attr): giá trị cuối cho trình đọc màn hình là chữ ẩn thị giác */}
              <span className="sr-only">{final(i)}</span>
              <span aria-hidden="true">{big(i)}</span>
            </p>
            <h3 className="num-h3">{t(i === 0 ? 'landing.numbers.c1Title' : 'landing.numbers.c2Title')}</h3>
            <p className="num-note">{t(i === 0 ? 'landing.numbers.c1Note' : 'landing.numbers.c2Note')}</p>
            <Bars
              data={i === 0 ? CHART_SUM : CHART_FAR}
              lang={lang}
              label={t(i === 0 ? 'landing.numbers.c1Title' : 'landing.numbers.c2Title')}
            />
          </div>
        ))}
      </div>

      <details className="num-toggle">
        <summary>
          <span>{t('landing.numbers.tableToggle')}</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3 6l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <div className="num-tbl-wrap" tabIndex={0} role="region" aria-label={t('landing.numbers.tableToggle')}>
          <table className="num-tbl">
            <thead>
              <tr>
                <th scope="col">{t('landing.numbers.col.algo')}</th>
                <th scope="col">{t('landing.numbers.col.distance')}</th>
                <th scope="col">{t('landing.numbers.col.night')}</th>
                <th scope="col">{t('landing.numbers.col.protect')}</th>
                <th scope="col">{t('landing.numbers.col.result')}</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map((r) => (
                <tr key={r.algo} className={r.algo === 'us' ? 'is-us' : undefined}>
                  <th scope="row">{t(`landing.numbers.algo.${r.algo}`)}</th>
                  {r.marks.map((m, k) => (
                    <td key={k} className="c">
                      {mark(m)}
                    </td>
                  ))}
                  <td>{t(`landing.numbers.result.${r.algo}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="num-src">{t('landing.numbers.source')}</p>
      </details>
    </Section>
  );
};
