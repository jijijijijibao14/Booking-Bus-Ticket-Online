import { useEffect, useState } from 'react';
import { CalendarDays, Loader2, Pause, Play, RotateCcw } from 'lucide-react';
import {
  createRecurringSchedule,
  getRecurringScheduleTemplates,
  previewRecurringSchedule,
  setRecurringScheduleTemplateStatus,
} from '@/api';

interface Option {
  id: number;
  name: string;
  plateNumber?: string;
  status?: string;
}

interface RecurringScheduleManagerProps {
  vehicles: Option[];
  drivers: Option[];
  onCreated: () => Promise<void>;
}

interface PreviewOccurrence {
  departureTime: string;
  arrivalTime: string;
  estimatedDurationMinutes: number;
  conflicts: string[];
}

interface PreviewResult {
  durationSource: 'partner' | 'google_routes';
  drivingDurationMinutes: number;
  estimatedDurationMinutes: number;
  distanceKm: number | null;
  warning: string | null;
  validCount: number;
  invalidCount: number;
  occurrences: PreviewOccurrence[];
}

interface Template {
  scheduleTemplateId: number;
  departureLocation: string;
  arrivalLocation: string;
  vehicleId: number;
  driverId: number | null;
  startDate: string;
  endDate: string;
  weekdays: number[] | string;
  departureTimes: string[] | string;
  basePrice: number;
  drivingDurationMinutes: number;
  stopDurationMinutes: number;
  restDurationMinutes: number;
  bufferDurationMinutes: number;
  minimumTurnaroundMinutes: number;
  transferDurationMinutes: number;
  status: 'Active' | 'Paused';
  generatedTripCount: number;
}

const weekdays = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
];

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const minutesInput = (value: number) => Math.max(0, Number(value) || 0);

function parseJsonValue<T>(value: T | string): T {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return [] as T;
  }
}

