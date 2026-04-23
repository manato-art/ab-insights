'use client';

// 学習収集フラグのトグル UI
// - Dashboard と Settings の両方から使う共通コンポーネント
// - 楽観的更新 + Server Action 呼び出し
// - 失敗時は元に戻して toast

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { setLearningEnabled } from './actions';

type Props = {
  initialEnabled: boolean;
  showBadge?: boolean;
};

export default function LearningToggle({ initialEnabled, showBadge = true }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: boolean) => {
    // 楽観的更新
    const prev = enabled;
    setEnabled(next);
    startTransition(async () => {
      try {
        await setLearningEnabled(next);
        toast.success(next ? '学習収集を開始しました' : '学習収集を停止しました');
      } catch (_e) {
        // 失敗したら巻き戻す
        setEnabled(prev);
        toast.error('更新に失敗しました');
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <Switch
        checked={enabled}
        onCheckedChange={handleChange}
        disabled={isPending}
        aria-label="学習収集の有効化"
      />
      <span className="text-sm font-medium">
        {enabled ? '有効' : '無効'}
      </span>
      {showBadge && enabled && (
        <Badge variant="default" className="bg-emerald-600 text-white">
          <span className="relative flex size-2 mr-1">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-200" />
          </span>
          収集中
        </Badge>
      )}
      {showBadge && !enabled && (
        <Badge variant="outline" className="text-muted-foreground">停止中</Badge>
      )}
    </div>
  );
}
