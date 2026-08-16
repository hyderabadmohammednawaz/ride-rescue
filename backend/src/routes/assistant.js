import express from 'express';
import { asyncRoute } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { askAssistant } from '../services/ai/chatbot.js';

const router = express.Router();
router.use(requireAuth);

// POST /api/assistant/ask
router.post(
  '/ask',
  asyncRoute(async (req, res) => {
    const answer = await askAssistant(req.user, req.body.message);
    res.json(answer);
  })
);

export default router;
