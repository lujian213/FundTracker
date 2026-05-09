import { addInvestRecords, updateInvestRecord, deleteInvestRecords } from '../../services/eggfundService';
import { EggfundInvestRecord } from '../../types/syncTypes';

// Mock fetch
global.fetch = jest.fn();

describe('eggfundService.reverse - addInvestRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully add investment records', async () => {
    const mockResponse = { ok: true };
    (fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const records: EggfundInvestRecord[] = [
      {
        day: '2024-01-01',
        type: 'trade',
        id: '',
        code: '123456',
        share: 100.00,
        unitPrice: -1,
        totalSpend: 0,
        fee: 0.50,
        tax: 0,
        fxRate: 1.0,
        userIndex: 0,
        enabled: true,
        batch: 0,
        comments: 'sync from FundTracker',
        amount: 0,
        misMatchAlert: true
      }
    ];

    await addInvestRecords('testuser', 'testpass', records);

    expect(fetch).toHaveBeenCalledWith(
      'https://eggfund.website/api/invest/testuser',
      {
        method: 'PUT',
        headers: {
          'Accept': 'application/json',
          'Authorization': expect.stringContaining('Basic'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(records)
      }
    );
  });

  it('should throw error when authentication fails (401)', async () => {
    const mockResponse = { ok: false, status: 401, statusText: 'Unauthorized' };
    (fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const records: EggfundInvestRecord[] = [
      {
        day: '2024-01-01',
        type: 'trade',
        id: '',
        code: '123456',
        share: 100,
        unitPrice: -1,
        totalSpend: 0,
        fee: 0,
        tax: 0,
        fxRate: 1.0,
        userIndex: 0,
        enabled: true,
        batch: 0,
        comments: 'sync from FundTracker',
        amount: 0,
        misMatchAlert: true
      }
    ];

    await expect(addInvestRecords('testuser', 'wrongpass', records))
      .rejects.toThrow('认证失败：用户名或密码错误');
  });

  it('should throw error when network fails', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new TypeError('fetch failed'));

    const records: EggfundInvestRecord[] = [];

    await expect(addInvestRecords('testuser', 'testpass', records))
      .rejects.toThrow('网络连接失败，请检查网络');
  });
});

describe('eggfundService.reverse - updateInvestRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully update an investment record', async () => {
    const mockResponse = { ok: true };
    (fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const record: EggfundInvestRecord = {
      day: '2024-01-01',
      type: 'trade',
      id: 'Lu-123456-abc',
      code: '123456',
      share: 150.00,
      unitPrice: -1,
      totalSpend: 0,
      fee: 1.00,
      tax: 0,
      fxRate: 1.0,
      userIndex: 0,
      enabled: true,
      batch: 0,
      comments: 'sync from FundTracker',
      amount: 0,
      misMatchAlert: true
    };

    await updateInvestRecord('testuser', 'testpass', record);

    expect(fetch).toHaveBeenCalledWith(
      'https://eggfund.website/api/invest/testuser',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': expect.stringContaining('Basic'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(record)
      }
    );
  });

  it('should throw error when authentication fails (401)', async () => {
    const mockResponse = { ok: false, status: 401, statusText: 'Unauthorized' };
    (fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const record: EggfundInvestRecord = {
      day: '2024-01-01',
      type: 'trade',
      id: 'Lu-123456-abc',
      code: '123456',
      share: 150,
      unitPrice: -1,
      totalSpend: 0,
      fee: 0,
      tax: 0,
      fxRate: 1.0,
      userIndex: 0,
      enabled: true,
      batch: 0,
      comments: 'sync from FundTracker',
      amount: 0,
      misMatchAlert: true
    };

    await expect(updateInvestRecord('testuser', 'wrongpass', record))
      .rejects.toThrow('认证失败：用户名或密码错误');
  });

  it('should throw error when network fails', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new TypeError('fetch failed'));

    const record: EggfundInvestRecord = {
      day: '2024-01-01',
      type: 'trade',
      id: 'Lu-123456-abc',
      code: '123456',
      share: 100,
      unitPrice: -1,
      totalSpend: 0,
      fee: 0,
      tax: 0,
      fxRate: 1.0,
      userIndex: 0,
      enabled: true,
      batch: 0,
      comments: 'sync from FundTracker',
      amount: 0,
      misMatchAlert: true
    };

    await expect(updateInvestRecord('testuser', 'testpass', record))
      .rejects.toThrow('网络连接失败，请检查网络');
  });
});

describe('eggfundService.reverse - deleteInvestRecords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully delete multiple investment records', async () => {
    const mockResponse = { ok: true };
    (fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const investIds = ['Lu-123456-abc', 'Lu-123456-def'];

    await deleteInvestRecords('testuser', 'testpass', investIds);

    expect(fetch).toHaveBeenCalledWith(
      'https://eggfund.website/api/invest/testuser?investIds=Lu-123456-abc&investIds=Lu-123456-def',
      {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'Authorization': expect.stringContaining('Basic')
        }
      }
    );
  });

  it('should handle authentication failure', async () => {
    const mockResponse = { ok: false, status: 401, statusText: 'Unauthorized' };
    (fetch as jest.Mock).mockResolvedValueOnce(mockResponse);

    const investIds = ['Lu-123456-abc'];

    await expect(deleteInvestRecords('testuser', 'wrongpass', investIds))
      .rejects.toThrow('认证失败：用户名或密码错误');
  });

  it('should throw error when network fails', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new TypeError('fetch failed'));

    const investIds = ['Lu-123456-abc'];

    await expect(deleteInvestRecords('testuser', 'testpass', investIds))
      .rejects.toThrow('网络连接失败，请检查网络');
  });
});