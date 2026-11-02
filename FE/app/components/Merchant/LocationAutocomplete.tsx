import { useId, useState } from 'react';
import { provinceOptions } from '@/utils/province-options';
import { formControlClassName, formLabelClassName } from '@/utils/form-styles';

interface LocationAutocompleteProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLocaleLowerCase('vi');

export default function LocationAutocomplete({
  label,
  value,
  placeholder,
  onChange,
}: LocationAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputId = useId();
  const listId = useId();
  const query = normalizeSearchText(value.trim());
  const filteredOptions = provinceOptions
    .filter((location) => normalizeSearchText(location).includes(query))
    .slice(0, 8);

  return (
    <div className="relative">
      <label htmlFor={inputId} className={formLabelClassName}>
        {label}
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && filteredOptions.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && filteredOptions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (!filteredOptions.length) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => (index + 1) % filteredOptions.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => (index - 1 + filteredOptions.length) % filteredOptions.length);
            } else if (event.key === 'Enter' && open) {
              event.preventDefault();
              const location = filteredOptions[activeIndex];
              if (location) {
                onChange(location);
                setOpen(false);
              }
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          maxLength={100}
          className={`${formControlClassName} mt-1`}
          placeholder={placeholder}
        />
      </label>
      {open && filteredOptions.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filteredOptions.map((location, index) => (
            <button
              key={location}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={value === location}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(location);
                setActiveIndex(index);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 ${index === activeIndex ? 'bg-blue-50' : ''}`}
            >
              {location}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
