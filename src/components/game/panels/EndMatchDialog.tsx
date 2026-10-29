'use client';

import { ConfirmDialog } from '@/components/shared/ui/ConfirmDialog';
import { useBoardContext } from '../board/BoardContext';

export function EndMatchDialog() {
  const { remote, mode, leave, setPanel } = useBoardContext();
  const interrupt = !!remote?.abort || (!remote && mode === 'cpu');
  return <ConfirmDialog title={interrupt ? '対戦を中断しますか？' : '投降しますか？'}
    description={interrupt ? '勝敗をつけずに対戦を終了します。\nリプレイは保存しません。' : '投降するとあなたの負けになります。'}
    confirmLabel={interrupt ? '中断する' : '投降する'} cancelLabel="対戦を続ける" disabled={remote?.waiting}
    onConfirm={interrupt ? remote?.abort ?? leave : () => remote?.resign()}
    onCancel={() => setPanel({ type: 'menu' })} onDone={() => setPanel(null)} />;
}
