// Phần 2 "Nhóm chat rối" (T-126, PLAN §4.1 dòng 2, §4.5): tin tới lần lượt khi phần vào ≥ 40% màn hình, một lần.
// Khối chat là role="img" + aria-label (đọc một lần, không đọc từng tin). static / đã ở trong màn đầu = hiện đủ ngay.
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { avatarFor } from '../cast';
import { useOnceInView } from '../shell/useOnceInView';
import { useReveal } from '../shell/useReveal';
import {
  CHAT_BEFORE,
  CHAT_LAST,
  COUNT_MS,
  COUNT_START_MS,
  TYPING_MS,
  TYPING_START_MS,
  UNREAD_TOTAL,
  seqDelay,
  unreadAt,
  type ChatMsg,
} from './chatStory';
import './sections.css';

export const ChatStory: React.FC = () => {
  const { t } = useTranslation();
  const headRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const reveal = useReveal(headRef, { threshold: 0.2 });
  const state = useOnceInView(chatRef, { threshold: 0.4 });

  // Mặc định đủ nội dung (SSR, static, đã ở trong màn đầu); 'waiting' đặt về 0, 'entered' diễn đúng một lần
  const [count, setCount] = useState(UNREAD_TOTAL);
  const [typing, setTyping] = useState(false);
  const [lastShown, setLastShown] = useState(true);

  useEffect(() => {
    if (state === 'waiting') {
      setCount(0);
      setLastShown(false);
      return;
    }
    if (state !== 'entered') return;
    setCount(0);
    setLastShown(false);
    let raf = 0;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / COUNT_MS);
          setCount(unreadAt(p));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }, COUNT_START_MS),
      window.setTimeout(() => setTyping(true), TYPING_START_MS),
      window.setTimeout(() => {
        setTyping(false);
        setLastShown(true);
      }, TYPING_START_MS + TYPING_MS),
    );
    return () => {
      timers.forEach(window.clearTimeout);
      cancelAnimationFrame(raf);
    };
  }, [state]);

  const msg = (m: ChatMsg, i: number, extra?: React.CSSProperties) => (
    <div
      key={m.key}
      className={`chat-msg chat-seq${m.dim ? ' is-dim' : ''}`}
      style={{ transitionDelay: `${seqDelay(i)}ms`, ...extra }}
    >
      <img className="chat-av" src={avatarFor(m.who)} alt="" width={32} height={32} />
      <div className="chat-bub">
        <div className="chat-who">{m.who}</div>
        <div className="chat-txt">{t(`landing.chat.${m.key}`)}</div>
      </div>
    </div>
  );

  return (
    <section id="chat" aria-labelledby="chat-title" className="relative py-24 md:py-32">
      <div className="landing-wrap chat-grid">
        <div ref={headRef} {...reveal}>
          <h2 id="chat-title" className="landing-h2">
            {t('landing.chat.title')}
          </h2>
          <p className="mt-[18px] max-w-[34em] text-lg text-night-moon-2">{t('landing.chat.sub')}</p>
        </div>
        <div ref={chatRef} className="chat" role="img" aria-label={t('landing.chat.label')} data-state={state}>
          <span className="chat-day chat-seq" style={{ transitionDelay: `${seqDelay(0)}ms` }}>
            {t('landing.chat.wed')}
          </span>
          {CHAT_BEFORE.map((m, k) => msg(m, k + 1))}
          <span className="chat-unread chat-seq" style={{ transitionDelay: `${seqDelay(5)}ms` }}>
            {t('landing.chat.unread', { n: count })}
          </span>
          <span className="chat-day chat-seq" style={{ transitionDelay: `${seqDelay(6)}ms` }}>
            {t('landing.chat.sat')}
          </span>
          {/* Hàng "đang gõ" đè lên chỗ tin chốt (đã giữ sẵn chiều cao, opacity 0): chèn/gỡ một hàng riêng làm các phần
              bên dưới nhảy 42 px khi người xem đã cuộn đi chỗ khác (CLS 0,05 đo ở T-130, 390px). */}
          <div className="chat-last">
            {typing ? (
              <div className="chat-msg chat-typing-row">
                <img className="chat-av" src={avatarFor('Nobita')} alt="" width={32} height={32} />
                <div className="chat-bub chat-typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ) : null}
            {msg(CHAT_LAST, 7, lastShown ? { transitionDelay: '0ms' } : { opacity: 0, transitionDelay: '0ms' })}
          </div>
        </div>
      </div>
    </section>
  );
};
