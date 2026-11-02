import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Banknote,
  CreditCard,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';
import {
  AdminListFilters,
  closeFailedAdminPayment,
  createAdminPartnerPayout,
  getAdminCustomers,
  getAdminAnalytics,
  getAdminCommissionSettings,
  getAdminFinancialActivity,
  getAdminOverview,
  getAdminPartners,
  getAdminPayments,
  getAdminPayouts,
  getAdminRefundHistory,
  getAdminTickets,
  getMerchantApprovals,
  getWaitingRefunds,
  processAdminRefund,
  processMerchantApproval,
  updateAdminAccountStatus,
  updateAdminCommissionSettings,
} from '@/api';
import RefundSection from './RefundSection';
import DashboardSection from './DashboardSection';
import PaymentsSection from './PaymentsSection';
import PartnersSection from './PartnersSection';
import TicketsSection from './TicketsSection';
import UsersSection from './UsersSection';
import WalletSection from './WalletSection';
import AnalyticsSection from './AnalyticsSection';
import { Status, formatDate, formatMoney, type AdminDetail, type AdminListProps, type AdminTab } from './AdminSectionShared';
import { showConfirmDialog } from '@/utils/modal-dialog';

const PAGE_SIZE = 20;

type PageResult = {
  items: any[];
  page: number;
  pageSize: number;
  total: number;
};

const menuItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Tổng quan hoạt động', icon: LayoutDashboard },
  { id: 'analytics', label: 'Báo cáo & phân tích', icon: Banknote },
  { id: 'customers', label: 'Danh sách người dùng', icon: Users },
  { id: 'partners', label: 'Quản lý đối tác', icon: Banknote },
  { id: 'tickets', label: 'Danh sách vé', icon: Ticket },
  { id: 'payments', label: 'Giao dịch thanh toán', icon: CreditCard },
  { id: 'refunds', label: 'Quản lý hoàn tiền', icon: RefreshCw },
  { id: 'wallet', label: 'Chi trả & hoạt động tài chính', icon: Wallet },
];

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message ?? error.message;
  }
  return error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.';
}

