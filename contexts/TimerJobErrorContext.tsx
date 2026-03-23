import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { TimerJobError } from '../types';

interface TimerJobErrorContextValue {
  errors: TimerJobError[];
  addError: (error: Omit<TimerJobError, 'id' | 'time'>) => void;
  clearErrors: () => void;
}

const TimerJobErrorContext = createContext<TimerJobErrorContextValue>({
  errors: [],
  addError: () => {},
  clearErrors: () => {},
});

export const TimerJobErrorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [errors, setErrors] = useState<TimerJobError[]>([]);

  const addError = useCallback((error: Omit<TimerJobError, 'id' | 'time'>) => {
    const newError: TimerJobError = {
      ...error,
      id: crypto.randomUUID(),
      time: new Date(),
    };
    setErrors(prev => [newError, ...prev].slice(0, 5)); // Keep at most 5 errors
  }, []);

  const clearErrors = useCallback(() => setErrors([]), []);

  return (
    <TimerJobErrorContext.Provider value={{ errors, addError, clearErrors }}>
      {children}
    </TimerJobErrorContext.Provider>
  );
};

export const useTimerJobErrors = () => useContext(TimerJobErrorContext);

export type { TimerJobError };