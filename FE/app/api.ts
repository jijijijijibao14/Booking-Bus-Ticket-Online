import axios from 'axios';

// Tạo một instance axios cho các request cần xác thực
const apiClient = axios.create({
  baseURL: 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

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
      error.response.status === 401
    ) {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('userName');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userPhone');
      localStorage.removeItem('userStatus');

      alert(
        'Phiên đăng nhập của bạn đã hết hạn. Vui lòng đăng nhập lại.',
      );

      window.location.href = '/login';
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
    token: string;
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
  data: any,
) => {
  return apiClient.post(
    '/merchant/fleet',
    data,
  );
};

export const updateMerchantBus = (
  id: string | number,
  data: any,
) => {
  return apiClient.patch(
    `/merchant/fleet/${id}`,
    data,
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
export const getMerchantApprovals =
  () => {
    // Route được định nghĩa trong admin.route.ts là /approvals
    return apiClient.get('/admin/approvals');
  };

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

export const getAdminSchedules = () =>
  apiClient.get('/admin/schedules');

export const getWaitingRefunds = () => {
  return apiClient.get('/admin/refunds/waiting');
};

export const processAdminRefund = (
  id: string,
  action: 'approve' | 'reject',
) => {
  return apiClient.patch(`/admin/refunds/${id}/process`, { action });
};



export const getAdminFleet = () =>
  apiClient.get('/admin/fleet');

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