export default function Admin() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const authorized = localStorage.getItem('token') && localStorage.getItem('role') === 'Admin';
  const getRequestedTab = (): AdminTab => {
    const requestedTab = searchParams.get('tab') as AdminTab | null;
    return menuItems.some((item) => item.id === requestedTab) ? requestedTab! : 'overview';
  };
  const [activeTab, setActiveTab] = useState<AdminTab>(getRequestedTab);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [direction, setDirection] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [approvalRows, setApprovalRows] = useState<any[]>([]);
  const [approvalTotal, setApprovalTotal] = useState(0);
  const [payoutPartnerRows, setPayoutPartnerRows] = useState<any[]>([]);
  const [payoutPartnerTotal, setPayoutPartnerTotal] = useState(0);
  const [refundHistoryRows, setRefundHistoryRows] = useState<any[]>([]);
  const [refundHistoryTotal, setRefundHistoryTotal] = useState(0);
  const [financialRows, setFinancialRows] = useState<any[]>([]);
  const [financialTotal, setFinancialTotal] = useState(0);
  const [commissionRate, setCommissionRate] = useState('10');
  const [savingCommissionRate, setSavingCommissionRate] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [paymentStatistics, setPaymentStatistics] = useState<any>(null);
  const [paymentTopCustomers, setPaymentTopCustomers] = useState<any[]>([]);
  const [pendingRefundCount, setPendingRefundCount] = useState(0);
  const [payoutPartner, setPayoutPartner] = useState<any>(null);
  const [payoutReference, setPayoutReference] = useState('');
  const [detail, setDetail] = useState<AdminDetail | null>(null);

  useEffect(() => {
    if (!authorized) navigate('/login', { replace: true });
  }, [authorized, navigate]);

  useEffect(() => {
    setActiveTab(getRequestedTab());
  }, [searchParams]);

  const loadData = useCallback(async () => {
    if (!authorized) return;
    setLoading(true);
    const params: AdminListFilters = {
      page,
      pageSize: PAGE_SIZE,
      search: search.trim() || undefined,
      status: status || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      direction: direction === 'in' || direction === 'out' ? direction : undefined,
    };
    try {
      if (activeTab === 'overview') {
        const response = await getAdminOverview(params);
        setOverview(response.data.data);
      } else if (activeTab === 'analytics') {
        const response = await getAdminAnalytics();
        setAnalytics(response.data.data);
      } else if (activeTab === 'partners') {
        const [partnersResponse, approvalsResponse] = await Promise.all([
          getAdminPartners(params),
          getMerchantApprovals(params),
        ]);
        const partnerResult: PageResult = partnersResponse.data.data;
        const approvalResult: PageResult = approvalsResponse.data.data;
        setRows(partnerResult.items);
        setTotal(partnerResult.total);
        setApprovalRows(approvalResult.items);
        setApprovalTotal(approvalResult.total);
      } else if (activeTab === 'refunds') {
        const [waitingResponse, historyResponse] = await Promise.all([
          getWaitingRefunds(params),
          getAdminRefundHistory(params),
        ]);
        const waitingResult: PageResult = waitingResponse.data.data;
        const historyResult: PageResult = historyResponse.data.data;
        setRows(waitingResult.items);
        setTotal(waitingResult.total);
        setPendingRefundCount(Number(waitingResult.total) || 0);
        setRefundHistoryRows(historyResult.items);
        setRefundHistoryTotal(historyResult.total);
      } else if (activeTab === 'wallet') {
        const [payoutsResponse, financialResponse, commissionSettingsResponse, partnersResponse, overviewResponse] = await Promise.all([
          getAdminPayouts(params),
          getAdminFinancialActivity({ ...params, direction: direction as 'in' | 'out' | undefined }),
          getAdminCommissionSettings(),
          getAdminPartners({
            page,
            pageSize: PAGE_SIZE,
            search: search.trim() || undefined,
          }),
          getAdminOverview({ page: 1, pageSize: PAGE_SIZE }),
        ]);
        const payoutsResult: PageResult = payoutsResponse.data.data;
        const financialResult: PageResult = financialResponse.data.data;
        const partnersResult: PageResult = partnersResponse.data.data;
        setRows(payoutsResult.items);
        setTotal(payoutsResult.total);
        setFinancialRows(financialResult.items);
        setFinancialTotal(financialResult.total);
        setPayoutPartnerRows(partnersResult.items);
        setPayoutPartnerTotal(partnersResult.total);
        setOverview(overviewResponse.data.data);
        setCommissionRate(String(commissionSettingsResponse.data.data.commissionRate));
      } else {
        let response;
        if (activeTab === 'customers') response = await getAdminCustomers(params);
        else if (activeTab === 'tickets') response = await getAdminTickets(params);
        else if (activeTab === 'payments') response = await getAdminPayments(params);
        else response = await getAdminFinancialActivity({ ...params, direction: direction as 'in' | 'out' | undefined });
        const result: PageResult = response.data.data;
        setRows(result.items);
        setTotal(result.total);
        if (activeTab === 'payments') {
          setPaymentStatistics(response.data.data.statistics);
          setPaymentTopCustomers(response.data.data.topCustomers ?? []);
        }
      }
    } catch (error) {
      toast.error(`Không thể tải dữ liệu: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [activeTab, authorized, direction, fromDate, page, search, status, toDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!authorized) return;
    let mounted = true;

    const refreshPendingRefundCount = async () => {
      try {
        const response = await getWaitingRefunds({ page: 1, pageSize: 1 });
        if (mounted) {
          setPendingRefundCount(Number(response.data.data.total) || 0);
        }
      } catch (error) {
        console.error('Could not refresh pending refund notification:', error);
      }
    };

    void refreshPendingRefundCount();
    const intervalId = window.setInterval(() => {
      void refreshPendingRefundCount();
    }, 30_000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [authorized]);

  const changeTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setPage(1);
    setSearch('');
    setStatus('');
    setFromDate('');
    setToDate('');
    setDirection('');
  };

  useEffect(() => {
    if (activeTab !== 'analytics') return;
    const intervalId = window.setInterval(() => {
      void loadData();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [activeTab, loadData]);

  const logout = () => {
    ['token', 'role', 'userName', 'userEmail', 'userPhone', 'userStatus'].forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem('rememberedEmail');
    navigate('/login', { replace: true });
  };

  const processAction = async (
    action: () => Promise<any>,
    successMessage: string,
  ): Promise<boolean> => {
    try {
      const response = await action();
      if (response.data.success === false) throw new Error(response.data.message);
      toast.success(response.data.message ?? successMessage);
      await loadData();
      if (activeTab === 'overview') {
        const updated = await getAdminOverview({ page, pageSize: PAGE_SIZE });
        setOverview(updated.data.data);
      }
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  };

  const saveCommissionRate = async () => {
    const rate = Number(commissionRate);
    if (!commissionRate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100
      || !/^\d{1,3}(\.\d{1,2})?$/.test(commissionRate.trim())) {
      toast.error('Tỷ lệ hoa hồng phải từ 0 đến 100%, tối đa 2 chữ số thập phân.');
      return;
    }
    setSavingCommissionRate(true);
    try {
      await processAction(
        () => updateAdminCommissionSettings(rate),
        'Đã cập nhật tỷ lệ hoa hồng.',
      );
    } finally {
      setSavingCommissionRate(false);
    }
  };

  const updateAccountStatus = async (user: any, action: 'activate' | 'suspend' | 'delete') => {
    const prompt = action === 'delete'
      ? `Lưu trữ tài khoản ${user.name ?? user.brandName}? Tài khoản sẽ không thể đăng nhập; dữ liệu giao dịch lịch sử vẫn được giữ lại.`
      : `Xác nhận ${action === 'suspend' ? 'khóa' : 'mở khóa'} tài khoản ${user.name ?? user.brandName}?`;
    const confirmed = await showConfirmDialog({
      title: action === 'delete' ? 'Lưu trữ tài khoản?' : 'Xác nhận thay đổi tài khoản',
      message: prompt,
      confirmLabel: action === 'delete' ? 'Lưu trữ' : action === 'suspend' ? 'Khóa tài khoản' : 'Mở khóa',
      variant: action === 'delete' || action === 'suspend' ? 'danger' : 'info',
    });
    if (!confirmed) return;
    void processAction(
      () => updateAdminAccountStatus(user.id, action),
      action === 'delete' ? 'Đã lưu trữ tài khoản.' : 'Đã cập nhật trạng thái tài khoản.',
    );
  };

  const approvePartner = async (partner: any, action: 'approve' | 'reject') => {
    const actionLabel = action === 'approve' ? 'Duyệt' : 'Từ chối';
    const confirmed = await showConfirmDialog({
      title: `${actionLabel} đối tác?`,
      message: `${actionLabel} đối tác ${partner.companyName}?`,
      confirmLabel: actionLabel,
      variant: action === 'reject' ? 'danger' : 'info',
    });
    if (!confirmed) return;
    void processAction(
      () => processMerchantApproval(String(partner.id), action),
      action === 'approve' ? 'Đã duyệt đối tác.' : 'Đã từ chối đối tác.',
    );
  };

  const processRefund = async (
    item: any,
    action: 'approve-refund' | 'reject-refund',
  ) => {
    const approved = action === 'approve-refund';
    const confirmed = await showConfirmDialog({
      title: approved ? 'Xác nhận hoàn tiền' : 'Từ chối yêu cầu hoàn tiền?',
      message: approved
        ? `Xác nhận hoàn ${formatMoney(item.refundAmount)} vào ví khách hàng ${item.customer}?`
        : `Từ chối hoàn tiền ${formatMoney(item.refundAmount)} cho booking ${item.bookingCode}?`,
      confirmLabel: approved ? 'Xác nhận hoàn' : 'Từ chối yêu cầu',
      variant: approved ? 'warning' : 'danger',
    });
    if (!confirmed) return;
    void processAction(
      () => processAdminRefund(item.id, approved ? 'approve' : 'reject'),
      approved ? 'Đã hoàn tiền vào ví khách hàng.' : 'Đã từ chối yêu cầu hoàn tiền.',
    );
  };

  const confirmPayout = async () => {
    const amount = Number(payoutPartner?.withdrawableBalance);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Đối tác hiện không có số dư có thể chi trả.');
      return;
    }
    if (!payoutReference.trim()) {
      toast.error('Vui lòng nhập mã tham chiếu chi trả.');
      return;
    }
    if (payoutReference.trim().length > 100) {
      toast.error('Mã tham chiếu tối đa 100 ký tự.');
      return;
    }
    const confirmed = await showConfirmDialog({
      title: 'Xác nhận ghi nhận chi trả',
      message: `Xác nhận ghi nhận chi trả ${formatMoney(amount)} từ số dư hệ thống vào ví đối tác ${payoutPartner.brandName ?? payoutPartner.name}?`,
      confirmLabel: 'Xác nhận chi trả',
      variant: 'warning',
    });
    if (!confirmed) return;
    const success = await processAction(
      () => createAdminPartnerPayout(Number(payoutPartner.id), { referenceCode: payoutReference.trim() }),
      'Đã ghi nhận chi trả nội bộ.',
    );
    if (!success) return;
    setPayoutPartner(null);
    setPayoutReference('');
  };

  const listProps: AdminListProps = {
    rows,
    loading,
    total,
    page,
    onPageChange: setPage,
    search,
    onSearchChange: (value) => { setSearch(value); setPage(1); },
    status,
    onStatusChange: (value) => { setStatus(value); setPage(1); },
    fromDate,
    onFromDateChange: (value) => { setFromDate(value); setPage(1); },
    toDate,
    onToDateChange: (value) => { setToDate(value); setPage(1); },
    direction,
    onDirectionChange: (value) => { setDirection(value); setPage(1); },
  };

  const activeMenuItem = menuItems.find((item) => item.id === activeTab);
  const title = activeMenuItem?.label ?? 'Quản trị hệ thống';

  if (!authorized) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="border-b border-sidebar-border p-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-lg text-left text-lg font-bold transition-colors hover:text-white/80"
          >
            Trở về trang chủ
          </button>
          <p className="text-xs text-sidebar-foreground/60">Quản trị nền tảng</p>
        </div>
        <nav className="flex-1 space-y-2 overflow-y-auto p-4">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => changeTab(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors ${activeTab === item.id ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/80 hover:bg-sidebar-accent'}`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
              {item.id === 'partners' && overview?.summary?.pendingPartners > 0 && <span className="ml-auto rounded-full bg-amber-400 px-2 text-xs text-slate-950">{overview.summary.pendingPartners}</span>}
              {item.id === 'refunds' && pendingRefundCount > 0 && <span className="ml-auto rounded-full bg-amber-400 px-2 text-xs text-slate-950">{pendingRefundCount}</span>}
            </button>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent">
            <LogOut className="h-5 w-5" /> Đăng xuất
          </button>
        </div>
      </aside>

      <main className="h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6 lg:p-9">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">Dữ liệu được tải trực tiếp từ backend.</p>
          </div>
          <button onClick={() => void loadData()} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm hover:bg-slate-100">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
        </header>

        {activeTab === 'overview' && <DashboardSection overview={overview} page={page} onPageChange={setPage} />}
        {activeTab === 'analytics' && <AnalyticsSection data={analytics} />}
        {activeTab === 'customers' && <UsersSection {...listProps} onViewDetails={setDetail} onUpdateStatus={updateAccountStatus} />}
        {activeTab === 'partners' && (
          <PartnersSection
            {...listProps}
            approvalRows={approvalRows}
            approvalTotal={approvalTotal}
            onViewDetails={setDetail}
            onUpdateStatus={updateAccountStatus}
            onApproval={approvePartner}
          />
        )}
        {activeTab === 'tickets' && <TicketsSection {...listProps} onViewDetails={setDetail} />}
        {activeTab === 'payments' && (
          <PaymentsSection
            {...listProps}
            statistics={paymentStatistics}
            topCustomers={paymentTopCustomers}
            onViewDetails={setDetail}
            onCloseFailed={async (payment) => {
              const confirmed = await showConfirmDialog({
                title: 'Đóng giao dịch thất bại?',
                message: `Đóng giao dịch Failed ${payment.transactionCode}? Thao tác này không phải là hoàn tiền.`,
                confirmLabel: 'Đóng giao dịch',
                variant: 'warning',
              });
              if (confirmed) {
                void processAction(() => closeFailedAdminPayment(payment.id), 'Đã đóng giao dịch Failed.');
              }
            }}
          />
        )}
        {activeTab === 'refunds' && (
          <RefundSection
            {...listProps}
            historyRows={refundHistoryRows}
            historyTotal={refundHistoryTotal}
            onViewDetails={setDetail}
            onProcess={processRefund}
          />
        )}
        {activeTab === 'wallet' && (
          <WalletSection
            {...listProps}
            partnerRows={payoutPartnerRows}
            partnerTotal={payoutPartnerTotal}
            financialRows={financialRows}
            financialTotal={financialTotal}
            systemWalletBalance={overview?.summary?.systemWalletBalance}
            commissionWalletBalance={overview?.summary?.commissionWalletBalance}
            commissionRate={commissionRate}
            onCommissionRateChange={setCommissionRate}
            onSaveCommissionRate={() => void saveCommissionRate()}
            savingCommissionRate={savingCommissionRate}
            onPayout={setPayoutPartner}
          />
        )}
      </main>

      {payoutPartner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">Ghi nhận chi trả đối tác</h3>
            <p className="mt-1 text-sm text-slate-600">{payoutPartner.brandName ?? payoutPartner.name} · Số tiền chi trả: <strong>{formatMoney(payoutPartner.withdrawableBalance)}</strong></p>
            <p className="mt-2 text-sm text-slate-600">
              {payoutPartner.bankName
                ? `${payoutPartner.bankName} · ${payoutPartner.bankAccountName} · ${payoutPartner.bankAccountNumber}${payoutPartner.bankBranchName ? ` · ${payoutPartner.bankBranchName}` : ''}`
                : 'Đối tác chưa khai báo tài khoản ngân hàng.'}
            </p>
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Thao tác này ghi nhận cập nhật số dư ví nội bộ; ứng dụng không tự chuyển khoản ngân hàng.</p>
            <label className="mt-3 block text-sm font-medium text-slate-700">Mã tham chiếu chi trả
              <input value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPayoutPartner(null)} className="rounded-lg border px-4 py-2 text-sm">Đóng</button>
              <button onClick={() => void confirmPayout()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white">Xác nhận chi trả</button>
            </div>
          </div>
        </div>
      )}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-lg font-bold">{detail.title} · Chi tiết</h3>
              <button onClick={() => setDetail(null)} className="rounded border px-3 py-1.5 text-sm">Đóng</button>
            </div>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {Object.entries(detail.item).map(([key, value]) => (
                <div key={key} className="border-b pb-2">
                  <dt className="text-xs capitalize text-slate-500">{key.replace(/([A-Z])/g, ' $1')}</dt>
                  <dd className="mt-1 break-words text-sm font-medium">
                    {value == null || value === '' ? '—'
                      : key === 'status' ? <Status value={String(value)} />
                        : /amount|balance|price|revenue/i.test(key) ? formatMoney(value)
                          : /date|time|createdAt/i.test(key) ? formatDate(value)
                            : typeof value === 'boolean' ? (value ? 'Có' : 'Không')
                              : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
