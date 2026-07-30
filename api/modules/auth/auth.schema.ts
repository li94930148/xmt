import { z } from 'zod';

// 仅描述现有 legacy 请求形状，不用于收紧或转换当前接口输入。
export const legacyLoginRequestSchema = z.object({
  username: z.unknown().optional(),
  password: z.unknown().optional(),
  remember: z.unknown().optional(),
}).passthrough();

export type LegacyLoginRequest = z.infer<typeof legacyLoginRequestSchema>;
