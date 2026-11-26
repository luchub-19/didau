// Phần 4 "Một phòng, bốn bước" (T-127, PLAN §4.1 dòng 4, §4.5): cuộn tự nhiên, không ghim/scrub.
// Desktop (>= 961px): cột chữ 4 bước + khung app dính bên phải; bước đi vào dải giữa màn hình (IO -45%) thì khung đổi màn
// theo hướng cuộn; nút bước trong khung nhảy tới chữ và khoá IO 1 s (không nháy qua bước giữa).
// Mobile: không khung dính, mỗi bước có khung riêng dưới chữ, dựng khi đi vào màn hình. Màn là trang trí (aria-hidden).
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wordmark } from '../../components/shell/Wordmark';
import { useMotionTier } from '../../motion/useMotionTier';
import { Section } from '../shell/Section';
import { useOnceInView, type OnceInViewState } from '../shell/useOnceInView';
import { StepScreen, type TypeMode } from './steps/Screens';
import {
  STEP_COPY,
  STEP_KEYS,
  STEP_ROOT_MARGIN,
  flowReducer,
  initialFlow,
  pillState,
} from './steps/model';
import { useWide } from './steps/useWide';
import './steps/steps.css';

/** Gõ "pizza" đúng một lần: chờ khi khung còn dưới màn hình, chạy khi vừa tới, hiện đủ sau đó. */
const typeModeFor = (state: OnceInViewState, typed: boolean): TypeMode =>
  typed || state === 'shown' ? 'full' : state === 'waiting' ? 'hold' : 'run';

interface AppShellProps {
  children: React.ReactNode;
  /** Thanh bước: nút bấm được (desktop) hoặc một nhãn tĩnh (khung riêng ở mobile). */
  pills: React.ReactNode;
  className?: string;
}

const AppShell = React.forwardRef<HTMLDivElement, AppShellProps>(({ children, pills, className = '' }, ref) => {
  const { t } = useTranslation();
  return (
    <div ref={ref} className={`fs-app ${className}`}>
      <div className="fs-app-bar">
        <Wordmark variant="mark" size={26} />
        <span className="fs-app-title">{t('landing.room.title')}</span>
        {pills}
      </div>
      {children}
    </div>
  );
});
AppShell.displayName = 'AppShell';

/** Khung riêng của một bước ở màn hẹp: dựng khi đi vào màn hình (20%), static/đã ở màn đầu = dựng ngay. */
const InlineFrame: React.FC<{ step: number }> = ({ step }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const state = useOnceInView(ref, { threshold: 0.2 });
  const [typed, setTyped] = useState(false);
  return (
    <div ref={ref} className="fs-inline" aria-hidden="true" data-step={step} data-state={state}>
      {state === 'waiting' ? null : (
        <AppShell
          pills={
            <span className="fs-pills">
              <span className="fs-pill" data-state="now">
                {step + 1} {t(`landing.flow.steps.${STEP_KEYS[step]}`)}
              </span>
            </span>
          }
        >
          <div className="fs-screen">
            <StepScreen
              step={step}
              typeMode={typeModeFor(state, typed)}
              onTyped={() => setTyped(true)}
            />
          </div>
        </AppShell>
      )}
    </div>
  );
};

/** Chọn bố cục theo độ rộng màn hình. */
export const FourSteps: React.FC = () => <FourStepsLayout wide={useWide()} />;

/** `wide` = khung dính bên phải; ngược lại mỗi bước có khung riêng (tách ra để test hai bố cục). */
export const FourStepsLayout: React.FC<{ wide: boolean }> = ({ wide }) => {
  const { t } = useTranslation();
  const tier = useMotionTier();
  const [flow, dispatch] = useReducer(flowReducer, undefined, initialFlow);
  const articles = useRef<(HTMLElement | null)[]>([]);
  const deviceRef = useRef<HTMLDivElement>(null);
  const deviceState = useOnceInView(deviceRef, { threshold: 0.3 });
  const [typed, setTyped] = useState(false);

  // Bước nằm giữa màn hình = bước hiện; chỉ quan sát khi có khung dính
  useEffect(() => {
    if (!wide || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            dispatch({ type: 'io', index: Number((e.target as HTMLElement).dataset.step), now: performance.now() });
          }
        }
      },
      { rootMargin: STEP_ROOT_MARGIN },
    );
    articles.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [wide]);

  const goTo = (k: number, button: HTMLButtonElement) => {
    dispatch({ type: 'go', index: k, now: performance.now() });
    articles.current[k]?.scrollIntoView({ behavior: tier === 'static' ? 'auto' : 'smooth', block: 'center' });
    button.focus({ preventScroll: true });
  };

  const pills = (
    <span className="fs-pills" role="group" aria-label={t('landing.flow.steps.label')}>
      {STEP_KEYS.map((key, k) => (
        <button
          key={key}
          type="button"
          className="fs-pill"
          data-state={pillState(k, flow.current)}
          data-go={k}
          aria-pressed={k === flow.current}
          onClick={(e) => goTo(k, e.currentTarget)}
        >
          {k === flow.current ? `${k + 1} ` : ''}
          {t(`landing.flow.steps.${key}`)}
        </button>
      ))}
    </span>
  );

  return (
    <Section id="flow" titleId="flow-title" title={t('landing.flow.title')} sub={t('landing.flow.sub')}>
      <div className="fs-flow" data-wide={wide ? 'true' : 'false'}>
        <div className="fs-steps">
          {STEP_COPY.map((copy, k) => (
            <article
              key={k}
              ref={(el) => {
                articles.current[k] = el;
              }}
              className="fs-step"
              data-step={k}
              data-on={!wide || flow.current === k ? 'true' : 'false'}
            >
              <span className="fs-step-n">{k + 1}</span>
              <h3>{t(copy.title)}</h3>
              <p>{t(copy.body)}</p>
              {wide ? null : <InlineFrame step={k} />}
            </article>
          ))}
        </div>
        {wide ? (
          <div className="fs-device">
            <AppShell ref={deviceRef} pills={pills} className="fs-device-app">
              <div
                key={flow.current}
                className="fs-screen"
                data-dir={flow.dir}
                aria-hidden="true"
              >
                <StepScreen
                  step={flow.current}
                  typeMode={typeModeFor(deviceState, typed)}
                  onTyped={() => setTyped(true)}
                />
              </div>
            </AppShell>
          </div>
        ) : null}
      </div>
    </Section>
  );
};
