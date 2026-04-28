/**
 * 截屏数据过滤和获取逻辑的单元测试
 */

// 测试获取选中行索引的逻辑
describe('截图数据过滤逻辑', () => {
  // 模拟获取选中行索引的函数
  function getSelectedRowIndices(rows: { checkbox: boolean }[]): number[] {
    const indices: number[] = [];
    rows.forEach((row, idx) => {
      if (row.checkbox) {
        indices.push(idx);
      }
    });
    return indices;
  }

  // 模拟根据选中行索引过滤数据的函数
  function filterRowsByIndices<T>(rows: T[], indices: number[]): T[] {
    return rows.filter((_, idx) => indices.includes(idx));
  }

  // 模拟获取选中行的表单数据
  function getSelectedRowsFormData(
    rows: { operation: string; amount: string; symbol: string }[],
    indices: number[]
  ): { operation: string; amount: string; symbol: string }[] {
    return indices.map(idx => rows[idx]).filter(Boolean);
  }

  describe('getSelectedRowIndices', () => {
    test('返回所有选中行的索引', () => {
      const rows = [
        { checkbox: false },
        { checkbox: true },
        { checkbox: false },
        { checkbox: true },
        { checkbox: true },
      ];
      const result = getSelectedRowIndices(rows);
      expect(result).toEqual([1, 3, 4]);
    });

    test('没有选中行时返回空数组', () => {
      const rows = [
        { checkbox: false },
        { checkbox: false },
      ];
      const result = getSelectedRowIndices(rows);
      expect(result).toEqual([]);
    });

    test('所有行选中时返回所有索引', () => {
      const rows = [
        { checkbox: true },
        { checkbox: true },
        { checkbox: true },
      ];
      const result = getSelectedRowIndices(rows);
      expect(result).toEqual([0, 1, 2]);
    });
  });

  describe('filterRowsByIndices', () => {
    test('根据索引过滤行数据', () => {
      const rows = ['row0', 'row1', 'row2', 'row3', 'row4'];
      const indices = [1, 3, 4];
      const result = filterRowsByIndices(rows, indices);
      expect(result).toEqual(['row1', 'row3', 'row4']);
    });

    test('空索引数组返回空结果', () => {
      const rows = ['row0', 'row1', 'row2'];
      const indices: number[] = [];
      const result = filterRowsByIndices(rows, indices);
      expect(result).toEqual([]);
    });

    test('索引超出范围时自动过滤无效索引', () => {
      const rows = ['row0', 'row1'];
      const indices = [0, 1, 5]; // 5超出范围
      const result = filterRowsByIndices(rows, indices);
      expect(result).toEqual(['row0', 'row1']);
    });
  });

  describe('getSelectedRowsFormData', () => {
    test('获取选中行的表单数据', () => {
      const rows = [
        { operation: '不操作', amount: '', symbol: '000001' },
        { operation: '买入', amount: '1000', symbol: '000002' },
        { operation: '卖出', amount: '500', symbol: '000003' },
        { operation: '买入', amount: '2000', symbol: '000004' },
      ];
      const indices = [1, 3];
      const result = getSelectedRowsFormData(rows, indices);
      expect(result).toEqual([
        { operation: '买入', amount: '1000', symbol: '000002' },
        { operation: '买入', amount: '2000', symbol: '000004' },
      ]);
    });

    test('获取选中行的买入卖出统计', () => {
      const rows = [
        { operation: '买入', amount: '1000', symbol: '000001' },
        { operation: '卖出', amount: '500', symbol: '000002' },
        { operation: '买入', amount: '2000', symbol: '000003' },
      ];
      const indices = [0, 1, 2];
      const selectedRows = getSelectedRowsFormData(rows, indices);

      // 计算买入卖出统计
      const buyCount = selectedRows.filter(r => r.operation === '买入').length;
      const sellCount = selectedRows.filter(r => r.operation === '卖出').length;
      const buyTotal = selectedRows
        .filter(r => r.operation === '买入')
        .reduce((sum, r) => sum + parseFloat(r.amount), 0);
      const sellTotal = selectedRows
        .filter(r => r.operation === '卖出')
        .reduce((sum, r) => sum + parseFloat(r.amount), 0);

      expect(buyCount).toBe(2);
      expect(sellCount).toBe(1);
      expect(buyTotal).toBe(3000);
      expect(sellTotal).toBe(500);
    });

    test('获取选中行的代码列表', () => {
      const rows = [
        { operation: '买入', amount: '1000', symbol: '000001' },
        { operation: '卖出', amount: '500', symbol: '000002' },
        { operation: '买入', amount: '2000', symbol: '000003' },
      ];
      const indices = [0, 2];
      const selectedRows = getSelectedRowsFormData(rows, indices);
      const codes = selectedRows.map(r => r.symbol);

      expect(codes).toEqual(['000001', '000003']);
    });
  });
});