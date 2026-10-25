import { Request, Response } from 'express';
import merchantService from './merchant.service.js';

export class MerchantController {
  getProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const profile = await merchantService.getMerchantProfile(partnerId);
      return res.status(200).json({ success: true, data: profile });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  updateProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const { full_name, email, phone, brand_name } = req.body;
      const updated = await merchantService.updateMerchantProfile(partnerId, { full_name, email, phone, brand_name });
      return res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  getStats = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const stats = await merchantService.getMerchantStats(partnerId);
      return res.status(200).json({ success: true, data: stats });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  getFleet = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const fleet = await merchantService.getMerchantFleet(partnerId);
      return res.status(200).json({ success: true, data: fleet });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  getDrivers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const drivers = await merchantService.getMerchantDrivers(partnerId);
      return res.status(200).json({ success: true, data: drivers });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  createDriver = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });   
    const { driver_name, driver_phone, experience, status } = req.body;
        if (!driver_name || !driver_phone) return res.status(400).json({ success: false, message: 'Thiếu thông tin tài xế.' });
        const created = await merchantService.createMerchantDriver(partnerId, { driver_name, driver_phone, experience, status });
        return res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
 };
  updateDriver = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
        const driverId = Number(req.params.id);
        if (!driverId) return res.status(400).json({ success: false, message: 'ID tài xế không hợp lệ.' });
        const { driver_name, driver_phone, experience, status } = req.body;
        const updated = await merchantService.updateMerchantDriver(partnerId, driverId, { driver_name, driver_phone, experience, status });
        return res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }   
};

  deleteDriver = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
        if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
        const driverId = Number(req.params.id);
        if (!driverId) return res.status(400).json({ success: false, message: 'ID tài xế không hợp lệ.' });
        const deleted = await merchantService.deleteMerchantDriver(partnerId, driverId);
        if ((deleted as any).affectedRows === 0) return res.status(404).json({ success: false, message: 'Tài xế không tồn tại hoặc không thuộc đối tác.' });
        return res.status(200).json({ success: true, data: deleted });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message });
    }
    };

  getSchedules = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const schedules = await merchantService.getMerchantSchedules(partnerId);
      return res.status(200).json({ success: true, data: schedules });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  createSchedule = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const {
        departure_location,
        arrival_location,
        vehicle_id,
        driver_id,
        departure_time,
        arrival_time,
        estimated_duration_minutes,
        base_price,
      } = req.body;
      if (
        !departure_location ||
        !arrival_location ||
        !vehicle_id ||
        !departure_time ||
        base_price === undefined
      ) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin lịch trình.' });
      }
      const estimatedDurationMinutes = estimated_duration_minutes === undefined
        ? undefined
        : Number(estimated_duration_minutes);
      if (
        estimatedDurationMinutes !== undefined &&
        (!Number.isSafeInteger(estimatedDurationMinutes) || estimatedDurationMinutes < 1 || estimatedDurationMinutes > 2880)
      ) {
        return res.status(400).json({ success: false, message: 'Thời lượng chuyến phải từ 1 đến 2880 phút.' });
      }
      const created = await merchantService.createMerchantSchedule(partnerId, {
        departure_location,
        arrival_location,
        vehicle_id: Number(vehicle_id),
        driver_id: driver_id ? Number(driver_id) : undefined,
        departure_time,
        arrival_time,
        estimated_duration_minutes: estimatedDurationMinutes,
        base_price: Number(base_price),
      });
      return res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  updateSchedule = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const tripId = Number(req.params.id);
      if (!tripId) return res.status(400).json({ success: false, message: 'ID lịch trình không hợp lệ.' });
      const {
        departure_location,
        arrival_location,
        vehicle_id,
        driver_id,
        departure_time,
        arrival_time,
        estimated_duration_minutes,
        base_price,
        status,
      } = req.body;
      const estimatedDurationMinutes = estimated_duration_minutes === undefined
        ? undefined
        : Number(estimated_duration_minutes);
      if (
        estimatedDurationMinutes !== undefined &&
        (!Number.isSafeInteger(estimatedDurationMinutes) || estimatedDurationMinutes < 1 || estimatedDurationMinutes > 2880)
      ) {
        return res.status(400).json({ success: false, message: 'Thời lượng chuyến phải từ 1 đến 2880 phút.' });
      }
      const updated = await merchantService.updateMerchantSchedule(partnerId, tripId, {
        departure_location,
        arrival_location,
        vehicle_id: vehicle_id ? Number(vehicle_id) : undefined,
        driver_id: driver_id ? Number(driver_id) : undefined,
        departure_time,
        arrival_time,
        estimated_duration_minutes: estimatedDurationMinutes,
        base_price: base_price ? Number(base_price) : undefined,
        status: status || undefined,
      });
      return res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  deleteSchedule = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const tripId = Number(req.params.id);
      if (!tripId) return res.status(400).json({ success: false, message: 'ID lịch trình không hợp lệ.' });
      const deleted = await merchantService.deleteMerchantSchedule(partnerId, tripId);
      if ((deleted as any).affectedRows === 0) return res.status(404).json({ success: false, message: 'Lịch trình không tồn tại hoặc không thuộc đối tác.' });
      return res.status(200).json({ success: true, data: deleted });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  createFleet = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const { vehicle_name, license_plate, vehicle_type, total_seats, status } = req.body;
      if (!license_plate || !vehicle_name) return res.status(400).json({ success: false, message: 'Thiếu thông tin xe.' });
      const created = await merchantService.createMerchantVehicle(partnerId, { vehicle_name, license_plate, vehicle_type, total_seats: Number(total_seats || 0), status });
      return res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  updateFleet = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const vehicleId = Number(req.params.id);
      if (!vehicleId) return res.status(400).json({ success: false, message: 'ID xe không hợp lệ.' });
      const { vehicle_name, license_plate, vehicle_type, total_seats, status } = req.body;
      const updated = await merchantService.updateMerchantVehicle(partnerId, vehicleId, { vehicle_name, license_plate, vehicle_type, total_seats: total_seats ? Number(total_seats) : undefined, status });
      return res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  deleteFleet = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const vehicleId = Number(req.params.id);
      if (!vehicleId) return res.status(400).json({ success: false, message: 'ID xe không hợp lệ.' });
      const deleted = await merchantService.deleteMerchantVehicle(partnerId, vehicleId);
      if ((deleted as any).affectedRows === 0) return res.status(404).json({ success: false, message: 'Xe không tồn tại hoặc không thuộc đối tác.' });
      return res.status(200).json({ success: true, data: deleted });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  getRefunds = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const refunds = await merchantService.getMerchantRefunds(partnerId);
      return res.status(200).json({ success: true, data: refunds });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  approveRefund = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      const refundId = Number(req.params.id);
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      if (!refundId) return res.status(400).json({ success: false, message: 'ID hoàn tiền không hợp lệ.' });
      const result = await merchantService.approveMerchantRefund(partnerId, refundId);
      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  rejectRefund = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      const refundId = Number(req.params.id);
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      if (!refundId) return res.status(400).json({ success: false, message: 'ID hoàn tiền không hợp lệ.' });
      const result = await merchantService.rejectMerchantRefund(partnerId, refundId);
      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  };

  getMerchantWallet = async (req: Request, res: Response): Promise<Response> => {
    try {
      const partnerId = (req as any).user.user_id;
      if (!partnerId) return res.status(400).json({ success: false, message: 'Không tìm thấy ID đối tác.' });
      const wallet = await merchantService.getMerchantWallet(partnerId);
      return res.status(200).json({ success: true, data: wallet });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
