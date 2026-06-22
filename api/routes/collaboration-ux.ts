import express from 'express';
import { authenticate } from '../middleware/auth';
import { explainUserActions } from '../collaboration/ux/collaborationExplainUX';
import { buildNarrative } from '../collaboration/ux/documentNarrative';

const router = express.Router();

router.get('/explain/:docId', authenticate, (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    explanation: explainUserActions(docId),
  });
});

router.get('/narrative/:docId', authenticate, (req, res) => {
  const docId = decodeURIComponent(req.params.docId);
  res.json({
    docId,
    narrative: buildNarrative(docId),
  });
});

export default router;
