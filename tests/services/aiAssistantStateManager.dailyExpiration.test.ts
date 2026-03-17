import { aiAssistantStateManager } from '../../services/aiAssistantStateManager';

describe('AIAssistantStateManager Daily Expiration Test', () => {
  const fundSymbol = 'TEST001';

  beforeEach(() => {
    // Clean up state before each test
    aiAssistantStateManager.clearState(fundSymbol);
  });

  test('should track initialization date properly', () => {
    const initialDate = new Date(2026, 2, 17); // March 17, 2026
    const newState = {
      messages: [{ id: 'test', content: 'test', role: 'user', timestamp: new Date() }],
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: initialDate
    };

    aiAssistantStateManager.setState(fundSymbol, newState);

    const retrievedState = aiAssistantStateManager.getState(fundSymbol);
    expect(retrievedState).not.toBeNull();
    expect(retrievedState?.initializationDate).toEqual(initialDate);
  });

  test('should return false for isInitializedToday when not initialized today', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Set state with yesterday's initialization date
    const state = {
      messages: [{ id: 'test', content: 'test', role: 'user', timestamp: new Date() }],
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: yesterday
    };

    aiAssistantStateManager.setState(fundSymbol, state);

    // Check if initialized today (should be false since it was initialized yesterday)
    const isInitializedToday = aiAssistantStateManager.isInitializedToday(fundSymbol);
    expect(isInitializedToday).toBe(false);
  });

  test('should return true for isInitializedToday when initialized today', () => {
    // Set state with today's initialization date
    const state = {
      messages: [{ id: 'test', content: 'test', role: 'user', timestamp: new Date() }],
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: new Date() // Today's date
    };

    aiAssistantStateManager.setState(fundSymbol, state);

    // Check if initialized today (should be true since it was initialized today)
    const isInitializedToday = aiAssistantStateManager.isInitializedToday(fundSymbol);
    expect(isInitializedToday).toBe(true);
  });

  test('should return false for isInitializedToday when initialized in future', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Set state with tomorrow's initialization date
    const state = {
      messages: [{ id: 'test', content: 'test', role: 'user', timestamp: new Date() }],
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: tomorrow
    };

    aiAssistantStateManager.setState(fundSymbol, state);

    // Check if initialized today (should be false since it was "initialized" in future)
    const isInitializedToday = aiAssistantStateManager.isInitializedToday(fundSymbol);
    expect(isInitializedToday).toBe(false);
  });

  test('should handle different months and years properly', () => {
    // Set state with initialization date from different month
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const state = {
      messages: [{ id: 'test', content: 'test', role: 'user', timestamp: new Date() }],
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: lastMonth
    };

    aiAssistantStateManager.setState(fundSymbol, state);

    // Check if initialized today (should be false since it was initialized in different month)
    const isInitializedToday = aiAssistantStateManager.isInitializedToday(fundSymbol);
    expect(isInitializedToday).toBe(false);
  });

  test('should handle leap year and same day different year', () => {
    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1);

    const state = {
      messages: [{ id: 'test', content: 'test', role: 'user', timestamp: new Date() }],
      hasBeenInitialized: true,
      lastAccessed: new Date(),
      initializationDate: lastYear
    };

    aiAssistantStateManager.setState(fundSymbol, state);

    // Check if initialized today (should be false since it was initialized in different year)
    const isInitializedToday = aiAssistantStateManager.isInitializedToday(fundSymbol);
    expect(isInitializedToday).toBe(false);
  });
});