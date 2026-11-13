'use client';

import { ConfirmDialog } from '@/components/shared/ui/ConfirmDialog';
import { useBoardContext } from '../board/BoardContext';
import { useI18n } from '@/i18n/LocaleProvider';

export function EndMatchDialog() {
  const { remote, mode, leave, setPanel } = useBoardContext();
  const { t } = useI18n();
  const interrupt = !!remote?.abort || (!remote && mode === 'cpu');
  return <ConfirmDialog title={t(interrupt ? '対戦を中断しますか？' : '投降しますか？')}
    description={t(interrupt ? '勝敗をつけずに対戦を終了します。\nリプレイは保存しません。' : '投降するとあなたの負けになります。')}
    confirmLabel={t(interrupt ? '中断する' : '投降する')} cancelLabel={t('対戦を続ける')} disabled={remote?.waiting}
    onConfirm={interrupt ? remote?.abort ?? leave : () => remote?.resign()}
    onCancel={() => setPanel({ type: 'menu' })} onDone={() => setPanel(null)} />;
}
