import { formLabelClassName } from '@/utils/form-styles';

interface DriverOption {
  id: number;
  name: string;
  status?: string;
}

interface DriverMultiSelectProps {
  label: string;
  drivers: DriverOption[];
  value: number[];
  onChange: (driverIds: number[]) => void;
  unavailableDriverIds?: number[];
  unavailableReason?: string;
}

export default function DriverMultiSelect({
  label,
  drivers,
  value,
  onChange,
  unavailableDriverIds = [],
  unavailableReason = 'đã được phân công trong khoảng ngày đã chọn',
}: DriverMultiSelectProps) {
  const selectedIds = new Set(value);
  const unavailableIds = new Set(unavailableDriverIds);
  const options = drivers.filter((driver) =>
    (driver.status || '').toLowerCase() === 'available' || selectedIds.has(driver.id));

  return (
    <fieldset className="min-w-0">
      <legend className={`mb-1 ${formLabelClassName}`}>{label}</legend>
      {options.length > 0 ? (
        <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          {options.map((driver) => {
            const selected = selectedIds.has(driver.id);
            const reserved = unavailableIds.has(driver.id);
            const available =
              (driver.status || '').toLowerCase() === 'available' &&
              !reserved;
            return (
              <label key={driver.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!available && !selected}
                  onChange={(event) => {
                    onChange(event.target.checked
                      ? [...value, driver.id]
                      : value.filter((driverId) => driverId !== driver.id));
                  }}
                />
                <span>{driver.name}</span>
                {!available && (
                  <span className="text-xs text-slate-500">
                    ({reserved ? unavailableReason : 'không khả dụng'})
                  </span>
                )}
              </label>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-sm">Không có tài xế khả dụng.</p>
      )}
    </fieldset>
  );
}
