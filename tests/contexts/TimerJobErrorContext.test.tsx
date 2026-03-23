import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimerJobErrorProvider, useTimerJobErrors, TimerJobError } from '../../contexts/TimerJobErrorContext';

// Test component to access context
const TestComponent: React.FC<{ onError?: () => void }> = ({ onError }) => {
  const { errors, addError, clearErrors } = useTimerJobErrors();

  const handleAddError = () => {
    addError({ jobName: 'TestJob', message: 'Test error message' });
    onError?.();
  };

  return (
    <div>
      <button onClick={handleAddError} data-testid="add-error">Add Error</button>
      <button onClick={clearErrors} data-testid="clear-errors">Clear Errors</button>
      <ul data-testid="error-list">
        {errors.map((e: TimerJobError) => (
          <li key={e.id} data-testid={`error-${e.id}`}>
            {e.jobName}: {e.message}
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

  test('addError adds an error to the list', () => {
    render(
      <TimerJobErrorProvider>
        <TestComponent />
      </TimerJobErrorProvider>
    );

    fireEvent.click(screen.getByTestId('add-error'));

    expect(screen.getByText('TestJob: Test error message')).toBeInTheDocument();
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
});