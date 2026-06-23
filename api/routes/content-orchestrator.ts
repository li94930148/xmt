import express from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { getEventStream } from '../collaboration/protocol/eventStream';
import {
  computeSystemInsight,
  orchestrateDocContext,
  resolveSystemState,
} from '../../src/content/orchestrator/contentOSOrchestrator';

const router = express.Router();

function timelineSources(docId: string) {
  return {
    yjsEvents: getEventStream(docId),
  };
}

router.get('/context/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json(orchestrateDocContext(docId, timelineSources(docId)));
});

router.get('/insight/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json(computeSystemInsight(docId, timelineSources(docId)));
});

router.get('/state/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    state: resolveSystemState(docId, timelineSources(docId)),
  });
});

export default router;
