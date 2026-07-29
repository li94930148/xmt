import type { Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import {
  auditTopicInputSchema,
  createTopicInputSchema,
  topicQuerySchema,
  transitionTopicInputSchema,
  updateTopicInputSchema,
} from '@shared/schema/topics.schema';
import { sendError, sendNotFound, sendServerError, sendSuccess, sendSuccessWithPagination } from '../../utils/response';
import { TopicService } from './topics.service';
import { TopicServiceError, type TopicActor } from './topics.types';

type TopicAction = 'get' | 'create' | 'update' | 'delete' | 'audit' | 'transition';

const SERVER_ERROR_MESSAGES: Record<TopicAction, string> = {
  get: '获取选题详情失败',
  create: '创建选题失败',
  update: '更新选题失败',
  delete: '删除选题失败',
  audit: '审核选题失败',
  transition: '更新状态失败',
};

function actor(req: Request): TopicActor {
  return { id: req.user!.id, role: req.user!.role };
}

function legacyError(res: Response, error: unknown, action: TopicAction) {
  if (error instanceof TopicServiceError) {
    if (error.code === 'TOPIC_NOT_FOUND') return sendNotFound(res, error.message);
    if (error.code === 'TOPIC_FORBIDDEN') return sendError(res, error.message, 403);
    return sendError(res, error.message);
  }
  return sendServerError(res, SERVER_ERROR_MESSAGES[action]);
}

function v1Error(req: Request, res: Response, error: unknown) {
  const requestId = String(req.headers['x-request-id'] || 'unavailable');
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: { code: 'TOPIC_INVALID_INPUT', message: '请求参数不合法', requestId, details: error.flatten() },
    });
  }
  if (error instanceof TopicServiceError) {
    const status = error.code === 'TOPIC_NOT_FOUND' ? 404 : error.code === 'TOPIC_FORBIDDEN' ? 403 : 400;
    return res.status(status).json({ success: false, error: { code: error.code, message: error.message, requestId } });
  }
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误', requestId },
  });
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

export class TopicController {
  constructor(private readonly service: TopicService) {}

  legacyList = async (req: Request, res: Response) => {
    try {
      const { status, search, page = 1, limit = 10 } = req.query;
      const result = await this.service.listTopics(actor(req), {
        status,
        search,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
      });
      return sendSuccessWithPagination(res, result.topics, result.total, result.page, result.limit);
    } catch {
      return sendServerError(res, '获取选题列表失败');
    }
  };

  legacyGet = async (req: Request, res: Response) => {
    try {
      return sendSuccess(res, await this.service.getTopic(actor(req), req.params.id));
    } catch (error) {
      return legacyError(res, error, 'get');
    }
  };

  legacyCreate = async (req: Request, res: Response) => {
    try {
      const result = await this.service.createTopic(actor(req), req.body);
      return sendSuccess(res, result, '选题提交成功');
    } catch (error) {
      return legacyError(res, error, 'create');
    }
  };

  legacyUpdate = async (req: Request, res: Response) => {
    try {
      await this.service.updateTopic(actor(req), req.params.id, req.body);
      return sendSuccess(res, null, '选题更新成功');
    } catch (error) {
      return legacyError(res, error, 'update');
    }
  };

  legacyDelete = async (req: Request, res: Response) => {
    try {
      await this.service.deleteTopic(actor(req), req.params.id);
      return sendSuccess(res, null, '选题删除成功');
    } catch (error) {
      return legacyError(res, error, 'delete');
    }
  };

  legacyAudit = async (req: Request, res: Response) => {
    try {
      await this.service.auditTopic(actor(req), req.params.id, req.body);
      const statusText = req.body.status === 'approved' ? '审核通过' : '审核驳回';
      return sendSuccess(res, null, `选题${statusText}`);
    } catch (error) {
      return legacyError(res, error, 'audit');
    }
  };

  legacyTransition = async (req: Request, res: Response) => {
    try {
      await this.service.transitionTopic(actor(req), req.params.id, req.body);
      return sendSuccess(res, null, '状态更新成功');
    } catch (error) {
      return legacyError(res, error, 'transition');
    }
  };

  v1List = async (req: Request, res: Response) => {
    try {
      const query = parse(topicQuerySchema, req.query);
      const result = await this.service.listTopics(actor(req), {
        ...query,
        page: query.page ?? 1,
        limit: query.limit ?? 10,
      });
      return res.json({
        success: true,
        data: result.topics,
        meta: { pagination: { page: result.page, limit: result.limit, total: result.total } },
      });
    } catch (error) { return v1Error(req, res, error); }
  };

  v1Get = async (req: Request, res: Response) => {
    try { return res.json({ success: true, data: await this.service.getTopic(actor(req), req.params.id) }); }
    catch (error) { return v1Error(req, res, error); }
  };

  v1Create = async (req: Request, res: Response) => {
    try {
      const input = parse(createTopicInputSchema, req.body);
      const normalized = {
        ...input,
        description: input.description ?? '',
        platform: input.platform ?? '',
        deadline: input.deadline ?? '',
        outlineJson: typeof input.outlineJson === 'object' && input.outlineJson !== null
          ? JSON.stringify(input.outlineJson)
          : input.outlineJson,
      };
      return res.json({ success: true, data: await this.service.createTopic(actor(req), normalized) });
    } catch (error) { return v1Error(req, res, error); }
  };

  v1Update = async (req: Request, res: Response) => {
    try {
      const input = parse(updateTopicInputSchema, req.body);
      const normalized = {
        ...input,
        outlineJson: typeof input.outlineJson === 'object' && input.outlineJson !== null
          ? JSON.stringify(input.outlineJson)
          : input.outlineJson,
      };
      await this.service.updateTopic(actor(req), req.params.id, normalized);
      return res.json({ success: true, data: null });
    } catch (error) { return v1Error(req, res, error); }
  };

  v1Delete = async (req: Request, res: Response) => {
    try {
      await this.service.deleteTopic(actor(req), req.params.id);
      return res.json({ success: true, data: null });
    } catch (error) { return v1Error(req, res, error); }
  };

  v1Audit = async (req: Request, res: Response) => {
    try {
      const input = parse(auditTopicInputSchema, req.body);
      await this.service.auditTopic(actor(req), req.params.id, { ...input, comment: input.comment ?? '' });
      return res.json({ success: true, data: null });
    } catch (error) { return v1Error(req, res, error); }
  };

  v1Transition = async (req: Request, res: Response) => {
    try {
      await this.service.transitionTopic(actor(req), req.params.id, parse(transitionTopicInputSchema, req.body));
      return res.json({ success: true, data: null });
    } catch (error) { return v1Error(req, res, error); }
  };
}
