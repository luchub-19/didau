import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Copy, ShareNetwork } from '../ui';
import { copyText, shareRoom } from './shareRoom';

export interface InviteCardProps {
  roomId: string;
  code: string;
  title: string;
  /** Chỉ còn một mình trong phòng thì lời mời nổi bật hơn */
  alone?: boolean;
}

export const InviteCard: React.FC<InviteCardProps> = ({ roomId, code, title, alone = false }) => {
  const { t } = useTranslation();

  return (
    <Card
      as="section"
      aria-labelledby="invite-heading"
      className={alone ? 'border-accent bg-accent-soft/30' : ''}
    >
      <h2 id="invite-heading" className="text-label text-ink-2">
        {t('invite.codeLabel')}
      </h2>
      <p
        className="mt-1 text-title text-ink tabular-nums"
        style={{ letterSpacing: '0.08em' }}
        aria-label={t('invite.codeAria', { code: code.split('').join(' ') })}
      >
        {code}
      </p>

      {alone && <p className="mt-2 text-body text-ink-2">{t('invite.aloneHint')}</p>}

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <Button
          variant="primary"
          size="lg"
          className="sm:flex-1"
          leftIcon={<ShareNetwork size={20} aria-hidden="true" />}
          onClick={() => shareRoom({ roomId, code, title, t })}
        >
          {t('invite.share')}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="sm:flex-1"
          leftIcon={<Copy size={20} aria-hidden="true" />}
          onClick={() => copyText(code, t('room.codeCopied'), t('invite.copyFailed'))}
        >
          {t('invite.copyCode')}
        </Button>
      </div>
    </Card>
  );
};
