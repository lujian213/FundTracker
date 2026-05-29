import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { TimerJobError } from '../types';

// 错误过期时间（毫秒）：5分钟
const ERROR_EXPIRY_MS = 5 * 60 * 1000;
// 每条错误最多显示次数
const MAX_DISPLAY_COUNT = 3;

interface TimerJobErrorContextValue {
  errors: TimerJobError[];
  addError: (error: Omit<TimerJobError, 'id' | 'time' | 'displayCount'>) => void;
  clearErrors: () => void;
  pruneErrors: () => void;  // 清除过期或超次的错误
  incrementDisplayCount: (id: string) => void;  // 增加显示次数
}

const TimerJobErrorContext = createContext<TimerJobErrorContextValue>({
  errors: [],
  addError: () => {},
  clearErrors: () => {},
  pruneErrors: () => {},
  incrementDisplayCount: () => {},
});

export const TimerJobErrorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [errors, setErrors] = useState<TimerJobError[]>([]);

  const addError = useCallback((error: Omit<TimerJobError, 'id' | 'time' | 'displayCount'>) => {
    const newError: TimerJobError = {
      ...error,
      id: crypto.randomUUID(),
      time: new Date(),
      displayCount: 0,
    };
    setErrors(prev => [newError, ...prev].slice(0, 5)); // Keep at most 5 errors
  }, []);

  const clearErrors = useCallback(() => setErrors([]), []);

  // 惰性清除：移除过期（超过5分钟）或超次（显示次数>=3）的错误
  const pruneErrors = useCallback(() => {
    const now = new Date();
    setErrors(prev => prev.filter(err => {
      const elapsedMs = now.getTime() - err.time.getTime();
      const isExpired = elapsedMs > ERROR_EXPIRY_MS;
      const isOverCount = err.displayCount >= MAX_DISPLAY_COUNT;
      return !isExpired && !isOverCount;
    }));
  }, []);

  // 增加指定错误的显示次数
  const incrementDisplayCount = useCallback((id: string) => {
    setErrors(prev => prev.map(err =>
      err.id === id ? { ...err, displayCount: err.displayCount + 1 } : err
    ));
  }, []);

  return (
    <TimerJobErrorContext.Provider value={{ errors, addError, clearErrors, pruneErrors, incrementDisplayCount }}>
      {children}
    </TimerJobErrorContext.Provider>
  );
};

export const useTimerJobErrors = () => useContext(TimerJobErrorContext);

export type { TimerJobError };