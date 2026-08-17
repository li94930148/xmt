export class InvalidApiResponseError extends Error {
  readonly code = 'INVALID_API_RESPONSE';

  constructor(message = 'API 返回了无效响应') {
    super(message);
    this.name = 'InvalidApiResponseError';
  }
}

export function isJsonApiResponse(response: Pick<Response, 'headers'>) {
  return /(?:^|\s|;)application\/(?:[\w.+-]*\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') || '');
}

export async function readJsonApiResponse<T>(response: Response): Promise<T> {
  if (!isJsonApiResponse(response)) {
    throw new InvalidApiResponseError();
  }
  try {
    return await response.json() as T;
  } catch {
    throw new InvalidApiResponseError();
  }
}

export async function assertApiHealthResponse(response: Response) {
  if (!response.ok) throw new InvalidApiResponseError('API 健康检查失败');
  const body = await readJsonApiResponse<{ success?: unknown; status?: unknown }>(response);
  if (body.success !== true || body.status !== 'ok') {
    throw new InvalidApiResponseError('API 健康检查响应不符合合同');
  }
  return body;
}
