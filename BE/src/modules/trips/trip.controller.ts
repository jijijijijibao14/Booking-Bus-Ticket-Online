import { Request, Response } from 'express';
import TripService from './trip.service.js';

export class TripController {
  async search(req: Request, res: Response): Promise<void> {
    try {
      const { from, to, departureDate, type } = req.query;

      if (!from || !to || !departureDate || !type) {
        res.status(400).json({ 
          success: false, 
          message: 'Vui lòng cung cấp đủ thông tin điểm đi, điểm đến, ngày và loại phương tiện.' 
        });
        return;
      }

      // Thêm validation: Điểm đi và điểm đến không được trùng nhau (chuẩn hóa để so sánh)
      if ((from as string).trim().toLowerCase() === (to as string).trim().toLowerCase()) {
        res.status(400).json({
          success: false,
          message: 'Điểm đi và điểm đến không được trùng nhau.'
        });
        return;
      }

      const results = await TripService.searchTrips(
        from as string, 
        to as string, 
        departureDate as string, 
        type as string
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

      // Giải mã hóa (decode) các ký tự %7C, %20... từ URL về dạng chuỗi gốc 'MOCK|Train|...'
      const decodedTripId = decodeURIComponent(tripId as string);

      // Service xử lý phân luồng ID thật (số) và ID mock (chuỗi)
      const layout = await TripService.getSeatLayout(decodedTripId);
      
      res.status(200).json(layout);
    } catch (error: any) {
      res.status(404).json({ 
        success: false, 
        message: error.message || 'Không thể lấy sơ đồ ghế.' 
      });
    }
  }
}

export default new TripController();