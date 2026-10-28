import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Status, formatDate, formatMoney, type AdminDetail, type AdminListProps, type AdminTab } from './AdminSectionShared';

const PAGE_SIZE = 20;

type PageResult = {
  items: any[];
  page: number;
  pageSize: number;
  total: number;
};

const menuItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Tổng quan hoạt động', icon: LayoutDashboard },
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
  const authorized = localStorage.getItem('token') && localStorage.getItem('role') === 'Admin';
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
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
  const [payoutPartner, setPayoutPartner] = useState<any>(null);
  const [payoutReference, setPayoutReference] = useState('');
  const [detail, setDetail] = useState<AdminDetail | null>(null);

  useEffect(() => {
    if (!authorized) navigate('/login', { replace: true });
  }, [authorized, navigate]);

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
        setRefundHistoryRows(historyResult.items);
        setRefundHistoryTotal(historyResult.total);
      } else if (activeTab === 'wallet') {
        const [payoutsResponse, financialResponse, commissionSettingsResponse, partnersResponse] = await Promise.all([
          getAdminPayouts(params),
          getAdminFinancialActivity({ ...params, direction: direction as 'in' | 'out' | undefined }),
          getAdminCommissionSettings(),
          getAdminPartners({
            page,
            pageSize: PAGE_SIZE,
            search: search.trim() || undefined,
          }),
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

  const changeTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setPage(1);
    setSearch('');
    setStatus('');
    setFromDate('');
    setToDate('');
    setDirection('');
  };

  const logout = () => {
    ['token', 'role', 'userName', 'userEmail', 'userPhone', 'userStatus'].forEach((key) => localStorage.removeItem(key));
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
    if (!commissionRate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error('Tỷ lệ hoa hồng phải từ 0 đến 100%.');
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

  const updateAccountStatus = (user: any, action: 'activate' | 'suspend' | 'delete') => {
    const prompt = action === 'delete'
      ? `Lưu trữ tài khoản ${user.name}? Tài khoản sẽ không thể đăng nhập; dữ liệu giao dịch lịch sử được giữ lại.`
      : `Xác nhận ${action === 'suspend' ? 'khóa' : 'mở khóa'} tài khoản ${user.name}?`;
    if (window.confirm(prompt)) {
      void processAction(() => updateAdminAccountStatus(user.id, action), action === 'delete' ? 'Đã lưu trữ tài khoản.' : 'Đã cập nhật trạng thái tài khoản.');
    }
  };

  const approvePartner = (partner: any, action: 'approve' | 'reject') => {
    const actionLabel = action === 'approve' ? 'Duyệt' : 'Từ chối';
    if (window.confirm(`${actionLabel} đối tác ${partner.companyName}?`)) {
      void processAction(
        () => processMerchantApproval(String(partner.id), action),
        action === 'approve' ? 'Đã duyệt đối tác.' : 'Đã từ chối đối tác.',
      );
    }
  };

  const processRefund = (
    item: any,
    action: 'approve-refund' | 'reject-refund',
  ) => {
    const prompt = action === 'approve-refund'
      ? `Xác nhận hoàn ${formatMoney(item.refundAmount)} vào ví khách hàng ${item.customer}?`
      : `Từ chối hoàn tiền ${formatMoney(item.refundAmount)} cho ${item.bookingCode}?`;
    if (!window.confirm(prompt)) return;

    const approved = action === 'approve-refund';
    void processAction(
      () => processAdminRefund(item.id, approved ? 'approve' : 'reject'),
      approved ? 'Đã hoàn tiền.' : 'Đã từ chối hoàn tiền.',
    );
  };

  const confirmPayout = async () => {
    const amount = Number(payoutPartner?.withdrawableBalance);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Đối tác hiện không có số dư để chi trả.');
      return;
    }
    if (!payoutReference.trim()) {
      toast.error('Vui lòng nhập mã tham chiếu chuyển khoản.');
      return;
    }
    const confirmed = window.confirm(
      `Xác nhận chi trả ${formatMoney(amount)} từ ví hệ thống vào ví đối tác ${payoutPartner.brandName ?? payoutPartner.name}?`,
    );
    if (!confirmed) return;
    const success = await processAction(
      () => createAdminPartnerPayout(Number(payoutPartner.id), { referenceCode: payoutReference.trim() }),
      'Đã ghi nhận chi trả.',
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
  const title = activeMenuItem?.label ?? 'Quản trị';

  if (!authorized) return null;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-64 flex-col bg-slate-950 text-white">
        <div className="border-b border-white/10 px-5 py-5">
          <h1 className="text-lg font-bold">VIỆTGO Admin</h1>
          <p className="text-xs text-slate-400">Quản trị nền tảng</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => changeTab(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${activeTab === item.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
              {item.id === 'partners' && overview?.summary?.pendingPartners > 0 && <span className="ml-auto rounded-full bg-amber-400 px-2 text-xs text-slate-950">{overview.summary.pendingPartners}</span>}
              {item.id === 'refunds' && overview?.summary?.pendingRefunds > 0 && <span className="ml-auto rounded-full bg-amber-400 px-2 text-xs text-slate-950">{overview.summary.pendingRefunds}</span>}
            </button>
          ))}
        </nav>
        <button onClick={logout} className="flex items-center gap-3 border-t border-white/10 px-5 py-4 text-sm text-slate-300 hover:bg-white/10">
          <LogOut className="h-4 w-4" /> Đăng xuất
        </button>
      </aside>

      <main className="min-w-0 flex-1 overflow-x-hidden p-6 lg:p-9">
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
            onViewDetails={setDetail}
            onCloseFailed={(payment) => {
              if (window.confirm(`Đóng giao dịch Failed ${payment.transactionCode}?`)) {
                void processAction(() => closeFailedAdminPayment(payment.id), 'Đã đóng giao dịch.');
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
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Khi xác nhận, số dư khả dụng sẽ được trừ khỏi ví hệ thống và cộng vào ví đối tác.</p>
            <label className="mt-3 block text-sm">Mã tham chiếu chi trả
              <input value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPayoutPartner(null)} className="rounded-lg border px-4 py-2 text-sm">Đóng</button>
              <button onClick={() => void confirmPayout()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white">Xác nhận đã chuyển</button>
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
