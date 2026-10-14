import { Router } from 'express';
import TripController from './trip.controller.js';

const router = Router();

// Endpoint công khai cho khách hàng tìm kiếm chuyến đi
// GET /api/trips/search?from=...&to=...&departureDate=...&type=...
router.get('/search', TripController.search);

// Endpoint công khai để lấy sơ đồ ghế của một chuyến đi
// GET /api/trips/seats
router.get('/:tripId/seats', TripController.getSeatLayout);

export default router;