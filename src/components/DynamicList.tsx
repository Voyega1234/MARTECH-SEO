import { Plus, X } from 'lucide-react';
import React, { useState } from 'react';
import { Input } from './Input';

interface DynamicListProps {
  placeholder?: string;
  items: string[];
  onChange: (items: string[]) => void;
}

export function DynamicList({ placeholder, items, onChange }: DynamicListProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      onChange([...items, inputValue.trim()]);
      setInputValue('');
    }
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 group hover:border-[#3a4eff] transition-colors">
          <span className="flex-1 text-gray-900 text-sm">{item}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleRemove(index); }}
            className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-gray-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleAdd(); }}
          disabled={!inputValue.trim()}
          className="p-2 bg-[#3a4eff]/10 text-[#3a4eff] rounded-lg hover:bg-[#3a4eff]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
