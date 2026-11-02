import { Request, Response } from 'express';
import TripService from './trip.service.js';
import { findVehicleImagePath } from '../../utils/vehicle-image.util.js';

export class TripController {
  async search(req: Request, res: Response): Promise<void> {
    try {
      const { from, to, departureDate, type } = req.query;

      if (
        typeof from !== 'string' ||
        typeof to !== 'string' ||
        typeof departureDate !== 'string' ||
        type !== 'Bus'
      ) {
        res.status(400).json({
          success: false,
          message: 'Chỉ hỗ trợ tìm kiếm xe khách. Vui lòng cung cấp điểm đi, điểm đến và ngày đi hợp lệ.',
        });
        return;
      }

      if (
        from.trim().length === 0 ||
        to.trim().length === 0 ||
        from.trim().toLowerCase() === to.trim().toLowerCase() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)
      ) {
        res.status(400).json({
          success: false,
          message: 'Thông tin điểm đi, điểm đến hoặc ngày khởi hành không hợp lệ.',
        });
        return;
      }

      const results = await TripService.searchTrips(
        from,
        to,
        departureDate,
      );
      
      res.status(200).json({ 
        success: true, 
        message: `Tìm thấy ${results.length} chuyến đi phù hợp.`, 
        data: results 
      });

    } catch (error: any) {
      res.status(500).json({ 
        success: false, 
        message: 'Lỗi server khi tìm kiếm chuyến đi.', 
        error: error.message 
      });
    }
  }

  async getSeatLayout(req: Request, res: Response): Promise<void> {
    try {
      const { tripId } = req.params;

      if (!tripId) {
        res.status(400).json({ success: false, message: 'Thiếu mã chuyến đi (tripId).' });
        return;
      }

      const decodedTripId = decodeURIComponent(tripId as string);

      const userId = (req as any).user?.user_id;
      const layout = await TripService.getSeatLayout(decodedTripId, userId);
      
      res.status(200).json(layout);
    } catch (error: any) {
      res.status(404).json({ 
        success: false, 
        message: error.message || 'Không thể lấy sơ đồ ghế.' 
      });
    }
  }

  async getVehicleImage(req: Request, res: Response): Promise<void> {
    const vehicleId = Number(req.params.vehicleId);
    if (!Number.isSafeInteger(vehicleId) || vehicleId <= 0) {
      res.status(400).json({ success: false, message: 'ID xe không hợp lệ.' });
      return;
    }

    try {
      const imagePath = await findVehicleImagePath(vehicleId);
      if (!imagePath) {
        res.status(404).json({ success: false, message: 'Xe chưa có ảnh.' });
        return;
      }

      res.sendFile(imagePath, (error) => {
        if (error && !res.headersSent) {
          console.error('Could not serve vehicle image:', error);
          res.status(500).json({ success: false, message: 'Không thể tải ảnh xe.' });
        }
      });
    } catch (error) {
      console.error('Could not find vehicle image:', error);
      res.status(500).json({ success: false, message: 'Không thể tải ảnh xe.' });
    }
  }
}

export default new TripController();