export default function RecurringScheduleManager({
  vehicles,
  drivers,
  onCreated,
}: RecurringScheduleManagerProps) {
  const [form, setForm] = useState({
    departureLocation: '',
    arrivalLocation: '',
    vehicleId: '',
    driverId: '',
    startDate: today(),
    endDate: today(),
    weekdays: [1, 2, 3, 4, 5, 6, 0],
    departureTimes: '08:00, 14:00',
    basePrice: '450000',
    drivingDurationMinutes: '180',
    stopDurationMinutes: '0',
    restDurationMinutes: '0',
    bufferDurationMinutes: '30',
    minimumTurnaroundMinutes: '60',
    transferDurationMinutes: '0',
  });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [validOnly, setValidOnly] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadTemplates = async () => {
    const response = await getRecurringScheduleTemplates();
    setTemplates(response.data.data);
  };

  useEffect(() => {
    let mounted = true;
    getRecurringScheduleTemplates()
      .then((response) => {
        if (mounted) setTemplates(response.data.data);
      })
      .catch((requestError) => {
        console.error('Could not load recurring schedule templates:', requestError);
        if (mounted) setError(requestError.response?.data?.message || 'Không thể tải các mẫu lịch chạy.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const makePayload = (key: string) => ({
    departureLocation: form.departureLocation.trim(),
    arrivalLocation: form.arrivalLocation.trim(),
    vehicleId: Number(form.vehicleId),
    driverId: form.driverId ? Number(form.driverId) : null,
    startDate: form.startDate,
    endDate: form.endDate,
    weekdays: form.weekdays,
    departureTimes: form.departureTimes.split(',').map((time) => time.trim()).filter(Boolean),
    basePrice: Number(form.basePrice),
    drivingDurationMinutes: Number(form.drivingDurationMinutes),
    stopDurationMinutes: Number(form.stopDurationMinutes),
    restDurationMinutes: Number(form.restDurationMinutes),
    bufferDurationMinutes: Number(form.bufferDurationMinutes),
    minimumTurnaroundMinutes: Number(form.minimumTurnaroundMinutes),
    transferDurationMinutes: Number(form.transferDurationMinutes),
    idempotencyKey: key,
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setPreview(null);
    setIdempotencyKey('');
    setNotice('');
  };

  const toggleWeekday = (day: number) => {
    setForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day],
    }));
    setPreview(null);
    setIdempotencyKey('');
  };

  const handlePreview = async () => {
    setError('');
    setNotice('');
    setLoadingPreview(true);
    const key = crypto.randomUUID();
    try {
      const response = await previewRecurringSchedule(makePayload(key));
      setPreview(response.data.data);
      setIdempotencyKey(key);
    } catch (requestError: any) {
      console.error('Could not preview recurring schedule:', requestError);
      setError(requestError.response?.data?.message || 'Không thể xem trước lịch chạy.');
      setPreview(null);
      setIdempotencyKey('');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCreate = async () => {
    if (!preview || !idempotencyKey) return;
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const response = await createRecurringSchedule({
        ...makePayload(idempotencyKey),
        mode: validOnly ? 'valid_only' : 'all_or_nothing',
      });
      const result = response.data.data;
      setNotice(`Đã tạo ${result.createdCount} chuyến. ${result.skipped?.length || 0} chuyến bị bỏ qua.`);
      setPreview(null);
      setIdempotencyKey('');
      try {
        await Promise.all([loadTemplates(), onCreated()]);
      } catch (refreshError) {
        console.error('Trips were created but dashboard data could not be refreshed:', refreshError);
        setError('Các chuyến đã được tạo nhưng không thể tải lại danh sách. Vui lòng làm mới trang.');
      }
    } catch (requestError: any) {
      const data = requestError.response?.data?.data as PreviewResult | undefined;
      if (data?.occurrences) setPreview(data);
      setError(requestError.response?.data?.message || 'Không thể tạo các chuyến.');
    } finally {
      setCreating(false);
    }
  };

  const copyTemplate = (template: Template) => {
    const days = parseJsonValue<number[]>(template.weekdays);
    const times = parseJsonValue<string[]>(template.departureTimes);
    setForm({
      departureLocation: template.departureLocation,
      arrivalLocation: template.arrivalLocation,
      vehicleId: String(template.vehicleId),
      driverId: template.driverId ? String(template.driverId) : '',
      startDate: today(),
      endDate: today(),
      weekdays: days,
      departureTimes: times.join(', '),
      basePrice: String(template.basePrice),
      drivingDurationMinutes: String(template.drivingDurationMinutes),
      stopDurationMinutes: String(template.stopDurationMinutes),
      restDurationMinutes: String(template.restDurationMinutes),
      bufferDurationMinutes: String(template.bufferDurationMinutes),
      minimumTurnaroundMinutes: String(template.minimumTurnaroundMinutes),
      transferDurationMinutes: String(template.transferDurationMinutes),
    });
    setPreview(null);
    setIdempotencyKey('');
    setNotice('');
    setError('');
  };

  const toggleTemplate = async (template: Template) => {
    setError('');
    try {
      await setRecurringScheduleTemplateStatus(
        template.scheduleTemplateId,
        template.status === 'Active' ? 'Paused' : 'Active',
      );
      await loadTemplates();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'Không thể cập nhật trạng thái mẫu lịch.');
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <header>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-blue-700" />
          <h3 className="text-lg font-bold text-slate-900">Tạo lịch chạy định kỳ</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Tạo trước tối đa 728 chuyến. Giờ đến được lưu cố định theo từng chuyến.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}

      <fieldset disabled={loadingPreview || creating} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Điểm đi
          <input value={form.departureLocation} onChange={(event) => updateField('departureLocation', event.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border p-2" placeholder="Đà Nẵng" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Điểm đến
          <input value={form.arrivalLocation} onChange={(event) => updateField('arrivalLocation', event.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border p-2" placeholder="Huế" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Xe
          <select value={form.vehicleId} onChange={(event) => updateField('vehicleId', event.target.value)} className="mt-1 w-full rounded-lg border p-2">
            <option value="">Chọn xe đang hoạt động</option>
            {vehicles.filter((vehicle) => (vehicle.status || '').toLowerCase() === 'active').map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber || vehicle.id} — {vehicle.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Tài xế (không bắt buộc)
          <select value={form.driverId} onChange={(event) => updateField('driverId', event.target.value)} className="mt-1 w-full rounded-lg border p-2">
            <option value="">Chưa phân công</option>
            {drivers.filter((driver) => (driver.status || '').toLowerCase() === 'available').map((driver) => (
              <option key={driver.id} value={driver.id}>{driver.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Ngày bắt đầu
          <input type="date" min={today()} value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Ngày kết thúc (tối đa 91 ngày)
          <input type="date" min={form.startDate || today()} value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <div className="md:col-span-2">
          <p className="mb-2 text-sm font-medium text-slate-700">Ngày trong tuần</p>
          <div className="flex flex-wrap gap-2">
            {weekdays.map((day) => (
              <button key={day.value} type="button" aria-pressed={form.weekdays.includes(day.value)} onClick={() => toggleWeekday(day.value)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${form.weekdays.includes(day.value) ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {day.label}
              </button>
            ))}
          </div>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Giờ khởi hành (phân tách bằng dấu phẩy, tối đa 8 giờ/ngày)
          <input value={form.departureTimes} onChange={(event) => updateField('departureTimes', event.target.value)} className="mt-1 w-full rounded-lg border p-2" placeholder="08:00, 14:00" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Giá vé (₫)
          <input type="number" min="0" value={form.basePrice} onChange={(event) => updateField('basePrice', event.target.value)} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Thời lượng chạy tuyến (phút, dự phòng khi thiếu bản đồ)
          <input type="number" min="1" max="2880" value={form.drivingDurationMinutes} onChange={(event) => updateField('drivingDurationMinutes', event.target.value)} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Thời gian dừng đón/trả (phút)
          <input type="number" min="0" value={form.stopDurationMinutes} onChange={(event) => updateField('stopDurationMinutes', String(minutesInput(Number(event.target.value))))} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Nghỉ dọc đường (phút)
          <input type="number" min="0" value={form.restDurationMinutes} onChange={(event) => updateField('restDurationMinutes', String(minutesInput(Number(event.target.value))))} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Thời gian dự phòng (phút)
          <input type="number" min="0" value={form.bufferDurationMinutes} onChange={(event) => updateField('bufferDurationMinutes', String(minutesInput(Number(event.target.value))))} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Nghỉ/quay đầu tối thiểu giữa chuyến (phút)
          <input type="number" min="60" value={form.minimumTurnaroundMinutes} onChange={(event) => updateField('minimumTurnaroundMinutes', String(Math.max(60, minutesInput(Number(event.target.value)))))} className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Trung chuyển tới điểm xuất phát tiếp theo (phút)
          <input type="number" min="0" value={form.transferDurationMinutes} onChange={(event) => updateField('transferDurationMinutes', String(minutesInput(Number(event.target.value))))} className="mt-1 w-full rounded-lg border p-2" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handlePreview} disabled={loadingPreview || creating}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
          {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Xem trước và kiểm tra xung đột
        </button>
        {preview && (
          <>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={validOnly} onChange={(event) => setValidOnly(event.target.checked)} />
              Chỉ tạo chuyến hợp lệ, bỏ qua chuyến lỗi
            </label>
            <button type="button" onClick={handleCreate}
              disabled={creating || preview.validCount === 0 || (!validOnly && preview.invalidCount > 0)}
              className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {creating ? 'Đang tạo...' : `Xác nhận tạo ${validOnly ? preview.validCount : preview.occurrences.length} chuyến`}
            </button>
          </>
        )}
      </div>

      {preview && (
        <div className="space-y-3 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            {preview.validCount} chuyến hợp lệ · {preview.invalidCount} chuyến lỗi · Tổng thời lượng {preview.estimatedDurationMinutes} phút
            {preview.distanceKm != null ? ` · ${preview.distanceKm} km` : ''}
          </p>
          <p className="text-xs text-slate-500">
            Thời lượng chạy: {preview.drivingDurationMinutes} phút ({preview.durationSource === 'google_routes' ? 'Google Routes' : 'nhà xe cung cấp'}).
            Thời gian nghỉ 60 phút không thay thế quy định pháp luật về thời giờ làm việc tài xế.
          </p>
          {preview.warning && <p className="text-sm text-amber-800">{preview.warning}</p>}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {preview.occurrences.map((trip, index) => (
              <div key={`${trip.departureTime}-${index}`} className={`rounded-lg p-3 text-sm ${trip.conflicts.length ? 'bg-rose-50 text-rose-800' : 'bg-white text-slate-700'}`}>
                <p className="font-semibold">
                  {new Date(trip.departureTime.replace(' ', 'T')).toLocaleString('vi-VN')}
                  {' → '}
                  {new Date(trip.arrivalTime.replace(' ', 'T')).toLocaleString('vi-VN')}
                </p>
                {trip.conflicts.length > 0 && <p className="mt-1">{trip.conflicts.join(' ')}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {templates.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="mb-3 font-semibold text-slate-800">Mẫu lịch đã lưu</h4>
          <div className="space-y-2">
            {templates.map((template) => (
              <div key={template.scheduleTemplateId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                <div className="text-sm">
                  <p className="font-semibold">{template.departureLocation} → {template.arrivalLocation}</p>
                  <p className="text-slate-500">{template.generatedTripCount} chuyến đã tạo · {template.status === 'Active' ? 'Đang hoạt động' : 'Tạm ngừng'}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => copyTemplate(template)} disabled={template.status !== 'Active'} title={template.status !== 'Active' ? 'Mẫu đã tạm ngừng' : undefined} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                    <RotateCcw className="h-4 w-4" /> Dùng lại
                  </button>
                  <button type="button" onClick={() => void toggleTemplate(template)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm">
                    {template.status === 'Active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {template.status === 'Active' ? 'Tạm ngừng' : 'Kích hoạt'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </fieldset>
    </section>
  );
}
