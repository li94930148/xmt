import express from 'express';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import { explainUserActions } from '../collaboration/ux/collaborationExplainUX';
import { buildNarrative } from '../collaboration/ux/documentNarrative';

const router = express.Router();

router.get('/explain/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    explanation: explainUserActions(docId),
  });
});

router.get('/narrative/:docId', authenticate, requirePermission('analytics:view'), (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    narrative: buildNarrative(docId),
  });
});

export default router;
