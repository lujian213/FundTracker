import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PositionCompareModal from '../../components/PositionCompareModal';
import { PositionCompareResult } from '../../types/positionExportTypes';

// Mock createPortal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (element: React.ReactElement) => element,
}));

describe('PositionCompareModal', () => {
  const mockCompareResult: PositionCompareResult = {
    items: [
      {
        symbol: '000001',
        name: '华夏成长混合',
        currentShares: 1000,
        currentValue: 1234,
        importedShares: 900,
        importedValue: 1100,
        sharesDiff: 100,
        valueDiff: 134,
        ratio: 111.11,
      },
      {
        symbol: '000002',
        name: '南方稳健成长',
        currentShares: 0,
        currentValue: 0,
        importedShares: 500,
        importedValue: 750,
        sharesDiff: -500,
        valueDiff: -750,
        ratio: null,
      },
    ],
    totalCurrentValue: 1234,
    totalImportedValue: 1850,
    totalValueDiff: -616,
    totalRatio: 66.81,
  };

  const mockOnClose = jest.fn();

  it('should render comparison modal with table', () => {
    render(<PositionCompareModal compareResult={mockCompareResult} onClose={mockOnClose} />);

    // Check title
    expect(screen.getByText('持仓对比')).toBeInTheDocument();

    // Check table headers
    expect(screen.getByText('基金名称')).toBeInTheDocument();
    expect(screen.getByText('持仓份额')).toBeInTheDocument();
    expect(screen.getByText('持仓价值')).toBeInTheDocument();
    expect(screen.getByText('对方份额')).toBeInTheDocument();
    expect(screen.getByText('对方价值')).toBeInTheDocument();
    expect(screen.getByText('份额差异')).toBeInTheDocument();
    expect(screen.getByText('价值差异')).toBeInTheDocument();
    expect(screen.getByText('比例')).toBeInTheDocument();
  });

  it('should format 0 values as "-"', () => {
    render(<PositionCompareModal compareResult={mockCompareResult} onClose={mockOnClose} />);

    // 000002 has currentShares = 0, should display "-"
    const rows = screen.getAllByRole('row');
    const row002 = rows[2]; // Second data row

    // Find cells in row
    const cells = row002.querySelectorAll('td');
    expect(cells[1].textContent).toBe('-'); // 持仓份额
    expect(cells[2].textContent).toBe('-'); // 持仓价值
  });

  it('should format numbers with fmtMoney', () => {
    render(<PositionCompareModal compareResult={mockCompareResult} onClose={mockOnClose} />);

    // 000001 currentShares = 1000, should be formatted
    const rows = screen.getAllByRole('row');
    const row001 = rows[1]; // First data row

    const cells = row001.querySelectorAll('td');
    // sharesDiff = 100, formatted as "100.00"
    expect(cells[5].textContent).toMatch(/100\.00/);
  });

  it('should format ratio as percentage with 2 decimals', () => {
    render(<PositionCompareModal compareResult={mockCompareResult} onClose={mockOnClose} />);

    const rows = screen.getAllByRole('row');
    const row001 = rows[1];
    const cells = row001.querySelectorAll('td');

    // ratio = 111.11, display as "111.11%"
    expect(cells[7].textContent).toBe('111.11%');
  });

  it('should display "-" for null ratio', () => {
    render(<PositionCompareModal compareResult={mockCompareResult} onClose={mockOnClose} />);

    const rows = screen.getAllByRole('row');
    const row002 = rows[2];
    const cells = row002.querySelectorAll('td');

    // ratio = null, display "-"
    expect(cells[7].textContent).toBe('-');
  });

  it('should display fund name with tooltip', () => {
    render(<PositionCompareModal compareResult={mockCompareResult} onClose={mockOnClose} />);

    // Fund name format: "华夏成长混合（000001）"
    expect(screen.getByText(/华夏成长混合（000001）/)).toBeInTheDocument();
  });

  it('should display totals row', () => {
    render(<PositionCompareModal compareResult={mockCompareResult} onClose={mockOnClose} />);

    // Total row: "总计：2条记录"
    expect(screen.getByText(/总计：2条记录/)).toBeInTheDocument();
  });

  it('should calculate total ratio correctly', () => {
    render(<PositionCompareModal compareResult={mockCompareResult} onClose={mockOnClose} />);

    // tfoot is the third rowgroup (after thead and tbody)
    const tfoot = screen.getAllByRole('rowgroup')[2]; // tfoot
    const totalRow = tfoot.querySelector('tr');
    const cells = totalRow!.querySelectorAll('td');

    // totalRatio = 66.81, display "66.81%"
    expect(cells[7].textContent).toBe('66.81%');
  });
});