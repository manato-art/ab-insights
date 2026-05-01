'use server';

import { getCurrentSession } from '@/lib/auth';
import {
  runMonthlyBackfill,
  type BackfillResult,
} from '@/lib/backfill-runner';

export async function backfillMonthAction(
  month: string,
): Promise<BackfillResult> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error('認証が必要です');
  }
  return await runMonthlyBackfill(month);
}
