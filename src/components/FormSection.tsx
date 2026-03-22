import { motion } from 'motion/react';
import { ReactNode } from 'react';

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  step: number;
}

export function FormSection({ title, description, children, step }: FormSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: step * 0.1 }}
      className="mb-12"
    >
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h2>
        {description && <p className="mt-2 text-sm text-gray-500">{description}</p>}
      </div>
      <div className="space-y-6 bg-white p-6 sm:p-8 rounded-3xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-gray-100">
        {children}
      </div>
    </motion.div>
  );
}
