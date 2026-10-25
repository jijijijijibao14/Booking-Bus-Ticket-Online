import { Router } from 'express';
import { verifyToken } from '../../middlewares/auth.middleware.js';
import communicationsController from './communications.controller.js';

const router = Router();

router.get('/partners', communicationsController.getPartners);
router.use(verifyToken);
router.get('/conversations', communicationsController.getConversations);
router.post('/conversations', communicationsController.openConversation);
router.get('/conversations/:conversationId/messages', communicationsController.getMessages);
router.post('/conversations/:conversationId/messages', communicationsController.sendMessage);

export default router;
