export type BatchActionFeedback = {
  title: string;
  message: string;
  type: 'success' | 'warning' | 'error';
};

export function getBatchActionFeedback(action: string, total: number, succeeded: number): BatchActionFeedback {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeSucceeded = Math.min(safeTotal, Math.max(0, Math.floor(succeeded)));
  const failed = safeTotal - safeSucceeded;

  if (failed === 0) {
    return {
      title: `批量${action}完成`,
      message: `成功 ${safeSucceeded} 项`,
      type: 'success',
    };
  }

  if (safeSucceeded === 0) {
    return {
      title: `批量${action}失败`,
      message: `${failed} 项均未完成，请检查后重试`,
      type: 'error',
    };
  }

  return {
    title: `批量${action}部分完成`,
    message: `成功 ${safeSucceeded} 项，失败 ${failed} 项`,
    type: 'warning',
  };
}
