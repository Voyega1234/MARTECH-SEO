import { InputHTMLAttributes, forwardRef } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:border-[#3a4eff] focus:ring-2 focus:ring-[#3a4eff]/20 transition-all duration-200 outline-none text-sm ${className}`}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
