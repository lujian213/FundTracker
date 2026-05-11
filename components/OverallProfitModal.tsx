import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { computeOverallProfit } from '../services/fundService';
import { OverallProfitSummary, OverallProfitPoint, OverallFundRow } from '../types';
import { toLocalDateKey } from '../utils/priceResolver';
import { OVERALL_PROFIT_DATE_PRESETS, getOverallProfitPresetRange, OverallProfitDatePresetKey } from '../utils/overallProfitDatePresets';
import { formatMoney, formatMoneyWithSeparators } from '../utils/format';
import { formatDateDisplay } from '../utils/dateFormat';
import { buildLinearPath, CHART_DIMENSIONS, mergeChartPoints, ChartPointWithData } from '../utils/chartUtils';
import { MoneyCell } from './MoneyCell';

interface Props {
  symbols?: string[];
  onClose: () => void;
  onSelectFund?: (symbol: string) => void;
}

type ViewMode = 'chart' | 'calendar';
type CalendarMode = 'day' | 'month' | 'year';

const OverallProfitModal: React.FC<Props> = ({ symbols, onClose, onSelectFund }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<OverallProfitSummary | null>(null);
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // 图表 x 轴起始日期（= defaultFrom，即持仓最早 startDate），与表格日期选择器分离
  const [chartFromDate, setChartFromDate] = useState<string | null>(null);
  // 视图模式：图表或日历
  const [viewMode, setViewMode] = useState<ViewMode>('chart');
  // 日历模式：日、月、年
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('day');
  // 日历当前显示的年月
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth() + 1);

  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const chartSvgRef = useRef<SVGSVGElement | null>(null);
  const prevViewModeRef = useRef<ViewMode>(viewMode);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        // 一次计算：获取完整时间线，用于图表和表格
        const base = await computeOverallProfit({ symbols });
        if (!mounted) return;

        // 确定 defaultTo（日期2）：时间轴最后一天
        const defaultTo = base.timeline && base.timeline.length > 0 ? base.timeline[base.timeline.length - 1].date : null;

        // 确定 defaultFrom（日期1）：defaultTo 的前一天
        let defaultFrom: string | null = null;
        if (defaultTo) {
          const toDate = new Date(defaultTo);
          toDate.setDate(toDate.getDate() - 1);
          defaultFrom = toLocalDateKey(toDate);
        }

        setFromDate(defaultFrom);
        setToDate(defaultTo);
        // 记录图表 x 轴起始日期，用于裁剪 chartTimeline（与表格日期选择器分离）
        // 使用所有基金持仓开始日期（startDate）的最小值作为图表 x 轴起点
        const allStartDates = (base.perFund || []).map(f => f.startDate).filter((d): d is string => !!d);
        const minStartDate = allStartDates.length > 0 ? allStartDates.reduce((a, b) => (a < b ? a : b)) : null;
        // 若无任何基金配置持仓开始日期，chartFromDate 保持 null，UI 将显示空状态提示
        setChartFromDate(minStartDate);

        // 直接使用第一次计算的完整结果，无需第二次请求
        // 表格行裁剪由下方的 useEffect（依赖 fromDate/toDate）负责
        setSummary(base);
      } catch (e: any) {
        setError(e?.message || '计算整体盈亏失败');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();
    return () => { mounted = false; };
  }, [symbols]);

  // NOTE: do not re-run full computation when fromDate/toDate change. We keep the chart's x-axis fixed
  // to the full summary.timeline and only use fromDate/toDate to filter table rows built from precomputed perFundTimelines.
  // This avoids expensive recomputations on every picker change.
  useEffect(() => {
    // nothing here intentionally
  }, []);

  // Chart timeline: 从 chartFromDate 开始裁剪，确保 x 轴从持仓起始日期开始，不显示更早的历史数据
  const chartTimeline = useMemo(() => {
    if (!summary) return [] as OverallProfitPoint[];
    if (!chartFromDate) return summary.timeline;
    return summary.timeline.filter(p => p.date >= chartFromDate);
  }, [summary, chartFromDate]);

  const chart = useMemo(() => {
    const pts = chartTimeline;
    if (!pts || pts.length === 0) return { path: '', areaPath: '', points: [], originalPoints: [], xTicks: [], yTicks: [], width: CHART_DIMENSIONS.width, height: CHART_DIMENSIONS.height, padLeft: CHART_DIMENSIONS.padLeft, padRight: CHART_DIMENSIONS.padRight, zeroY: 100 };
    const { width: w, height: h, padLeft, padRight, padTop, padBottom } = CHART_DIMENSIONS;
    const vals = pts.map(p => p.cumulativeProfit || 0);
    const dataMin = Math.min(...vals);
    const dataMax = Math.max(...vals);

    // Y轴范围必须包含0，且边界对齐到10000的倍数
    const yAxisMin = dataMin >= 0 ? 0 : Math.floor(dataMin / 10000) * 10000;
    const yAxisMax = dataMax <= 0 ? 0 : Math.ceil(dataMax / 10000) * 10000;

    // 确保有足够的范围（至少20000，避免只有0刻度的情况）
    const finalMin = yAxisMax === 0 ? Math.min(yAxisMin, -10000) : yAxisMin;
    const finalMax = yAxisMin === 0 ? Math.max(yAxisMax, 10000) : yAxisMax;

    const range = finalMax - finalMin || 1;

    // 根据范围选择合适的间隔（10000的倍数），使刻度数量在3-6个之间
    const targetTicks = 5;
    let tickInterval = 10000;
    const possibleIntervals = [10000, 20000, 50000, 100000, 200000, 500000];
    for (const interval of possibleIntervals) {
      const tickCount = Math.ceil(range / interval) + 1;
      if (tickCount <= targetTicks) {
        tickInterval = interval;
        break;
      }
    }

    // X坐标计算基于索引（时间均匀分布）
    const getX = (i: number, total: number) => padLeft + (i * (w - padLeft - padRight) / (total - 1 || 1));
    const getY = (v: number) => h - padBottom - ((v - finalMin) / range) * (h - padTop - padBottom);
    const zeroY = getY(0);

    // 创建原始点数组（用于 hover 检测）
    const originalPts: ChartPointWithData[] = pts.map((p, i) => ({
      x: getX(i, pts.length),
      y: getY(p.cumulativeProfit || 0),
      data: { date: p.date, dailyProfit: p.dailyProfit || 0, cumulativeProfit: p.cumulativeProfit || 0 }
    }));

    // 合并点用于显示（保持视觉清晰）
    const mergedPts = mergeChartPoints(originalPts);

    // 重新计算合并点的 X 坐标（基于合并后的数量）
    const displayPts = mergedPts.map((p, i) => ({
      ...p,
      x: getX(i, mergedPts.length)
    }));

    const path = buildLinearPath(displayPts, { chartHeight: h, paddingBottom: padBottom });
    const areaPath = buildLinearPath(displayPts, { closePath: true, chartHeight: h, paddingBottom: padBottom });
    const xTicks = [0, Math.floor((displayPts.length - 1) / 2), displayPts.length - 1].map(i => ({
      x: displayPts[i].x,
      label: formatDateDisplay(displayPts[i].data.date)
    }));

    // Y轴刻度：从finalMin到finalMax，步长为tickInterval
    const yTicks: { y: number; label: string; isZero: boolean }[] = [];
    const firstTick = Math.ceil(finalMin / tickInterval) * tickInterval;
    for (let v = firstTick; v <= finalMax; v += tickInterval) {
      yTicks.push({ y: getY(v), label: (v >= 0 ? '+' : '') + v, isZero: v === 0 });
    }

    return {
      path,
      areaPath,
      points: displayPts,        // 合并后的点，用于显示折线和圆点
      originalPoints: originalPts, // 原始点，用于 hover 检测
      xTicks,
      yTicks,
      padLeft,
      padRight,
      padTop,
      padBottom,
      width: w,
      height: h,
      zeroY,
      mergedCount: mergedPts.length,
      originalCount: originalPts.length
    };
  }, [chartTimeline]);

  const handlePointClick = useCallback((idx: number) => {
    if (!chartTimeline || chartTimeline.length === 0) return;
    const current = chartTimeline[idx];
    if (!current) return;
    const prevDate = idx > 0
      ? chartTimeline[idx - 1].date
      : (() => {
          const d = new Date(current.date);
          d.setDate(d.getDate() - 1);
          return toLocalDateKey(d);
        })();
    setFromDate(prevDate);
    setToDate(current.date);
  }, [chartTimeline]);

  const [tableRows, setTableRows] = useState<OverallFundRow[]>([]);
  const [tableError, setTableError] = useState<string | null>(null);
  // 表格列排序：三列共用一个排序状态，点击某列时该列启用排序
  // sortColumn: 当前排序的列 ('from' | 'to' | 'diff')
  // sortOrder: 排序方向 ('none' | 'asc' | 'desc')
  const [sortColumn, setSortColumn] = useState<'from' | 'to' | 'diff'>('diff');
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('desc');

  const chartEndDate = useMemo(() => {
    if (!summary || !summary.timeline || summary.timeline.length === 0) return null;
    return summary.timeline[summary.timeline.length - 1].date;
  }, [summary]);

  // 日历数据：从 chartTimeline 构建 date -> dailyProfit 的映射
  const dailyProfitMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!chartTimeline) return map;
    for (const point of chartTimeline) {
      map[point.date] = point.dailyProfit || 0;
    }
    return map;
  }, [chartTimeline]);

  // 日历专用数据：期间累计起始日期的当日盈利设为 0（不影响其他计算）
  const calendarProfitMap = useMemo(() => {
    const map: Record<string, number> = { ...dailyProfitMap };
    if (chartFromDate && map.hasOwnProperty(chartFromDate)) {
      map[chartFromDate] = 0;
    }
    return map;
  }, [dailyProfitMap, chartFromDate]);

  // 日历导航范围：最早和最晚可显示的年月
  const calendarRange = useMemo(() => {
    if (!chartFromDate || !chartEndDate) return null;
    const startDate = new Date(chartFromDate);
    const endDate = new Date(chartEndDate);
    return {
      minYear: startDate.getFullYear(),
      minMonth: startDate.getMonth() + 1,
      maxYear: endDate.getFullYear(),
      maxMonth: endDate.getMonth() + 1
    };
  }, [chartFromDate, chartEndDate]);

  // 初始化日历到结束日期所在的月份
  useEffect(() => {
    if (chartEndDate) {
      const d = new Date(chartEndDate);
      setCalendarYear(d.getFullYear());
      setCalendarMonth(d.getMonth() + 1);
    }
  }, [chartEndDate]);

  // 切换到日历模式或切换日历子模式时，重置为默认值
  useEffect(() => {
    if (viewMode === 'calendar' && chartEndDate) {
      const d = new Date(chartEndDate);
      const isSwitchingFromChart = prevViewModeRef.current === 'chart';
      prevViewModeRef.current = viewMode;

      // 从图表切换到日历模式时，重置子模式为"日"
      if (isSwitchingFromChart) {
        setCalendarMode('day');
      }
      // 重置年份和月份
      setCalendarYear(d.getFullYear());
      setCalendarMonth(d.getMonth() + 1);
    } else {
      prevViewModeRef.current = viewMode;
    }
  }, [viewMode, calendarMode, chartEndDate]);

  // 日历导航按钮是否可用
  const canGoPrevMonth = useMemo(() => {
    if (!calendarRange) return false;
    if (calendarYear > calendarRange.minYear) return true;
    if (calendarYear === calendarRange.minYear && calendarMonth > calendarRange.minMonth) return true;
    return false;
  }, [calendarYear, calendarMonth, calendarRange]);

  const canGoNextMonth = useMemo(() => {
    if (!calendarRange) return false;
    if (calendarYear < calendarRange.maxYear) return true;
    if (calendarYear === calendarRange.maxYear && calendarMonth < calendarRange.maxMonth) return true;
    return false;
  }, [calendarYear, calendarMonth, calendarRange]);

  // 月历年份导航按钮是否可用
  const canGoPrevYear = useMemo(() => {
    if (!calendarRange) return false;
    return calendarYear > calendarRange.minYear;
  }, [calendarYear, calendarRange]);

  const canGoNextYear = useMemo(() => {
    if (!calendarRange) return false;
    return calendarYear < calendarRange.maxYear;
  }, [calendarYear, calendarRange]);

  // 日历月份切换
  const handlePrevMonth = useCallback(() => {
    if (!canGoPrevMonth) return;
    if (calendarMonth === 1) {
      setCalendarYear(calendarYear - 1);
      setCalendarMonth(12);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  }, [canGoPrevMonth, calendarYear, calendarMonth]);

  const handleNextMonth = useCallback(() => {
    if (!canGoNextMonth) return;
    if (calendarMonth === 12) {
      setCalendarYear(calendarYear + 1);
      setCalendarMonth(1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  }, [canGoNextMonth, calendarYear, calendarMonth]);

  // 日历年份切换（月历用）
  const handlePrevYear = useCallback(() => {
    if (!canGoPrevYear) return;
    setCalendarYear(calendarYear - 1);
  }, [canGoPrevYear, calendarYear]);

  const handleNextYear = useCallback(() => {
    if (!canGoNextYear) return;
    setCalendarYear(calendarYear + 1);
  }, [canGoNextYear, calendarYear]);

  const monthlyProfits = useMemo(() => {
    const monthTotals: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      monthTotals[m] = 0;
    }

    for (const [date, profit] of Object.entries(calendarProfitMap)) {
      const [y, m] = date.split('-');
      if (parseInt(y) === calendarYear) {
        const month = parseInt(m);
        monthTotals[month] = (monthTotals[month] || 0) + profit;
      }
    }

    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const daysInMonth = new Date(calendarYear, m, 0).getDate();
      const monthStart = `${calendarYear}-${String(m).padStart(2, '0')}-01`;
      const monthEnd = `${calendarYear}-${String(m).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      const isInRange = chartFromDate && chartEndDate
        ? monthEnd >= chartFromDate && monthStart <= chartEndDate
        : false;
      return { month: m, profit: monthTotals[m], isInRange };
    });
  }, [calendarYear, calendarProfitMap, chartFromDate, chartEndDate]);

  const yearlyProfits = useMemo(() => {
    if (!calendarRange) return [];
    const yearTotals: Record<number, number> = {};

    for (const [date, profit] of Object.entries(calendarProfitMap)) {
      const year = parseInt(date.substring(0, 4));
      if (year >= calendarRange.minYear && year <= calendarRange.maxYear) {
        yearTotals[year] = (yearTotals[year] || 0) + profit;
      }
    }

    return Array.from(
      { length: calendarRange.maxYear - calendarRange.minYear + 1 },
      (_, i) => ({
        year: calendarRange.minYear + i,
        profit: yearTotals[calendarRange.minYear + i] || 0
      })
    );
  }, [calendarRange, calendarProfitMap]);

  // 日历格子数据：当前月份的所有日期和盈利
  const calendarDays = useMemo(() => {
    const days: { date: number; profit: number; isInRange: boolean }[] = [];
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
    const lastDay = new Date(calendarYear, calendarMonth, 0);
    const startDayOfWeek = firstDay.getDay();

    // 填充前面的空格（周日为0）
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: 0, profit: 0, isInRange: false });
    }

    // 填充日期
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const profit = calendarProfitMap[dateStr] ?? 0;
      const isInRange = chartFromDate && chartEndDate
        ? dateStr >= chartFromDate && dateStr <= chartEndDate
        : false;
      days.push({ date: d, profit, isInRange });
    }

    return days;
  }, [calendarYear, calendarMonth, calendarProfitMap, chartFromDate, chartEndDate]);

  // 图表完整期间的累计盈利（从 chartFromDate 到 chartEndDate）
  // 与日期选择器无关，固定显示图表起始到终止的总累计变化
  const chartPeriodTotal = useMemo(() => {
    if (!chartTimeline || chartTimeline.length === 0) return 0;
    const lastPoint = chartTimeline[chartTimeline.length - 1];
    const firstPoint = chartTimeline[0];
    // 期间累计 = 终点累计盈利 - 起点累计盈利
    return (lastPoint.cumulativeProfit || 0) - (firstPoint.cumulativeProfit || 0);
  }, [chartTimeline]);

  const applyPreset = useCallback((preset: OverallProfitDatePresetKey) => {
    const range = getOverallProfitPresetRange(preset, { maxToDate: chartEndDate });
    setFromDate(range.fromDate || null);
    setToDate(range.toDate || null);
  }, [chartEndDate]);

  // 表格期间累计：日期1到日期2之间的盈利差额
  const periodTotal = useMemo(() => {
    if (tableError || !fromDate || !toDate) return 0;
    const total = tableRows.reduce((sum, row) => sum + (row.profitDiff || 0), 0);
    return Number(total.toFixed(2));
  }, [tableRows, tableError, fromDate, toDate]);

  // Build table rows from precomputed perFundTimelines when summary or date pickers change
  useEffect(() => {
    setTableError(null);
    setTableRows([]);
    if (!summary) return;
    if (!fromDate || !toDate) {
      // require both dates to be set for table
      return;
    }
    // validation rules
    if (fromDate >= toDate) {
      setTableError('规则错误：日期1 必须早于 日期2');
      return;
    }
    const chartStart = summary.timeline && summary.timeline.length > 0 ? summary.timeline[0].date : null;
    const chartEnd = summary.timeline && summary.timeline.length > 0 ? summary.timeline[summary.timeline.length - 1].date : null;
    if (!chartStart || !chartEnd) return;
    // removed restriction: fromDate can be earlier than chartStart; values default to 0
    if (toDate > chartEnd) {
      setTableError('规则错误：日期2 不能晚于图表结束日期');
      return;
    }

    // Build rows: for each perFund row, lookup cumulative at fromDate/toDate from perFundTimelines
    const timelines = summary.perFundTimelines || {};
    const rows: OverallFundRow[] = summary.perFund.map(p => {
      // default to 0 when timelines missing or when fund startDate > fromDate
      let valFrom = 0;
      let valTo = 0;
      const fundTimeline = timelines[p.symbol] || [];
      // find entries for fromDate and toDate; if not exact, find last <= date
      const findValue = (date: string) => {
        // find exact match
        const exact = fundTimeline.find(r => r.date === date);
        // find last before
        let lastBefore: { date: string; cumulativeProfit: number } | null = null;
        for (let i = fundTimeline.length - 1; i >= 0; i--) {
          if (fundTimeline[i].date <= date) { lastBefore = fundTimeline[i]; break; }
        }
        // find next after
        let nextAfter: { date: string; cumulativeProfit: number } | null = null;
        for (let i = 0; i < fundTimeline.length; i++) {
          if (fundTimeline[i].date > date) { nextAfter = fundTimeline[i]; break; }
        }
        // If exact exists and is 0 but there is both a non-zero previous and a non-zero next, treat exact as spurious and return lastBefore
        if (exact && exact.cumulativeProfit === 0 && lastBefore && nextAfter && lastBefore.cumulativeProfit !== 0 && nextAfter.cumulativeProfit !== 0) {
          return lastBefore.cumulativeProfit;
        }
        if (exact) return exact.cumulativeProfit;
        if (lastBefore) return lastBefore.cumulativeProfit;
        // 如果没有 lastBefore 但有 nextAfter，说明 date 早于建仓日期，返回建仓日期的累计盈利
        if (nextAfter) return nextAfter.cumulativeProfit;
        return 0;
      };
      valFrom = findValue(fromDate);
      valTo = findValue(toDate);
      return { ...p, profitFrom: valFrom, profitTo: valTo, profitDiff: Number((valTo - valFrom).toFixed(4)) };
    });
    // filter out funds whose startDate is not earlier than toDate (i.e., startDate >= toDate excluded)
    setTableRows(rows.filter(r => !!r.startDate && r.startDate <= toDate));
  }, [summary, fromDate, toDate]);

  // 处理列排序点击：点击某列时，该列启用排序，循环切换排序方向
  const handleSortClick = useCallback((column: 'from' | 'to' | 'diff') => {
    if (sortColumn === column) {
      // 同一列：循环切换 none → desc → asc → none
      const nextOrder = sortOrder === 'none' ? 'desc' : sortOrder === 'desc' ? 'asc' : 'none';
      setSortOrder(nextOrder);
    } else {
      // 不同列：切换到该列，默认降序
      setSortColumn(column);
      setSortOrder('desc');
    }
  }, [sortColumn, sortOrder]);

  // 按当前排序状态排序后的展示行
  const displayedRows = useMemo(() => {
    if (sortOrder === 'none') return tableRows;
    const getValue = (row: OverallFundRow) => {
      if (sortColumn === 'from') return row.profitFrom || 0;
      if (sortColumn === 'to') return row.profitTo || 0;
      return row.profitDiff || 0;
    };
    return [...tableRows].sort((a, b) =>
      sortOrder === 'desc' ? getValue(b) - getValue(a) : getValue(a) - getValue(b)
    );
  }, [tableRows, sortColumn, sortOrder]);

  const content = (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden" style={{ maxWidth: '64rem' }} role="dialog" aria-modal="true">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <h3 className="text-lg font-bold">整体盈亏</h3>
          <div className="flex items-center space-x-2">
            {/* 视图切换按钮：图表/日历 */}
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                viewMode === 'chart'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
              aria-label="显示盈亏曲线图表"
              title="盈亏曲线"
            >
              <i className="fas fa-chart-line" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                viewMode === 'calendar'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
              aria-label="显示盈利日历"
              title="盈利日历"
            >
              <i className="fas fa-calendar-alt" />
            </button>
            <button aria-label="关闭整体盈亏窗口" className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-6"><i className="fas fa-circle-notch animate-spin text-red-500 text-3xl" /><p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-3">正在计算整体盈亏...</p></div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : (!summary || !summary.timeline || summary.timeline.length === 0) ? (
            <div className="text-sm text-gray-600">暂无可用数据。</div>
          ) : (!chartFromDate) ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <i className="fas fa-folder-open text-3xl mb-3" />
              <p className="text-sm font-medium">无持仓基金，请先配置</p>
            </div>
          ) : (
            <div className="space-y-4">
              {viewMode === 'chart' ? (
                <div ref={chartWrapRef} className="bg-gradient-to-b from-gray-50 to-white rounded-xl p-4 relative shadow-inner">
                <svg ref={chartSvgRef} className="w-full drop-shadow-sm" viewBox={`0 0 ${chart.width ?? 960} ${chart.height ?? 200}`} style={{ height: chart.height ?? 200 }} onMouseLeave={() => setHoverIndex(null)}>
                  {/* 背景渐变定义 */}
                  <defs>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Y轴网格线 */}
                  {chart.yTicks && chart.yTicks.map((t: any, i: number) => (
                    <g key={'y'+i}>
                      <line
                        x1={chart.padLeft ?? 80}
                        x2={(chart.width ?? 960) - (chart.padRight ?? 20)}
                        y1={t.y}
                        y2={t.y}
                        stroke="#e2e8f0"
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={(chart.padLeft ?? 80) - 12}
                        y={t.y}
                        textAnchor="end"
                        alignmentBaseline="middle"
                        className="text-[10px] fill-gray-400 font-mono"
                      >
                        {t.label}
                      </text>
                    </g>
                  ))}

                  {/* X轴刻度 */}
                  {chart.xTicks && chart.xTicks.map((t: any, i: number) => (
                    <text
                      key={'x'+i}
                      x={t.x}
                      y={(chart.height ?? 200) - 8}
                      textAnchor="middle"
                      className="text-[10px] fill-gray-400 font-medium"
                    >
                      {t.label}
                    </text>
                  ))}

                  {/* 填充区域 */}
                  {chart.areaPath && (
                    <path
                      d={chart.areaPath}
                      fill="url(#areaGradient)"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}

                  {/* 主折线 */}
                  <path
                    d={chart.path}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ pointerEvents: 'none' }}
                  />

                  {/* 折线上的空心小圆点 */}
                  {chart.points.map((pt: any, i: number) => (
                    <circle
                      key={`pt-${i}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={2}
                      fill="#fff"
                      stroke="#ef4444"
                      strokeWidth={1}
                      style={{ pointerEvents: 'none' }}
                    />
                  ))}

                  {/* 最新点脉冲动画 */}
                  {chart.points.length > 0 && (
                    <circle
                      cx={chart.points[chart.points.length - 1].x}
                      cy={chart.points[chart.points.length - 1].y}
                      r={4}
                      fill="#ef4444"
                      className="animate-pulse"
                    />
                  )}

                  {/* 悬停检测区域：使用原始点覆盖全图表 */}
                  {chart.originalPoints.map((pt: any, i: number) => (
                    <rect
                      key={i}
                      x={pt.x - 5}
                      y={0}
                      width={10}
                      height={Math.max(1, (chart.height ?? 200) - 40)}
                      fill="transparent"
                      onMouseEnter={() => setHoverIndex(i)}
                      onClick={() => handlePointClick(i)}
                      className="cursor-crosshair"
                      data-testid={`overall-profit-point-${i}`}
                    />
                  ))}
                </svg>
                {hoverIndex !== null && chart.originalPoints[hoverIndex] && (() => {
                  // tooltip定位：优先放在点的一侧，避免遮挡点和超出边界
                  const containerRect = chartWrapRef.current?.getBoundingClientRect();
                  const svgRect = chartSvgRef.current?.getBoundingClientRect();
                  if (!containerRect || !svgRect) return null;

                  const vbW = chart.width ?? 960;
                  const vbH = chart.height ?? 200;
                  // SVG坐标转换为像素坐标
                  const scaleX = svgRect.width / vbW;
                  const scaleY = svgRect.height / vbH;
                  const ptX = chart.originalPoints[hoverIndex].x * scaleX;
                  const ptY = chart.originalPoints[hoverIndex].y * scaleY;

                  // tooltip尺寸（固定宽度避免换行）
                  const tooltipWidth = 160;
                  const tooltipHeight = 60;
                  const gap = 20; // 点与tooltip的间距，确保不遮挡
                  const margin = 12;

                  // 悬停点在SVG中的宽度约为10px（rect宽度），加上圆点约7px
                  // 水平定位：点在左半边时tooltip在右侧，点在右半边时tooltip在左侧
                  const pointIsOnLeft = ptX < containerRect.width / 2;
                  const left = pointIsOnLeft
                    ? Math.min(containerRect.width - tooltipWidth - margin, ptX + gap + 5) // +5为悬停区域半径
                    : Math.max(margin, ptX - tooltipWidth - gap - 5);

                  // 垂直定位：尽量与点Y对齐，确保不超出容器
                  const top = Math.max(margin, Math.min(containerRect.height - tooltipHeight - margin, ptY - tooltipHeight / 2));

                  return (
                    <div
                      data-testid="overall-profit-tooltip"
                      className="absolute z-20 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg border border-gray-100 pointer-events-none whitespace-nowrap"
                      style={{ left, top, width: tooltipWidth }}
                    >
                      <div className="text-xs text-gray-400 font-mono">{formatDateDisplay(chart.originalPoints[hoverIndex].data.date)}</div>
                      <div className="text-xs font-mono mt-1">
                        <span className="text-gray-400">当日</span>
                        <span className={`ml-2 font-medium ${chart.originalPoints[hoverIndex].data.dailyProfit > 0 ? 'text-red-600' : chart.originalPoints[hoverIndex].data.dailyProfit < 0 ? 'text-green-600' : 'text-gray-700'}`}>{chart.originalPoints[hoverIndex].data.dailyProfit === 0 ? '-' : (chart.originalPoints[hoverIndex].data.dailyProfit > 0 ? '+' : '') + formatMoneyWithSeparators(chart.originalPoints[hoverIndex].data.dailyProfit)}</span>
                      </div>
                      <div className="text-xs font-mono">
                        <span className="text-gray-400">累计</span>
                        <span className={`ml-2 font-medium ${chart.originalPoints[hoverIndex].data.cumulativeProfit > 0 ? 'text-red-600' : chart.originalPoints[hoverIndex].data.cumulativeProfit < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                          {chart.originalPoints[hoverIndex].data.cumulativeProfit === 0 ? '-' : (chart.originalPoints[hoverIndex].data.cumulativeProfit > 0 ? '+' : '') + formatMoneyWithSeparators(chart.originalPoints[hoverIndex].data.cumulativeProfit)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              ) : (
              <div className="bg-gradient-to-b from-gray-50 to-white rounded-xl p-2 relative shadow-inner" style={{ height: 232 }}>
                <div className="flex h-full">
                  {/* 左侧：日/月/年切换按钮纵向排列 - 固定宽度 */}
                  <div className="w-12 flex flex-col justify-center items-center space-y-2 border-r border-gray-200 pr-3 mr-3">
                    <button
                      type="button"
                      onClick={() => setCalendarMode('day')}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        calendarMode === 'day'
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                      }`}
                      aria-label="日历视图"
                      title="日"
                    >
                      <span className="text-sm font-medium">日</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarMode('month')}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        calendarMode === 'month'
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                      }`}
                      aria-label="月历视图"
                      title="月"
                    >
                      <span className="text-sm font-medium">月</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarMode('year')}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        calendarMode === 'year'
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                      }`}
                      aria-label="年历视图"
                      title="年"
                    >
                      <span className="text-sm font-medium">年</span>
                    </button>
                  </div>
                  {/* 右侧：日历/月历/年历显示区域 - 自适应宽度 */}
                  <div className="flex-1 min-w-0">
                {calendarMode === 'day' && (
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-0.5 px-2">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        disabled={!canGoPrevMonth}
                        className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                          canGoPrevMonth
                            ? 'text-gray-600 hover:bg-gray-200'
                            : 'text-gray-300 cursor-not-allowed'
                        }`}
                        aria-label="上一月"
                      >
                        <i className="fas fa-chevron-left text-xs" />
                      </button>
                      <span className="text-sm font-medium text-gray-700">
                        {calendarYear}年{calendarMonth}月
                      </span>
                      <button
                        type="button"
                        onClick={handleNextMonth}
                        disabled={!canGoNextMonth}
                        className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                          canGoNextMonth
                            ? 'text-gray-600 hover:bg-gray-200'
                            : 'text-gray-300 cursor-not-allowed'
                        }`}
                        aria-label="下一月"
                      >
                        <i className="fas fa-chevron-right text-xs" />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 mb-0.5">
                      {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                        <div key={day} className="text-center text-[10px] text-gray-400 font-medium">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {calendarDays.map((day, i) => (
                        <div
                          key={i}
                          className={`text-center py-0.5 rounded border ${
                            day.date === 0
                              ? 'border-transparent'
                              : day.isInRange
                                ? `${day.profit > 0 ? 'bg-red-50 border-red-100' : day.profit < 0 ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200'} hover:bg-opacity-80`
                                : 'bg-gray-100 border-gray-200'
                          }`}
                        >
                          {day.date > 0 && (
                            <>
                              <div className="text-[10px] text-gray-600">{day.date}</div>
                              <div className={`text-[10px] font-mono ${
                                day.profit > 0 ? 'text-red-600' : day.profit < 0 ? 'text-green-600' : 'text-gray-700'
                              }`}>
                                {day.profit === 0 ? '-' : (day.profit > 0 ? '+' : '') + formatMoneyWithSeparators(day.profit)}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {calendarMode === 'month' && (
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-2 px-2">
                      <button
                        type="button"
                        onClick={handlePrevYear}
                        disabled={!canGoPrevYear}
                        className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                          canGoPrevYear
                            ? 'text-gray-600 hover:bg-gray-200'
                            : 'text-gray-300 cursor-not-allowed'
                        }`}
                        aria-label="上一年"
                      >
                        <i className="fas fa-chevron-left text-xs" />
                      </button>
                      <span className="text-sm font-medium text-gray-700">
                        {calendarYear}年
                      </span>
                      <button
                        type="button"
                        onClick={handleNextYear}
                        disabled={!canGoNextYear}
                        className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                          canGoNextYear
                            ? 'text-gray-600 hover:bg-gray-200'
                            : 'text-gray-300 cursor-not-allowed'
                        }`}
                        aria-label="下一年"
                      >
                        <i className="fas fa-chevron-right text-xs" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {monthlyProfits.map(mp => (
                        <div
                          key={mp.month}
                          className={`text-center py-2 rounded border ${
                            mp.isInRange
                              ? `${mp.profit > 0 ? 'bg-red-50 border-red-100' : mp.profit < 0 ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200'} hover:bg-opacity-80`
                              : 'bg-gray-100 border-gray-200'
                          }`}
                        >
                          <div className="text-[10px] text-gray-600 font-medium">{mp.month}月</div>
                          <div className={`text-[10px] font-mono ${
                            mp.profit > 0 ? 'text-red-600' : mp.profit < 0 ? 'text-green-600' : 'text-gray-700'
                          }`}>
                            {mp.profit === 0 ? '-' : (mp.profit > 0 ? '+' : '') + formatMoneyWithSeparators(mp.profit)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {calendarMode === 'year' && (
                  <div className="flex flex-col">
                    {/* 年历顶部：期间累计信息 */}
                    <div className="text-center text-xs mb-2 py-1 border-b border-gray-200">
                      {chartFromDate && chartEndDate ? (
                        <>
                          <span className="text-gray-500">期间累计</span>
                          <span className="text-gray-400 mx-1">（{formatDateDisplay(chartFromDate)} ~ {formatDateDisplay(chartEndDate)}）</span>
                          <span className={`font-medium ${
                            chartPeriodTotal === 0 ? 'text-gray-700' : chartPeriodTotal > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {chartPeriodTotal === 0 ? '-' : (chartPeriodTotal > 0 ? '+' : '') + formatMoneyWithSeparators(chartPeriodTotal)}
                          </span>
                        </>
                      ) : (
                        <span className="text-gray-400">暂无数据</span>
                      )}
                    </div>
                    {yearlyProfits.length <= 4 ? (
                      <div className="flex justify-center gap-2">
                        {yearlyProfits.map(yp => (
                          <div
                            key={yp.year}
                            className={`text-center py-3 px-4 rounded border ${
                              yp.profit > 0 ? 'bg-red-50 border-red-100' : yp.profit < 0 ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200'
                            } hover:bg-opacity-80`}
                          >
                            <div className="text-xs text-gray-600 font-medium">{yp.year}年</div>
                            <div className={`text-[10px] font-mono ${
                              yp.profit > 0 ? 'text-red-600' : yp.profit < 0 ? 'text-green-600' : 'text-gray-700'
                            }`}>
                              {yp.profit === 0 ? '-' : (yp.profit > 0 ? '+' : '') + formatMoneyWithSeparators(yp.profit)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {yearlyProfits.map(yp => (
                          <div
                            key={yp.year}
                            className={`text-center py-3 rounded border ${
                              yp.profit > 0 ? 'bg-red-50 border-red-100' : yp.profit < 0 ? 'bg-green-50 border-green-100' : 'bg-white border-gray-200'
                            } hover:bg-opacity-80`}
                          >
                            <div className="text-xs text-gray-600 font-medium">{yp.year}年</div>
                            <div className={`text-[10px] font-mono ${
                              yp.profit > 0 ? 'text-red-600' : yp.profit < 0 ? 'text-green-600' : 'text-gray-700'
                            }`}>
                              {yp.profit === 0 ? '-' : (yp.profit > 0 ? '+' : '') + formatMoneyWithSeparators(yp.profit)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                  </div>
                </div>
              </div>
              )}

              {/* 图表/日历期间累计：保持固定高度，日历视图时隐藏内容但保留空间 */}
              <div data-testid="overall-period-total" className="text-xs mt-2 min-h-[20px]">
                {viewMode === 'chart' && chartFromDate && chartEndDate ? (
                  <>
                    期间累计（{formatDateDisplay(chartFromDate)} ~ {formatDateDisplay(chartEndDate)}）：
                    {chartPeriodTotal === 0 ? (
                      <span className="text-black">-</span>
                    ) : chartPeriodTotal > 0 ? (
                      <span className="text-red-600">+{formatMoneyWithSeparators(chartPeriodTotal)}</span>
                    ) : (
                      <span className="text-green-600">{formatMoneyWithSeparators(chartPeriodTotal)}</span>
                    )}
                  </>
                ) : viewMode === 'chart' ? (
                  <span className="text-gray-400">暂无数据</span>
                ) : null}
              </div>

              {/* 日期选择器：位于表格上方 */}
              <div className="mt-3 flex flex-wrap items-center gap-3" style={{ position: 'relative', zIndex: 1400, background: '#ffffff', padding: '6px', borderRadius: '6px' }}>
                <div className="flex items-center space-x-2 text-xs text-gray-600">
                  <label>日期1</label>
                  <input type="date" value={fromDate ?? ''} onChange={e => setFromDate(e.target.value)} className="px-2 py-1 border rounded" />
                  <label>日期2</label>
                  <input type="date" value={toDate ?? ''} onChange={e => setToDate(e.target.value)} className="px-2 py-1 border rounded" />
                </div>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                  onClick={() => {
                    setFromDate(chartFromDate);
                    setToDate(chartEndDate);
                  }}
                >
                  重置
                </button>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {OVERALL_PROFIT_DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.key}
                      type="button"
                      className="px-3 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
                      aria-label={`快捷日期：${preset.label}`}
                      onClick={() => applyPreset(preset.key)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {tableError && <div className="text-xs text-red-600">{tableError}</div>}
              </div>

              <div className="pt-4 border-t">
                {/* Single table with sticky thead/tfoot — scrollbar stays inside tbody only */}
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="overflow-y-auto" style={{ maxHeight: '330px' }}>
                    <table className="w-full text-sm table-fixed border-collapse">
                      <colgroup>
                        <col style={{ width: '50%' }} />
                        <col style={{ width: '16.6667%' }} />
                        <col style={{ width: '16.6667%' }} />
                        <col style={{ width: '16.6667%' }} />
                      </colgroup>
                      <thead className="sticky top-0 z-10 bg-gray-50">
                        <tr className="border-b border-gray-200">
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">基金名称（基金代码）</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                            <button
                              className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors select-none"
                              onClick={() => handleSortClick('from')}
                              title="点击切换排序"
                            >
                              {formatDateDisplay(fromDate)}累计盈利
                              <span className="text-gray-400">
                                {sortColumn !== 'from' && <i className="fas fa-sort" />}
                                {sortColumn === 'from' && sortOrder === 'none' && <i className="fas fa-sort" />}
                                {sortColumn === 'from' && sortOrder === 'desc' && <i className="fas fa-sort-down text-blue-500" />}
                                {sortColumn === 'from' && sortOrder === 'asc'  && <i className="fas fa-sort-up text-blue-500" />}
                              </span>
                            </button>
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                            <button
                              className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors select-none"
                              onClick={() => handleSortClick('to')}
                              title="点击切换排序"
                            >
                              {formatDateDisplay(toDate)}累计盈利
                              <span className="text-gray-400">
                                {sortColumn !== 'to' && <i className="fas fa-sort" />}
                                {sortColumn === 'to' && sortOrder === 'none' && <i className="fas fa-sort" />}
                                {sortColumn === 'to' && sortOrder === 'desc' && <i className="fas fa-sort-down text-blue-500" />}
                                {sortColumn === 'to' && sortOrder === 'asc'  && <i className="fas fa-sort-up text-blue-500" />}
                              </span>
                            </button>
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500">
                            <button
                              className="inline-flex items-center gap-1 hover:text-gray-700 transition-colors select-none"
                              onClick={() => handleSortClick('diff')}
                              title="点击切换排序"
                            >
                              差额
                              <span className="text-gray-400">
                                {sortColumn !== 'diff' && <i className="fas fa-sort" />}
                                {sortColumn === 'diff' && sortOrder === 'none' && <i className="fas fa-sort" />}
                                {sortColumn === 'diff' && sortOrder === 'desc' && <i className="fas fa-sort-down text-blue-500" />}
                                {sortColumn === 'diff' && sortOrder === 'asc'  && <i className="fas fa-sort-up text-blue-500" />}
                              </span>
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRows.map(p => (
                          <tr key={p.symbol} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 text-left text-xs text-gray-700">
                              {onSelectFund ? (
                                <button
                                  className="text-left w-full truncate hover:text-blue-600 transition-colors"
                                  title={`${p.name} (${String(p.symbol).padStart(6,'0')})`}
                                  onClick={() => { onSelectFund(String(p.symbol)); onClose(); }}
                                >
                                  {(p.name && p.name.trim()) ? `${p.name} (${String(p.symbol).padStart(6,'0')})` : `(${String(p.symbol).padStart(6,'0')})`}
                                </button>
                              ) : (
                                (p.name && p.name.trim()) ? `${p.name} (${String(p.symbol).padStart(6,'0')})` : `(${String(p.symbol).padStart(6,'0')})`
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-xs">{(p.profitFrom||0)===0? <span className="text-black">-</span> : <span className={`${(p.profitFrom||0)>0? 'text-red-600':'text-green-600'}`}>{(p.profitFrom||0)>0?'+':''}{formatMoneyWithSeparators(p.profitFrom||0)}</span>}</td>
                            <td className="px-3 py-2 text-right text-xs">{(p.profitTo||0)===0? <span className="text-black">-</span> : <span className={`${(p.profitTo||0)>0? 'text-red-600':'text-green-600'}`}>{(p.profitTo||0)>0?'+':''}{formatMoneyWithSeparators(p.profitTo||0)}</span>}</td>
                            <td className="px-3 py-2 text-right text-xs"><MoneyCell value={p.profitDiff||0} /></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-10 bg-gray-50">
                        {(() => {
                          const rows = tableRows || [];
                          const totalFrom = rows.reduce((s, r) => s + (r.profitFrom || 0), 0);
                          const totalTo = rows.reduce((s, r) => s + (r.profitTo || 0), 0);
                          const totalDiff = rows.reduce((s, r) => s + (r.profitDiff || 0), 0);
                          return (
                            <tr className="border-t border-gray-200">
                              <td className="px-3 py-2 text-left text-xs font-bold text-gray-700">总计：{rows.length}条记录</td>
                              <td className="px-3 py-2 text-right text-xs font-bold">{totalFrom===0? <span className="text-black">-</span> : <span className={`${totalFrom>0? 'text-red-600':'text-green-600'}`}>{totalFrom>0?'+':''}{formatMoneyWithSeparators(totalFrom)}</span>}</td>
                              <td className="px-3 py-2 text-right text-xs font-bold">{totalTo===0? <span className="text-black">-</span> : <span className={`${totalTo>0? 'text-red-600':'text-green-600'}`}>{totalTo>0?'+':''}{formatMoneyWithSeparators(totalTo)}</span>}</td>
                              <td className="px-3 py-2 text-right text-xs font-bold">{totalDiff===0? <span className="text-black">-</span> : totalDiff>0? <span className="text-red-600">+{formatMoneyWithSeparators(totalDiff)}</span> : <span className="text-green-600">{formatMoneyWithSeparators(totalDiff)}</span>}</td>
                            </tr>
                          );
                        })()}
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default OverallProfitModal;

