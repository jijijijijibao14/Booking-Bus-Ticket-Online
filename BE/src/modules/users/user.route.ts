import {
  Router,
} from 'express';
import {
  verifyToken,
} from '../../middlewares/auth.middleware.js';
import {
  UserController,
} from './user.controller.js';

const router = Router();
const userController =
  new UserController();

/*
 * app.ts đã mount module này dưới /api/users
 *
 * GET /api/users/profile
 * PUT /api/users/profile
 * GET /api/users/wallet/transactions
 */
router.get(
  '/profile',
  verifyToken,
  userController.getProfile,
);

router.put(
  '/profile',
  verifyToken,
  userController.updateProfile,
);

router.get(
  '/wallet/transactions',
  verifyToken,
  userController.getWalletTransactions,
);

export {
  router as userRouter,
};