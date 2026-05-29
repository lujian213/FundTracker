import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TimerJobErrorProvider, useTimerJobErrors, TimerJobError } from '../../contexts/TimerJobErrorContext';

// Test component to access context
const TestComponent: React.FC<{ onError?: () => void }> = ({ onError }) => {
  const { errors, addError, clearErrors, pruneErrors, incrementDisplayCount } = useTimerJobErrors();

  const handleAddError = () => {
    addError({ jobName: 'TestJob', message: 'Test error message' });
    onError?.();
  };

  return (
    <div>
      <button onClick={handleAddError} data-testid="add-error">Add Error</button>
      <button onClick={clearErrors} data-testid="clear-errors">Clear Errors</button>
      <button onClick={pruneErrors} data-testid="prune-errors">Prune Errors</button>
      {errors.length > 0 && (
        <button onClick={() => incrementDisplayCount(errors[0].id)} data-testid="increment-first">
          Increment First
        </button>
      )}
      <ul data-testid="error-list">
        {errors.map((e: TimerJobError) => (
          <li key={e.id} data-testid={`error-${e.id}`}>
            {e.jobName}: {e.message} (count: {e.displayCount})
          </li>
        ))}
      </ul>
    </div>
  );
};

describe('TimerJobErrorContext', () => {
  test('starts with empty errors', () => {
    render(
      <TimerJobErrorProvider>
        <TestComponent />
      </TimerJobErrorProvider>
    );

    expect(screen.getByTestId('error-list').children.length).toBe(0);
  });

  test('addError adds an error with displayCount 0', () => {
    render(
      <TimerJobErrorProvider>
        <TestComponent />
      </TimerJobErrorProvider>
    );

    fireEvent.click(screen.getByTestId('add-error'));

    expect(screen.getByText(/TestJob: Test error message \(count: 0\)/)).toBeInTheDocument();
  });

  test('clearErrors removes all errors', () => {
    render(
      <TimerJobErrorProvider>
        <TestComponent />
      </TimerJobErrorProvider>
    );

    fireEvent.click(screen.getByTestId('add-error'));
    expect(screen.getByTestId('error-list').children.length).toBe(1);

    fireEvent.click(screen.getByTestId('clear-errors'));
    expect(screen.getByTestId('error-list').children.length).toBe(0);
  });

  test('keeps at most 5 errors', () => {
    render(
      <TimerJobErrorProvider>
        <TestComponent />
      </TimerJobErrorProvider>
    );

    // Add 7 errors
    for (let i = 0; i < 7; i++) {
      fireEvent.click(screen.getByTestId('add-error'));
    }

    // Should only keep 5
    expect(screen.getByTestId('error-list').children.length).toBe(5);
  });

  test('incrementDisplayCount increases display count', () => {
    render(
      <TimerJobErrorProvider>
        <TestComponent />
      </TimerJobErrorProvider>
    );

    fireEvent.click(screen.getByTestId('add-error'));
    expect(screen.getByText(/count: 0/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('increment-first'));
    expect(screen.getByText(/count: 1/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('increment-first'));
    expect(screen.getByText(/count: 2/)).toBeInTheDocument();
  });

  test('pruneErrors removes errors with displayCount >= 3', () => {
    render(
      <TimerJobErrorProvider>
        <TestComponent />
      </TimerJobErrorProvider>
    );

    fireEvent.click(screen.getByTestId('add-error'));
    expect(screen.getByTestId('error-list').children.length).toBe(1);

    // Increment to 3
    fireEvent.click(screen.getByTestId('increment-first'));
    fireEvent.click(screen.getByTestId('increment-first'));
    fireEvent.click(screen.getByTestId('increment-first'));
    expect(screen.getByText(/count: 3/)).toBeInTheDocument();

    // Prune should remove it
    fireEvent.click(screen.getByTestId('prune-errors'));
    expect(screen.getByTestId('error-list').children.length).toBe(0);
  });

  test('pruneErrors removes errors older than 5 minutes', async () => {
    // 使用 jest.useFakeTimers 来模拟时间流逝
    jest.useFakeTimers();

    render(
      <TimerJobErrorProvider>
        <TestComponent />
      </TimerJobErrorProvider>
    );

    fireEvent.click(screen.getByTestId('add-error'));
    expect(screen.getByTestId('error-list').children.length).toBe(1);

    // 快进 6 分钟（超过 5 分钟过期时间）
    act(() => {
      jest.advanceTimersByTime(6 * 60 * 1000);
    });

    // Prune should remove expired error
    fireEvent.click(screen.getByTestId('prune-errors'));
    expect(screen.getByTestId('error-list').children.length).toBe(0);

    jest.useRealTimers();
  });
});