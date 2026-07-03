import React from 'react';
import { createPortal } from 'react-dom';
import { useModalBodyStyle } from '../hooks/useModalBodyStyle';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'info' | 'success';
  singleButton?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = '确认删除',
  cancelText = '取消',
  type = 'danger',
  singleButton = false
}) => {
  useModalBodyStyle(isOpen);
  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter') onConfirm();
  };

  return createPortal(
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      ></div>

      {/* Dialog Body */}
      <div className="relative bg-white rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-4 ${type === 'danger' ? 'bg-red-50 text-red-600' : type === 'success' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
            <i className={`fas ${type === 'danger' ? 'fa-trash-can' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle'} text-xl`}></i>
          </div>
          <h3 id="confirm-title" className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        </div>

        <div className="flex border-t border-gray-100">
          {singleButton ? (
            <button
              onClick={onConfirm}
              className={`flex-1 py-4 text-sm font-bold transition-colors ${type === 'danger' ? 'text-red-600 hover:bg-red-50' : type === 'success' ? 'text-green-600 hover:bg-green-50' : 'text-blue-600 hover:bg-blue-50'}`}
              aria-label="确认"
            >
              {confirmText}
            </button>
          ) : (
            <>
              <button
                onClick={onCancel}
                className="flex-1 py-4 text-sm font-bold text-gray-400 hover:bg-gray-50 transition-colors"
                aria-label="取消"
              >
                {cancelText}
              </button>
              <div className="w-px bg-gray-100"></div>
              <button
                onClick={onConfirm}
                className={`flex-1 py-4 text-sm font-bold transition-colors ${type === 'danger' ? 'text-red-600 hover:bg-red-50' : type === 'success' ? 'text-green-600 hover:bg-green-50' : 'text-blue-600 hover:bg-blue-50'}`}
                aria-label="确认"
              >
                {confirmText}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
