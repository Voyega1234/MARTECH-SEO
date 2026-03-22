import React from 'react';
import { motion } from 'motion/react';

interface Option {
  label: string;
  value: string;
}

interface RadioGroupProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({ options, value, onChange }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative flex items-center px-3 py-2.5 rounded-lg border text-left transition-all duration-200 ${
              isSelected
                ? 'border-[#3a4eff] bg-[#3a4eff]/5 text-[#3a4eff]'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className={`w-4 h-4 rounded-full border-2 mr-2.5 flex items-center justify-center transition-colors ${
              isSelected ? 'border-[#3a4eff]' : 'border-gray-300'
            }`}>
              {isSelected && (
                <motion.div
                  layoutId={`radio-fill-${option.value}`}
                  className="w-2 h-2 rounded-full bg-[#3a4eff]"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </div>
            <span className={`text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
