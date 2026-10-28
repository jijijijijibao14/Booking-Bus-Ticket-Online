import adminService from './admin.service.js';
export class AdminController {
    respond = async (res, operation) => {
        try {
            res.status(200).json({ success: true, data: await operation() });
        }
        catch (error) {
            console.error('Admin API error:', error);
            const statusCode = error.statusCode ?? (error.code ? 500 : 400);
            res.status(statusCode).json({
                success: false,
                message: statusCode >= 500
                    ? 'Không thể xử lý yêu cầu quản trị do lỗi hệ thống.'
                    : error.message || 'Không thể xử lý yêu cầu quản trị.',
            });
        }
    };
    getOverview = (req, res) => this.respond(res, () => adminService.getOverview(req.query));
    getCommissionSettings = (_req, res) => this.respond(res, () => adminService.getCommissionSettings());
    updateCommissionSettings = (req, res) => {
        const commissionRate = Number(req.body?.commissionRate);
        return this.respond(res, () => adminService.updateCommissionRate(commissionRate));
    };
    getCustomers = (req, res) => this.respond(res, () => adminService.getUsers('Customer', req.query));
    getPartners = (req, res) => this.respond(res, () => adminService.getUsers('Partner', req.query));
    updateAccountStatus = async (req, res) => {
        const userId = Number(req.params.id);
        const action = req.body?.action;
        if (!Number.isSafeInteger(userId) || userId <= 0 || !['suspend', 'activate', 'delete'].includes(action)) {
            res.status(400).json({ success: false, message: 'Mã tài khoản hoặc thao tác không hợp lệ.' });
            return;
        }
        const result = await adminService.updateAccountStatus(userId, action);
        res.status(result.found ? 200 : 404).json({
            success: result.found,
            message: result.found
                ? action === 'delete'
                    ? 'Tài khoản đã được lưu trữ và vô hiệu hóa.'
                    : action === 'suspend'
                        ? 'Tài khoản đã bị khóa.'
                        : 'Tài khoản đã được mở khóa.'
                : result.message,
            data: result,
        });
    };
    getApprovals = (req, res) => this.respond(res, () => adminService.getPendingMerchants(req.query));
    handleMerchantAction = async (req, res) => {
        const merchantId = Number(req.params.merchantId);
        const action = req.body?.action;
        if (!Number.isSafeInteger(merchantId) || merchantId <= 0 || !['approve', 'reject'].includes(action)) {
            res.status(400).json({ success: false, message: 'Mã đối tác hoặc thao tác không hợp lệ.' });
            return;
        }
        const success = await adminService.handleMerchantAction(merchantId, action);
        res.status(success ? 200 : 404).json({
            success,
            message: success
                ? `Đối tác đã được ${action === 'approve' ? 'phê duyệt' : 'từ chối'}.`
                : 'Không tìm thấy đối tác đang chờ duyệt.',
        });
    };
    getWaitingRefunds = (req, res) => this.respond(res, () => adminService.getRefunds(false, req.query));
    getRefundHistory = (req, res) => this.respond(res, () => adminService.getRefunds(true, req.query));
    processAdminRefund = async (req, res) => {
        const id = Number(req.params.id);
        const action = req.body?.action;
        if (!Number.isSafeInteger(id) || id <= 0 || !['approve', 'reject'].includes(action)) {
            res.status(400).json({ success: false, message: 'Mã yêu cầu hoặc thao tác không hợp lệ.' });
            return;
        }
        await this.respond(res, () => adminService.processAdminRefund(id, action));
    };
    getTickets = (req, res) => this.respond(res, () => adminService.getTickets(req.query));
    getPayments = (req, res) => this.respond(res, () => adminService.getPayments(req.query));
    closeFailedPayment = async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) {
            res.status(400).json({ success: false, message: 'Mã giao dịch không hợp lệ.' });
            return;
        }
        await this.respond(res, () => adminService.closeFailedPayment(id));
    };
    getPartnerPayouts = (req, res) => this.respond(res, () => adminService.getPartnerPayouts(req.query));
    createPartnerPayout = async (req, res) => {
        const partnerId = Number(req.params.partnerId);
        const referenceCode = typeof req.body?.referenceCode === 'string' ? req.body.referenceCode : '';
        const adminId = Number(req.user?.user_id);
        if (!Number.isSafeInteger(partnerId) || partnerId <= 0 || !referenceCode.trim() || referenceCode.length > 100) {
            res.status(400).json({ success: false, message: 'Đối tác hoặc mã tham chiếu không hợp lệ.' });
            return;
        }
        await this.respond(res, () => adminService.createPartnerPayout(partnerId, adminId, referenceCode));
    };
    getFinancialActivity = (req, res) => this.respond(res, () => adminService.getFinancialActivity(req.query));
}
