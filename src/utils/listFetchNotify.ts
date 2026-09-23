/**
 * 列表请求控制器：抑制过期响应 + 失败 toast 去重。
 * 用于避免「初始化竞态 / 反馈环」导致的重复请求与重复报错弹窗。
 */
export type ListFetchController = {
  /** 开始一次请求，返回本次序号 */
  begin: () => number;
  /** 该序号是否仍是最新请求（用于丢弃过期响应） */
  isCurrent: (id: number) => boolean;
  /** 是否应展示错误 toast（相同错误键连续失败只提示一次） */
  shouldNotifyError: (key: string) => boolean;
  /** 成功后允许下一次失败再次提示 */
  markSettledSuccess: () => void;
  /** 主动重置错误提示去重（例如用户点击重试前） */
  resetErrorNotify: () => void;
};

export function createListFetchController(): ListFetchController {
  let seq = 0;
  let lastErrorKey: string | null = null;

  return {
    begin() {
      seq += 1;
      return seq;
    },
    isCurrent(id) {
      return id === seq;
    },
    shouldNotifyError(key) {
      if (lastErrorKey === key) {
        return false;
      }
      lastErrorKey = key;
      return true;
    },
    markSettledSuccess() {
      lastErrorKey = null;
    },
    resetErrorNotify() {
      lastErrorKey = null;
    },
  };
}

export function listErrorKey(title: string, message: string, type = 'error'): string {
  return `${type}|${title}|${message}`;
}
