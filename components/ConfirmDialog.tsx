
import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = '确认删除',
  cancelText = '取消',
  type = 'danger'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      ></div>

      {/* Dialog Body */}
      <div className="relative bg-white rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-4 ${type === 'danger' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            <i className={`fas ${type === 'danger' ? 'fa-trash-can' : 'fa-info-circle'} text-xl`}></i>
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>

        <div className="flex border-t border-gray-100">
          <button
            onClick={onCancel}
            className="flex-1 py-4 text-sm font-bold text-gray-400 hover:bg-gray-50 transition-colors"
          >
            {cancelText}
          </button>
          <div className="w-px bg-gray-100"></div>
          <button
            onClick={onConfirm}
            className={`flex-1 py-4 text-sm font-bold transition-colors ${type === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-blue-600 hover:bg-blue-50'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
