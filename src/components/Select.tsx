import React from 'react';
import { Check } from 'lucide-react';

interface Option {
  label: string;
  value: string;
}

interface SelectProps {
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({ options, value = [], onChange, className = '' }) => {
  const toggleOption = (optValue: string) => {
    const newValue = Array.isArray(value) ? [...value] : [];
    if (newValue.includes(optValue)) {
      onChange(newValue.filter(v => v !== optValue));
    } else {
      onChange([...newValue, optValue]);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {options.map((option) => {
        const isSelected = Array.isArray(value) && value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggleOption(option.value)}
            className={`w-full flex items-center px-4 py-3 rounded-xl border text-left transition-all duration-200 ${
              isSelected
                ? 'border-gray-200 bg-white'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className={`w-5 h-5 rounded flex-shrink-0 mr-3 flex items-center justify-center transition-colors ${
              isSelected ? 'bg-[#10B981] border-[#10B981]' : 'border-2 border-gray-200 bg-white'
            }`}>
              {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
            </div>
            <span className={`text-base font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
