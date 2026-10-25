import { Router } from 'express';
import { verifyRole, verifyToken } from '../../middlewares/auth.middleware.js';
import feedbackController from './feedback.controller.js';

const router = Router();

router.use(verifyToken);
router.get('/eligible', verifyRole(['Customer']), feedbackController.getEligibleTickets);
router.post('/:ticketId', verifyRole(['Customer']), feedbackController.createFeedback);
router.get('/partner', verifyRole(['Partner']), feedbackController.getPartnerFeedback);
router.post('/partner/:feedbackId/reply', verifyRole(['Partner']), feedbackController.replyToFeedback);

export default router;
