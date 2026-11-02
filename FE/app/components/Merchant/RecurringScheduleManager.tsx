import { useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import {
  createRecurringSchedule,
  previewRecurringSchedule,
} from '@/api';
import { formatVietnameseLicensePlate } from '@/utils/license-plate';
import { formControlClassName } from '@/utils/form-styles';
import LocationAutocomplete from './LocationAutocomplete';
import DriverMultiSelect from './DriverMultiSelect';

interface Option {
  id: number;
  name: string;
  plateNumber?: string;
  status?: string;
}

function parseIdList(value: string | null): number[] {
  if (!value) return [];
  return value.split(',')
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

function dateOnly(value: string | null | undefined): string {
  return String(value || '').slice(0, 10);
}

interface RecurringScheduleManagerProps {
  vehicles: Option[];
  drivers: Option[];
  schedules: any[];
  onCreated: () => Promise<void>;
}

interface PreviewOccurrence {
  departureTime: string;
  arrivalTime: string;
  departureLocation: string;
  arrivalLocation: string;
  direction: 'outbound' | 'return';
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

function isAllowedDepartureTime(value: string): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return false;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 8 * 60 && minutes <= 20 * 60;
}

export default function RecurringScheduleManager({
  vehicles,
  drivers,
  schedules,
  onCreated,
}: RecurringScheduleManagerProps) {
  const [form, setForm] = useState({
    departureLocation: '',
    arrivalLocation: '',
    vehicleId: '',
    driverId: '',
    secondaryDriverIds: [] as number[],
    startDate: today(),
    endDate: today(),
    weekdays: [1, 2, 3, 4, 5, 6, 0],
    departureTimes: '08:00, 14:00',
    basePrice: '450000',
    drivingDurationHours: '3',
    stopDurationMinutes: '0',
    restDurationMinutes: '0',
    bufferDurationMinutes: '30',
    minimumTurnaroundMinutes: '60',
  });
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [validOnly, setValidOnly] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const reservedDriverIds = new Set<number>();
  schedules.forEach((schedule) => {
    if (
      schedule.status === 'Cancelled' ||
      dateOnly(schedule.departureTime) > form.endDate ||
      dateOnly(schedule.arrivalTime) < form.startDate
    ) {
      return;
    }
    if (schedule.driverId) {
      reservedDriverIds.add(Number(schedule.driverId));
    }
    parseIdList(schedule.secondaryDriverIds).forEach((driverId) =>
      reservedDriverIds.add(driverId),
    );
  });

  const makePayload = (key: string) => ({
    departureLocation: form.departureLocation.trim(),
    arrivalLocation: form.arrivalLocation.trim(),
    vehicleId: Number(form.vehicleId),
    driverId: form.driverId ? Number(form.driverId) : null,
    secondaryDriverIds: form.secondaryDriverIds,
    startDate: form.startDate,
    endDate: form.endDate,
    weekdays: form.weekdays,
    departureTimes: form.departureTimes.split(',').map((time) => time.trim()).filter(Boolean),
    basePrice: Number(form.basePrice),
    drivingDurationMinutes: Math.round(Number(form.drivingDurationHours) * 60),
    stopDurationMinutes: Number(form.stopDurationMinutes),
    restDurationMinutes: Number(form.restDurationMinutes),
    bufferDurationMinutes: Number(form.bufferDurationMinutes),
    minimumTurnaroundMinutes: Number(form.minimumTurnaroundMinutes),
    idempotencyKey: key,
  });

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setPreview(null);
    setIdempotencyKey('');
    setNotice('');
  };

  const updateSecondaryDrivers = (driverIds: number[]) => {
    setForm((current) => ({
      ...current,
      secondaryDriverIds: driverIds.filter((driverId) => driverId !== Number(current.driverId)),
    }));
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
    const departureTimes = form.departureTimes.split(',').map((time) => time.trim()).filter(Boolean);
    if (departureTimes.some((time) => !isAllowedDepartureTime(time))) {
      setError('Giờ khởi hành phải đúng định dạng HH:mm và nằm trong khoảng 08:00–20:00.');
      setPreview(null);
      setIdempotencyKey('');
      return;
    }
    const selectedDriverIds = [
      ...(form.driverId ? [Number(form.driverId)] : []),
      ...form.secondaryDriverIds,
    ];
    if (selectedDriverIds.some((driverId) => reservedDriverIds.has(driverId))) {
      setError('Tài xế đã được phân công cho lịch chạy khác trong khoảng ngày đã chọn.');
      setPreview(null);
      setIdempotencyKey('');
      return;
    }
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
        await onCreated();
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

  return (
    <section className="space-y-5 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <header>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-blue-700" />
          <h3 className="text-lg font-bold text-slate-900">Tạo lịch chạy định kỳ</h3>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Chỉ khởi hành từ 08:00 đến 20:00. Nếu chuyến tiếp theo sau thời gian nghỉ/quay đầu rơi ngoài khung giờ này, xe sẽ chờ đến giờ khởi hành đã chọn ở ngày chạy tiếp theo.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}

      <fieldset disabled={loadingPreview || creating} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <div className="grid gap-4 md:grid-cols-2">
        <LocationAutocomplete
          label="Điểm đi"
          value={form.departureLocation}
          onChange={(value) => updateField('departureLocation', value)}
          placeholder="Tìm hoặc nhập điểm đi"
        />
        <LocationAutocomplete
          label="Điểm đến"
          value={form.arrivalLocation}
          onChange={(value) => updateField('arrivalLocation', value)}
          placeholder="Tìm hoặc nhập điểm đến"
        />
        <label className="text-sm font-medium text-slate-700">
          Xe
          <select value={form.vehicleId} onChange={(event) => updateField('vehicleId', event.target.value)} className={`${formControlClassName} mt-1`}>
            <option value="">Chọn xe đang hoạt động</option>
            {vehicles.filter((vehicle) => (vehicle.status || '').toLowerCase() === 'active').map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>{formatVietnameseLicensePlate(vehicle.plateNumber) || vehicle.id} — {vehicle.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Tài xế chính
          <select value={form.driverId} onChange={(event) => updateField('driverId', event.target.value)} className={`${formControlClassName} mt-1`}>
            <option value="">Chưa phân công</option>
            {drivers.filter((driver) => (driver.status || '').toLowerCase() === 'available' && !form.secondaryDriverIds.includes(driver.id)).map((driver) => (
              <option
                key={driver.id}
                value={driver.id}
                disabled={reservedDriverIds.has(driver.id)}
              >
                {driver.name}
                {reservedDriverIds.has(driver.id) ? ' (đã có lịch trong khoảng ngày)' : ''}
              </option>
            ))}
          </select>
        </label>
        <DriverMultiSelect
          label="Tài xế phụ"
          drivers={drivers.filter((driver) => driver.id !== Number(form.driverId))}
          value={form.secondaryDriverIds}
          onChange={updateSecondaryDrivers}
          unavailableDriverIds={[...reservedDriverIds]}
        />
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Ngày bắt đầu
            <input type="date" min={today()} value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} className={`${formControlClassName} mt-1`} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Ngày kết thúc (tối đa 91 ngày)
            <input type="date" min={form.startDate || today()} value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} className={`${formControlClassName} mt-1`} />
          </label>
        </div>
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
          Giờ khởi hành (08:00–20:00, phân tách bằng dấu phẩy, tối đa 8 giờ/ngày)
          <input value={form.departureTimes} onChange={(event) => updateField('departureTimes', event.target.value)} className={`${formControlClassName} mt-1`} placeholder="08:00, 10:00, 14:00, 20:00" aria-describedby="recurring-departure-time-help" />
          <span id="recurring-departure-time-help" className="mt-1 block text-xs font-normal text-slate-500">
            Các chuyến đi-về tiếp tục theo chu kỳ chỉ khi giờ khởi hành nằm trong khoảng này; nếu đã quá 20:00, xe đợi giờ đã đặt của ngày chạy sau.
          </span>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Giá vé (₫)
          <input type="number" min="0" value={form.basePrice} onChange={(event) => updateField('basePrice', event.target.value)} className={`${formControlClassName} mt-1`} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Thời lượng chạy tuyến (giờ)
          <input type="number" min="0.02" max="48" step="0.01" value={form.drivingDurationHours} onChange={(event) => updateField('drivingDurationHours', event.target.value)} className={`${formControlClassName} mt-1`} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Thời gian dừng đón/trả (phút)
          <input type="number" min="0" value={form.stopDurationMinutes} onChange={(event) => updateField('stopDurationMinutes', String(minutesInput(Number(event.target.value))))} className={`${formControlClassName} mt-1`} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Nghỉ dọc đường (phút)
          <input type="number" min="0" value={form.restDurationMinutes} onChange={(event) => updateField('restDurationMinutes', String(minutesInput(Number(event.target.value))))} className={`${formControlClassName} mt-1`} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Thời gian dự phòng (phút)
          <input type="number" min="0" value={form.bufferDurationMinutes} onChange={(event) => updateField('bufferDurationMinutes', String(minutesInput(Number(event.target.value))))} className={`${formControlClassName} mt-1`} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Nghỉ/quay đầu tối thiểu giữa chuyến (phút)
          <input type="number" min="60" value={form.minimumTurnaroundMinutes} onChange={(event) => updateField('minimumTurnaroundMinutes', String(Math.max(60, minutesInput(Number(event.target.value)))))} className={`${formControlClassName} mt-1`} />
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
              Chỉ tạo chuyến hợp lệ; bỏ qua các chuyến sau nếu chu kỳ gặp lỗi
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
            Thời lượng chạy: {Math.floor(preview.drivingDurationMinutes / 60)} giờ {preview.drivingDurationMinutes % 60 > 0 ? `${preview.drivingDurationMinutes % 60} phút` : ''} ({preview.durationSource === 'google_routes' ? 'Google Routes' : 'nhà xe cung cấp'}).
            Thời gian nghỉ 60 phút không thay thế quy định pháp luật về thời giờ làm việc tài xế.
          </p>
          {preview.warning && <p className="text-sm text-amber-800">{preview.warning}</p>}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {preview.occurrences.map((trip, index) => (
              <div key={`${trip.departureTime}-${index}`} className={`rounded-lg p-3 text-sm ${trip.conflicts.length ? 'bg-rose-50 text-rose-800' : 'bg-white text-slate-700'}`}>
                <p className="font-semibold">
                  {trip.departureLocation} → {trip.arrivalLocation}
                  {' · '}
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

      </fieldset>
    </section>
  );
}
