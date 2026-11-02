import axios from 'axios';
import { showAlertDialog } from '@/utils/modal-dialog';

const backendBaseUrl = 'http://localhost:3001';
let sessionExpiryDialogPending = false;

// Tạo một instance axios cho các request cần xác thực
const apiClient = axios.create({
  baseURL: `${backendBaseUrl}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getPublicAssetUrl = (resourcePath?: string | null) => {
  if (!resourcePath) return undefined;
  if (/^https?:\/\//i.test(resourcePath)) return resourcePath;
  return `${backendBaseUrl}${resourcePath.startsWith('/') ? '' : '/'}${resourcePath}`;
};

// Interceptor để tự động đính kèm token
// apiClient.interceptors.request.use(
//   (config) => {
//     const token =
//       localStorage.getItem('token');

//     if (token) {
//       config.headers.Authorization =
//         `Bearer ${token}`;
//     }

//     return config;
//   },
//   (error) => {
//     return Promise.reject(error);
//   },
// );
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

    // Chỉ gửi token nếu tồn tại và không phải chuỗi undefined/null
    if (token && token !== 'undefined' && token !== 'null') {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response &&
      error.response.status === 401 &&
      !sessionExpiryDialogPending
    ) {
      sessionExpiryDialogPending = true;
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('userName');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userPhone');
      localStorage.removeItem('userStatus');

      void showAlertDialog(
        'Phiên đăng nhập của bạn đã hết hạn. Vui lòng đăng nhập lại.',
        { title: 'Phiên đăng nhập hết hạn', variant: 'warning' },
      ).then(() => {
        window.location.href = '/login';
      });
    }

    return Promise.reject(error);
  },
);

// --- Auth ---
export const login = (data: any) => {
  return axios.post(
    'http://localhost:3001/api/auth/login',
    data,
  );
};

export const requestRegistrationOtp = (data: any) => {
  return axios.post(
    'http://localhost:3001/api/auth/register',
    data,
  );
};

export const verifyRegistrationOtp = (data: any) => {
  return axios.post(
    'http://localhost:3001/api/auth/register/verify-otp',
    data,
  );
};

export const changePassword = (
  data: {
    currentPassword: string;
    newPassword: string;
  },
) => {
  return apiClient.post(
    '/auth/change-password',
    data,
  );
};

export const forgotPassword = (
  data: { email: string },
) => {
  return axios.post(
    'http://localhost:3001/api/auth/forgot-password',
    data,
  );
};

export const resetPassword = (
  data: {
    token?: string;
    email?: string;
    otp?: string;
    newPassword: string;
  },
) => {
  return axios.post(
    'http://localhost:3001/api/auth/reset-password',
    data,
  );
};

// --- Trips ---
export const searchTrips = (
  params: any,
) => {
  return apiClient.get(
    '/trips/search',
    {
      params,
    },
  );
};

// --- Seat Maps ---
export const getTripSeatLayout = (
  tripId: string | number,
) => {
  return apiClient.get(
    `/trips/${tripId}/seats`,
  );
};

// --- Bookings ---
export const getBookingHistory =
  () => {
    return apiClient.get(
      '/bookings/history',
    );
  };

export const confirmSingleBooking = (
  payload: any,
) => {
  return apiClient.post(
    '/bookings/confirm-single',
    payload,
  );
};

export const confirmRoundtripBooking = (
  payloads: any[],
) => {
  return apiClient.post(
    '/bookings/confirm-roundtrip',
    {
      bookingPayloads: payloads,
    },
  );
};

export const cancelBooking = (
  bookingCode: string,
  reason: string,
) => {
  return apiClient.post(
    `/bookings/${bookingCode}/cancel`,
    {
      reason,
    },
  );
};

export const requestCancellation = (
  bookingCode: string,
  reason: string,
) => {
  return apiClient.post(
    `/bookings/${bookingCode}/request-cancellation`,
    {
      reason,
    },
  );
};

export const holdSeat = (
  payload: {
    tripId: string | number;
    seatId: number;
  },
) => {
  return apiClient.post(
    '/bookings/hold-seat',
    payload,
  );
};

export const releaseSeat = (
  payload: {
    tripId: string | number;
    seatId: number;
  },
) => {
  return apiClient.post(
    '/bookings/release-seat',
    payload,
  );
};

// --- Merchant ---
export const getMerchantStats =
  () => {
    return apiClient.get(
      '/merchant/stats',
    );
  };

export const getMerchantSchedules =
  () => {
    return apiClient.get(
      '/merchant/schedules',
    );
  };

export const createMerchantSchedule = (
  data: any,
) => {
  return apiClient.post(
    '/merchant/schedules',
    data,
  );
};

export const updateMerchantSchedule = (
  id: string | number,
  data: any,
) => {
  return apiClient.patch(
    `/merchant/schedules/${id}`,
    data,
  );
};

export const deleteMerchantSchedule = (
  id: string | number,
) => {
  return apiClient.delete(
    `/merchant/schedules/${id}`,
  );
};

export const previewRecurringSchedule = (data: Record<string, unknown>) =>
  apiClient.post('/merchant/schedules/recurring/preview', data);

export const createRecurringSchedule = (data: Record<string, unknown>) =>
  apiClient.post('/merchant/schedules/recurring', data);

export const getRecurringScheduleTemplates = () =>
  apiClient.get('/merchant/schedule-templates');

export const setRecurringScheduleTemplateStatus = (
  id: number,
  status: 'Active' | 'Paused',
) => apiClient.patch(`/merchant/schedule-templates/${id}/status`, { status });

export const getMerchantFleet =
  () => {
    return apiClient.get(
      '/merchant/fleet',
    );
  };

export const createMerchantBus = (
  data: FormData,
) => {
  return apiClient.post(
    '/merchant/fleet',
    data,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

export const updateMerchantBus = (
  id: string | number,
  data: FormData,
) => {
  return apiClient.patch(
    `/merchant/fleet/${id}`,
    data,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
};

export const deleteMerchantBus = (
  id: string | number,
) => {
  return apiClient.delete(
    `/merchant/fleet/${id}`,
  );
};

export const getMerchantDrivers =
  () => {
    return apiClient.get(
      '/merchant/drivers',
    );
  };

export const createMerchantDriver = (
  data: any,
) => {
  return apiClient.post(
    '/merchant/drivers',
    data,
  );
};

export const updateMerchantDriver = (
  id: string | number,
  data: any,
) => {
  return apiClient.patch(
    `/merchant/drivers/${id}`,
    data,
  );
};

export const deleteMerchantDriver = (
  id: string | number,
) => {
  return apiClient.delete(
    `/merchant/drivers/${id}`,
  );
};

export const getMerchantRefunds = () => {
  return apiClient.get('/merchant/refunds');
};

export const approveMerchantRefund = (id: string | number) => {
  return apiClient.patch(`/merchant/refunds/${id}/approve`);
};

export const rejectMerchantRefund = (id: string | number) => {
  return apiClient.patch(`/merchant/refunds/${id}/reject`);
};



export const getMerchantProfile =
  () => {
    return apiClient.get(
      '/merchant/profile',
    );
  };

// --- Customer Profile / Wallet ---
export const uploadAvatar = (file: File) => {
  const formData = new FormData();
  formData.append('avatar', file);
  return apiClient.post('/users/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getCurrentUserId = (): number | null => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const id = Number(payload.user_id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
};

export const getUserProfile =
  () => {
    return apiClient.get(
      '/users/profile',
    );
  };

export const updateUserInfo = (
  data: any,
) => {
  return apiClient.put(
    '/users/profile',
    data,
  );
};

export const updateMerchantProfile = (data: any) => {
  return apiClient.put(
    '/merchant/profile',
    data,
  );
};

export const getMerchantWallet = () => {
  return apiClient.get('/merchant/wallet');
};

// --- Wallet ---
export const getWalletTransactions = () => {
  return apiClient.get('/users/wallet/transactions');
};

// --- Admin ---
export type AdminListFilters = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  direction?: 'in' | 'out';
};
export const getAdminOverview = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/overview', { params });

export const getAdminAnalytics = () =>
  apiClient.get('/admin/analytics');

export const getAdminCommissionSettings = () =>
  apiClient.get('/admin/commission-settings');

export const updateAdminCommissionSettings = (commissionRate: number) =>
  apiClient.put('/admin/commission-settings', { commissionRate });

export const getAdminCustomers = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/customers', { params });

export const getAdminPartners = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/partners', { params });

export const updateAdminAccountStatus = (
  id: number,
  action: 'suspend' | 'activate' | 'delete',
) => apiClient.patch(`/admin/users/${id}/status`, { action });

export const getMerchantApprovals = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/approvals', { params });

export const processMerchantApproval = (
  merchantId: string,
  action: 'approve' | 'reject',
) => {
  // Backend đang dùng POST cho route này
  return apiClient.post(
    `/admin/approvals/${merchantId}`,
    {
      action,
    },
  );
};

export const getWaitingRefunds = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/refunds/waiting', { params });

export const getAdminRefundHistory = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/refunds/history', { params });


export const processAdminRefund = (
  id: string | number,
  action: 'approve' | 'reject',
) => {
  return apiClient.patch(`/admin/refunds/${id}/process`, { action });
};



export const getAdminTickets = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/tickets', { params });

export const getAdminPayments = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/payments', { params });

export const closeFailedAdminPayment = (id: number) =>
  apiClient.patch(`/admin/payments/${id}/close`);

export const getAdminPayouts = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/payouts', { params });

export const createAdminPartnerPayout = (
  partnerId: number,
  data: { referenceCode: string },
) => apiClient.post(`/admin/partners/${partnerId}/payouts`, data);

export const getAdminFinancialActivity = (params: AdminListFilters = {}) =>
  apiClient.get('/admin/financial-activity', { params });

export const getChatPartners = () =>
  apiClient.get('/communications/partners');

export const getConversations = () =>
  apiClient.get('/communications/conversations');

export const openConversation = (data: { type: 'partner' | 'support'; partnerId?: number }) =>
  apiClient.post('/communications/conversations', data);

export const getConversationMessages = (conversationId: number) =>
  apiClient.get(`/communications/conversations/${conversationId}/messages`);

export const sendConversationMessage = (conversationId: number, messageText: string) =>
  apiClient.post(`/communications/conversations/${conversationId}/messages`, { messageText });

export const getEligibleFeedbackTickets = () =>
  apiClient.get('/feedback/eligible');

export const submitTripFeedback = (
  ticketId: number,
  data: { ratingSeats: number; ratingService: number; comment: string },
) =>
  apiClient.post(`/feedback/${ticketId}`, data);

export const getMerchantFeedback = () =>
  apiClient.get('/merchant/feedback');

export const replyToFeedback = (feedbackId: number, reply: string) =>
  apiClient.post(`/merchant/feedback/${feedbackId}/reply`, { reply });