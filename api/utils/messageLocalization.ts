type MessageText = {
  title?: string | null;
  content?: string | null;
};

const DAILY_REPORT_SUBMITTED = /^(.+?) submitted a daily report for (\d{4}-\d{2}-\d{2})\.$/;
const DAILY_REPORT_REVIEWED = /^(\d{4}-\d{2}-\d{2}) daily report was (approved|rejected)(?:: (.*))?$/;

/** Keeps historical English notification rows readable without rewriting message history. */
export function localizeMessage<T extends MessageText>(message: T): T {
  const submitted = message.content?.match(DAILY_REPORT_SUBMITTED);
  if (message.title === 'Daily report pending review' && submitted) {
    return {
      ...message,
      title: '新的日报待审核',
      content: `${submitted[1]} 提交了 ${submitted[2]} 的日报。`,
    };
  }

  const reviewed = message.content?.match(DAILY_REPORT_REVIEWED);
  if (reviewed && (message.title === 'Daily report approved' || message.title === 'Daily report rejected')) {
    const approved = reviewed[2] === 'approved';
    return {
      ...message,
      title: approved ? '日报审核通过' : '日报已退回',
      content: `${reviewed[1]} 的日报${approved ? '已审核通过' : '已退回修改'}${reviewed[3] ? `：${reviewed[3]}` : ''}`,
    };
  }

  return message;
}
