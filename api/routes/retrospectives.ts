import express, { type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  RetrospectiveServiceError,
  archiveRetrospective,
  createRetroAction,
  createRetroTemplate,
  createRetrospective,
  generateRetrospectiveSnapshot,
  getRetrospectiveDetail,
  listRetroTemplates,
  listRetrospectives,
  publishRetrospective,
  updateRetroAction,
  updateRetrospective,
} from '../services/retrospectives.js';
import type {
  CreateRetroActionInput,
  CreateRetroTemplateInput,
  CreateRetrospectiveInput,
  GenerateSnapshotInput,
  RetrospectiveListFilters,
  UpdateRetroActionInput,
  UpdateRetrospectiveInput,
} from '../types/retrospectives.js';

const router = express.Router();

router.use(authenticate);

function getQueryString(req: Request, key: string) {
  const value = req.query[key];
  return typeof value === 'string' ? value : undefined;
}

function getQueryNumber(req: Request, key: string) {
  const value = getQueryString(req, key);
  if (!value) {
    return undefined;
  }
  const num = Number(value);
  return Number.isInteger(num) ? num : undefined;
}

function parseId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new RetrospectiveServiceError(400, 'INVALID_ID', 'ID is invalid');
  }
  return id;
}

function sendData(res: Response, data: unknown) {
  res.json({ success: true, data });
}

function handleError(error: unknown, res: Response) {
  if (error instanceof RetrospectiveServiceError) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  console.error('[Retrospectives] unexpected error:', error);
  return res.status(500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'Retrospective service error',
  });
}

router.get('/templates', async (req, res) => {
  try {
    const includeDisabled = getQueryString(req, 'includeDisabled') === '1';
    sendData(res, await listRetroTemplates(req.user, includeDisabled));
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/templates', async (req, res) => {
  try {
    sendData(res, await createRetroTemplate(req.user, req.body as CreateRetroTemplateInput));
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/', async (req, res) => {
  try {
    const filters: RetrospectiveListFilters = {
      status: getQueryString(req, 'status') as RetrospectiveListFilters['status'],
      category: getQueryString(req, 'category') as RetrospectiveListFilters['category'],
      start: getQueryString(req, 'start'),
      end: getQueryString(req, 'end'),
      ownerId: getQueryNumber(req, 'ownerId'),
    };
    sendData(res, await listRetrospectives(req.user, filters));
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/', async (req, res) => {
  try {
    sendData(res, await createRetrospective(req.user, req.body as CreateRetrospectiveInput));
  } catch (error) {
    handleError(error, res);
  }
});

router.patch('/actions/:actionId', async (req, res) => {
  try {
    sendData(res, await updateRetroAction(req.user, parseId(req.params.actionId), req.body as UpdateRetroActionInput));
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/:id', async (req, res) => {
  try {
    sendData(res, await getRetrospectiveDetail(req.user, parseId(req.params.id)));
  } catch (error) {
    handleError(error, res);
  }
});

router.put('/:id', async (req, res) => {
  try {
    sendData(res, await updateRetrospective(req.user, parseId(req.params.id), req.body as UpdateRetrospectiveInput));
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/snapshot', async (req, res) => {
  try {
    sendData(res, await generateRetrospectiveSnapshot(req.user, parseId(req.params.id), req.body as GenerateSnapshotInput));
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/publish', async (req, res) => {
  try {
    sendData(res, await publishRetrospective(req.user, parseId(req.params.id)));
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/archive', async (req, res) => {
  try {
    sendData(res, await archiveRetrospective(req.user, parseId(req.params.id)));
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/:id/actions', async (req, res) => {
  try {
    sendData(res, await createRetroAction(req.user, parseId(req.params.id), req.body as CreateRetroActionInput));
  } catch (error) {
    handleError(error, res);
  }
});

export default router;
