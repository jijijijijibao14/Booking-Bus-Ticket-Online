import adminService from './admin.service.js';
import { CustomError } from '../../utils/customError.js';
function sendError(res, error) {
    const statusCode = error instanceof CustomError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'Đã xảy ra lỗi hệ thống.';
    if (statusCode >= 500)
        console.error('[Admin API]', error);
    res.status(statusCode).json({ success: false, message });
}
function requestUserId(req) {
    const userId = Number(req.user?.user_id);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw new CustomError('Không xác định được tài khoản Admin.', 401);
    }
    return userId;
}
export class AdminController {
    getOverview = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getAdminOverview(req.query) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getAnalytics = async (_req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getAdminAnalytics() });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getCommissionSettings = async (_req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getCommissionSettings() });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    updateCommissionSettings = async (req, res) => {
        try {
            const commissionRate = Number(req.body?.commissionRate);
            if (req.body?.commissionRate === undefined || !Number.isFinite(commissionRate)) {
                throw new CustomError('Tỷ lệ hoa hồng không hợp lệ.', 400);
            }
            const data = await adminService.updateCommissionSettings(commissionRate);
            res.status(200).json({ success: true, message: 'Đã cập nhật tỷ lệ hoa hồng.', data });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getCustomers = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getCustomers(req.query) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getPartners = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getPartners(req.query) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    updateAccountStatus = async (req, res) => {
        try {
            const userId = Number(req.params.id);
            const action = req.body?.action;
            if (!['activate', 'suspend', 'delete'].includes(action)) {
                throw new CustomError('Thao tác trạng thái tài khoản không hợp lệ.', 400);
            }
            const data = await adminService.updateAccountStatus(userId, action);
            res.status(200).json({ success: true, message: 'Đã cập nhật trạng thái tài khoản.', data });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getApprovals = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getPendingPartners(req.query) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    handleMerchantAction = async (req, res) => {
        try {
            const merchantId = Number(req.params.merchantId);
            const action = req.body?.action;
            if (!['approve', 'reject'].includes(action)) {
                throw new CustomError('Thao tác phê duyệt không hợp lệ.', 400);
            }
            const result = await adminService.handleMerchantAction(merchantId, action);
            res.status(200).json({
                success: true,
                message: action === 'approve' ? 'Đã phê duyệt đối tác.' : 'Đã từ chối hồ sơ đối tác.',
                data: result,
            });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getTickets = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getTickets(req.query) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getPayments = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getPayments(req.query) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    closeFailedPayment = async (req, res) => {
        try {
            const result = await adminService.closeFailedPayment(Number(req.params.id));
            res.status(200).json({ success: true, message: 'Đã đóng giao dịch Failed.', data: result });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getWaitingRefunds = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getRefunds(req.query) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getRefundHistory = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getRefunds(req.query, true) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    processAdminRefund = async (req, res) => {
        try {
            const action = req.body?.action;
            if (!['approve', 'reject'].includes(action)) {
                throw new CustomError('Thao tác hoàn tiền không hợp lệ.', 400);
            }
            const result = await adminService.processRefund(Number(req.params.id), action, requestUserId(req));
            res.status(200).json({ success: true, message: result.message, data: result });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getPayouts = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getPayouts(req.query) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    createPartnerPayout = async (req, res) => {
        try {
            if (typeof req.body?.referenceCode !== 'string') {
                throw new CustomError('Mã tham chiếu chi trả là bắt buộc.', 400);
            }
            const data = await adminService.createPartnerPayout(Number(req.params.partnerId), requestUserId(req), req.body.referenceCode);
            res.status(201).json({ success: true, message: 'Đã ghi nhận chi trả nội bộ cho đối tác.', data });
        }
        catch (error) {
            sendError(res, error);
        }
    };
    getFinancialActivity = async (req, res) => {
        try {
            res.status(200).json({ success: true, data: await adminService.getFinancialActivity(req.query) });
        }
        catch (error) {
            sendError(res, error);
        }
    };
}
