import { TextareaHTMLAttributes, forwardRef } from 'react';

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:border-[#3a4eff] focus:ring-2 focus:ring-[#3a4eff]/20 transition-all duration-200 outline-none resize-y min-h-[80px] text-sm ${className}`}
        {...props}
      />
    );
  }
);
TextArea.displayName = 'TextArea';
