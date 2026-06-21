import React, { useState, useMemo } from 'react';
import { BacktestSignal, BacktestSummary, BuyPriceType } from '../utils/backtestEngine';
import { Play, Search, AlertCircle, ArrowUpDown, ExternalLink, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactECharts from 'echarts-for-react';

interface BacktestDashboardProps {
  signals: BacktestSignal[];
  summary: BacktestSummary | null;
  isBacktesting: boolean;
  progress: { current: number; total: number } | null;
  buyPriceType: BuyPriceType;
  buyPhaseLabel: string;
  onBuyPriceTypeChange: (val: BuyPriceType) => void;
  onRunBacktest: () => void;
  onSelectSignal: (sig: BacktestSignal) => void;
  hasMarketData: boolean;
}

type SortField = 'code' | 'name' | 'p3_breakDate' | 'buyPrice' | 'ret3' | 'ret5' | 'ret10' | 'ret20' | 'maxProfit' | 'maxDrawdown';
type SortOrder = 'asc' | 'desc';

export const BacktestDashboard: React.FC<BacktestDashboardProps> = ({
  signals,
  summary,
  isBacktesting,
  progress,
  buyPriceType,
  buyPhaseLabel,
  onBuyPriceTypeChange,
  onRunBacktest,
  onSelectSignal,
  hasMarketData
}) => {
  const [filterText, setFilterText] = useState('');
  const [sortField, setSortField] = useState<SortField>('p3_breakDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [distMode, setDistMode] = useState<'best' | 'hold20' | 'worst'>('hold20');

  const distModes: ('best' | 'hold20' | 'worst')[] = ['best', 'hold20', 'worst'];
  
  const handlePrevMode = () => {
    const idx = distModes.indexOf(distMode);
    const prevIdx = (idx - 1 + distModes.length) % distModes.length;
    setDistMode(distModes[prevIdx]);
  };

  const handleNextMode = () => {
    const idx = distModes.indexOf(distMode);
    const nextIdx = (idx + 1) % distModes.length;
    setDistMode(distModes[nextIdx]);
  };

  // Calculate 20-day returns distribution based on mode
  const distributionData = useMemo(() => {
    if (!signals || signals.length === 0) return [];
    
    const buckets = [
      { label: '<-10%', shortLabel: '<-10', min: -Infinity, max: -10, count: 0, color: '#10b981' },
      { label: '-10%~-5%', shortLabel: '-10~-5', min: -10, max: -5, count: 0, color: '#34d399' },
      { label: '-5%~0%', shortLabel: '-5~0', min: -5, max: 0, count: 0, color: '#a7f3d0' },
      { label: '0%~5%', shortLabel: '0~5', min: 0, max: 5, count: 0, color: '#fecdd3' },
      { label: '5%~10%', shortLabel: '5~10', min: 5, max: 10, count: 0, color: '#fda4af' },
      { label: '10%~20%', shortLabel: '10~20', min: 10, max: 20, count: 0, color: '#f43f5e' },
      { label: '>20%', shortLabel: '>20', min: 20, max: Infinity, count: 0, color: '#e11d48' }
    ];

    for (const sig of signals) {
      let val = 0;
      if (distMode === 'hold20') {
        val = sig.returns[20] ?? 0;
      } else if (distMode === 'best') {
        val = sig.maxProfit;
      } else if (distMode === 'worst') {
        val = sig.maxDrawdown;
      }

      for (const bucket of buckets) {
        if (val >= bucket.min && val < bucket.max) {
          bucket.count++;
          break;
        }
      }
    }
    return buckets;
  }, [signals, distMode]);

  // ECharts Option for return distribution
  const chartOption = useMemo(() => {
    const shortCategories = distributionData.map(d => d.shortLabel);
    const categories = distributionData.map(d => d.label);
    const counts = distributionData.map(d => d.count);
    const colors = distributionData.map(d => d.color);

    return {
      grid: {
        top: 15,
        bottom: 2,
        left: 5,
        right: 5,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: shortCategories,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { 
          show: true, 
          color: '#a1a1aa', 
          fontSize: 8, 
          interval: 0,
          rotate: 35,
          margin: 4
        },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const idx = params[0].dataIndex;
          const total = signals.length;
          const pct = total > 0 ? ((params[0].value / total) * 100).toFixed(1) : '0.0';
          return `${categories[idx]}: ${params[0].value} 个信号 (${pct}%)`;
        },
        backgroundColor: 'rgba(24, 24, 27, 0.95)',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        textStyle: { color: '#fff', fontSize: 10 }
      },
      series: [
        {
          name: '信号数',
          type: 'bar',
          data: counts,
          barWidth: '60%',
          label: {
            show: true,
            position: 'top',
            color: '#ffffff',
            fontSize: 9,
            formatter: (params: any) => {
              const total = signals.length;
              if (total === 0) return '';
              const pct = (params.value / total) * 100;
              return `${pct.toFixed(0)}%`;
            }
          },
          itemStyle: {
            color: (params: any) => {
              return colors[params.dataIndex];
            },
            borderRadius: [3, 3, 0, 0]
          }
        }
      ]
    };
  }, [distributionData, signals]);

  // Handle Sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Filter signals
  const filteredSignals = useMemo(() => {
    return signals.filter(sig => {
      const query = filterText.toLowerCase().trim();
      if (!query) return true;
      return sig.code.includes(query) || sig.name.toLowerCase().includes(query);
    });
  }, [signals, filterText]);

  // Sorted signals
  const sortedSignals = useMemo(() => {
    const sorted = [...filteredSignals];
    sorted.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      switch (sortField) {
        case 'code':
          valA = a.code;
          valB = b.code;
          break;
        case 'name':
          valA = a.name;
          valB = b.name;
          break;
        case 'p3_breakDate':
          valA = a.p3_breakDate;
          valB = b.p3_breakDate;
          break;
        case 'buyPrice':
          valA = a.buyPrice;
          valB = b.buyPrice;
          break;
        case 'ret3':
          valA = a.returns[3] ?? -9999;
          valB = b.returns[3] ?? -9999;
          break;
        case 'ret5':
          valA = a.returns[5] ?? -9999;
          valB = b.returns[5] ?? -9999;
          break;
        case 'ret10':
          valA = a.returns[10] ?? -9999;
          valB = b.returns[10] ?? -9999;
          break;
        case 'ret20':
          valA = a.returns[20] ?? -9999;
          valB = b.returns[20] ?? -9999;
          break;
        case 'maxProfit':
          valA = a.maxProfit;
          valB = b.maxProfit;
          break;
        case 'maxDrawdown':
          valA = a.maxDrawdown;
          valB = b.maxDrawdown;
          break;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredSignals, sortField, sortOrder]);

  const renderReturn = (val: number | null) => {
    if (val === null) return <span style={{ color: 'var(--text-muted)' }}>进行中</span>;
    const color = val > 0 ? '#e11d48' : val < 0 ? '#10b981' : 'var(--text-secondary)';
    const prefix = val > 0 ? '+' : '';
    return <span style={{ color, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{prefix}{val.toFixed(2)}%</span>;
  };

  const renderDrawdown = (val: number) => {
    const color = val < 0 ? '#10b981' : 'var(--text-secondary)';
    const prefix = val > 0 ? '+' : '';
    return <span style={{ color, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{prefix}{val.toFixed(2)}%</span>;
  };

  const renderMaxProfit = (val: number) => {
    const color = val > 0 ? '#e11d48' : 'var(--text-secondary)';
    const prefix = val > 0 ? '+' : '';
    return <span style={{ color, fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{prefix}{val.toFixed(2)}%</span>;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: 'var(--text-primary)' }}>
      {/* Top Configuration & Control Bar */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>模拟买入价:</span>
              <span 
                className="tooltip-trigger tooltip-bottom" 
                data-tooltip="突破日收盘价：以突破确认日的收盘价买入（完全确认信号，最稳健）。突破日开盘价：以突破确认日的开盘价买入（提前抢跑，可能未收盘确认）。突破时：以阶段一连板前高（突破参考价）作为模拟买入价，假设在价格突破该关键位时成交。"
                style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center', marginRight: '4px', color: 'var(--text-muted)' }}
              >
                <Info size={12} />
              </span>
            </div>
            <select
              value={buyPriceType}
              onChange={(e) => onBuyPriceTypeChange(e.target.value as BuyPriceType)}
              disabled={isBacktesting}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-light)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                padding: '4px 8px',
                cursor: 'pointer'
              }}
            >
              <option value="close">突破日收盘价</option>
              <option value="open">突破日开盘价</option>
              <option value="ref">突破时</option>
            </select>
          </div>
        </div>

        {/* Terminology Explanation Notes */}
        <div style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(255, 255, 255, 0.02)',
          padding: '4px 12px',
          borderRadius: '4px',
          border: '1px dashed rgba(255, 255, 255, 0.05)',
        }}>
          <span>{buyPhaseLabel}买入</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>|</span>
          <span><strong>胜率</strong>：持仓天数内收盘价高于模拟买入价的信号比例</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>|</span>
          <span><strong>均幅</strong>：所有信号在对应持仓天数下的平均收益率</span>
        </div>

        <button
          onClick={onRunBacktest}
          className="btn-primary"
          disabled={isBacktesting || !hasMarketData}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            height: '32px',
            padding: '0 16px'
          }}
        >
          <Play size={12} fill="currentColor" />
          <span>{isBacktesting ? '回测中...' : '开始理论检验'}</span>
        </button>
      </div>

      {/* Progress Bar / Empty State */}
      {isBacktesting && progress && (
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            <span>正在检索历史信号并回测收益率...</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{progress.current} / {progress.total}</span>
          </div>
          <div style={{ height: '6px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(progress.current / progress.total) * 100}%`, background: 'var(--accent-blue)', transition: 'width 0.1s linear' }}></div>
          </div>
        </div>
      )}

      {!hasMarketData && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
          <AlertCircle size={40} style={{ marginBottom: '12px', opacity: 0.5, color: '#eab308' }} />
          <h4 style={{ margin: 0, fontWeight: 500 }}>未导入全市场 K 线数据</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center', maxWidth: '360px' }}>
            理论检验（回测）功能需要全市场行情包支持。请导入 `market_snapshot.json` 格式的行情数据后重试。
          </p>
        </div>
      )}

      {hasMarketData && !isBacktesting && !summary && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
          <Play size={40} style={{ marginBottom: '12px', opacity: 0.3, color: 'var(--accent-blue)' }} />
          <h4 style={{ margin: 0, fontWeight: 500 }}>未运行回测</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center', maxWidth: '360px' }}>
            点击右上角「开始理论检验」按钮，系统将根据左侧策略参数，检验过去两年的全部历史成交表现。
          </p>
        </div>
      )}

      {/* Summary Dashboard and Table */}
      {summary && !isBacktesting && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Summary Cards Grid */}
          <div style={{
            padding: '10px 12px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
            gap: '8px',
            borderBottom: '1px solid var(--border-light)'
          }}>
            {/* Total Trades Card */}
            <div className="glass-panel" style={{ padding: '8px 4px', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>历史信号数</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', margin: '4px 0', fontFamily: 'var(--font-mono)' }}>{summary.totalSignals}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>冷却周期: 20日</div>
            </div>

            {/* Hold 3D */}
            <div className="glass-panel" style={{ padding: '8px 4px', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <span>持有 3 交易日</span>
                <span 
                  className="tooltip-trigger tooltip-bottom" 
                  data-tooltip="中位数（中位）相比平均值（均幅）更能体现典型个股的表现，不受暴涨暴跌个股偏态污染。"
                  style={{ cursor: 'help', color: 'var(--text-muted)' }}
                >
                  <Info size={10} />
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 'bold', margin: '4px 0' }}>
                胜率: <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{summary.winRates[3]}%</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                <span>均幅: <span style={{ color: summary.avgReturns[3] >= 0 ? '#e11d48' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                  {summary.avgReturns[3] >= 0 ? '+' : ''}{summary.avgReturns[3]}%
                </span></span>
                <span>中位: <span style={{ color: (summary.medianReturns?.[3] ?? 0) >= 0 ? '#e11d48' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                  {(summary.medianReturns?.[3] ?? 0) >= 0 ? '+' : ''}{summary.medianReturns?.[3] ?? 0}%
                </span></span>
              </div>
            </div>

            {/* Hold 5D */}
            <div className="glass-panel" style={{ padding: '8px 4px', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <span>持有 5 交易日</span>
                <span 
                  className="tooltip-trigger tooltip-bottom" 
                  data-tooltip="中位数（中位）相比平均值（均幅）更能体现典型个股的表现，不受暴涨暴跌个股偏态污染。"
                  style={{ cursor: 'help', color: 'var(--text-muted)' }}
                >
                  <Info size={10} />
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 'bold', margin: '4px 0' }}>
                胜率: <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{summary.winRates[5]}%</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                <span>均幅: <span style={{ color: summary.avgReturns[5] >= 0 ? '#e11d48' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                  {summary.avgReturns[5] >= 0 ? '+' : ''}{summary.avgReturns[5]}%
                </span></span>
                <span>中位: <span style={{ color: (summary.medianReturns?.[5] ?? 0) >= 0 ? '#e11d48' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                  {(summary.medianReturns?.[5] ?? 0) >= 0 ? '+' : ''}{summary.medianReturns?.[5] ?? 0}%
                </span></span>
              </div>
            </div>

            {/* Hold 10D */}
            <div className="glass-panel" style={{ padding: '8px 4px', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <span>持有 10 交易日</span>
                <span 
                  className="tooltip-trigger tooltip-bottom" 
                  data-tooltip="中位数（中位）相比平均值（均幅）更能体现典型个股的表现，不受暴涨暴跌个股偏态污染。"
                  style={{ cursor: 'help', color: 'var(--text-muted)' }}
                >
                  <Info size={10} />
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 'bold', margin: '4px 0' }}>
                胜率: <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{summary.winRates[10]}%</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                <span>均幅: <span style={{ color: summary.avgReturns[10] >= 0 ? '#e11d48' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                  {summary.avgReturns[10] >= 0 ? '+' : ''}{summary.avgReturns[10]}%
                </span></span>
                <span>中位: <span style={{ color: (summary.medianReturns?.[10] ?? 0) >= 0 ? '#e11d48' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                  {(summary.medianReturns?.[10] ?? 0) >= 0 ? '+' : ''}{summary.medianReturns?.[10] ?? 0}%
                </span></span>
              </div>
            </div>

            {/* Hold 20D */}
            <div className="glass-panel" style={{ padding: '8px 4px', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <span>持有 20 交易日</span>
                <span 
                  className="tooltip-trigger tooltip-bottom" 
                  data-tooltip="中位数（中位）相比平均值（均幅）更能体现典型个股的表现，不受暴涨暴跌个股偏态污染。"
                  style={{ cursor: 'help', color: 'var(--text-muted)' }}
                >
                  <Info size={10} />
                </span>
              </div>
              <div style={{ fontSize: '15px', fontWeight: 'bold', margin: '4px 0' }}>
                胜率: <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{summary.winRates[20]}%</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                <span>均幅: <span style={{ color: summary.avgReturns[20] >= 0 ? '#e11d48' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                  {summary.avgReturns[20] >= 0 ? '+' : ''}{summary.avgReturns[20]}%
                </span></span>
                <span>中位: <span style={{ color: (summary.medianReturns?.[20] ?? 0) >= 0 ? '#e11d48' : '#10b981', fontFamily: 'var(--font-mono)' }}>
                  {(summary.medianReturns?.[20] ?? 0) >= 0 ? '+' : ''}{summary.medianReturns?.[20] ?? 0}%
                </span></span>
              </div>
            </div>

            {/* Profit Ratio Elasticity */}
            <div className="glass-panel" style={{ padding: '8px 4px', textAlign: 'center', background: 'rgba(255,255,255,0.01)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <span>20日拉升上限/下限</span>
                <span 
                  className="tooltip-trigger tooltip-bottom tooltip-align-right" 
                  data-tooltip="反映买入后20日内个股波动的理论极限区间。拉升上限（最高盈利极值）：持有期内最高价相比买入价的涨幅，即完美卖在顶峰的操作可能。拉升下限（最大回撤极值）：持有期内最低价相比买入价的跌幅，即在此期间账面浮亏可能面临的最大心理或止损压力。"
                  style={{ cursor: 'help', color: 'var(--text-muted)' }}
                >
                  <Info size={10} />
                </span>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 'bold', margin: '4px 0', display: 'flex', justifyContent: 'space-around', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'normal' }}>平均值</span>
                  <span style={{ color: '#e11d48', fontFamily: 'var(--font-mono)' }}>+{summary.avgMaxProfit}%</span>
                  <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>{summary.avgMaxDrawdown}%</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'normal' }}>中位数</span>
                  <span style={{ color: '#e11d48', fontFamily: 'var(--font-mono)' }}>+{summary.medianMaxProfit ?? 0}%</span>
                  <span style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>{summary.medianMaxDrawdown ?? 0}%</span>
                </div>
              </div>
            </div>

            {/* Distribution Chart Card */}
            <div className="glass-panel" style={{
              padding: '6px 4px',
              background: 'rgba(255, 255, 255, 0.01)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              height: '100%',
              minHeight: '110px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px', padding: '0 2px' }}>
                <button
                  onClick={handlePrevMode}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none'
                  }}
                >
                  <ChevronLeft size={11} />
                </button>

                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' }}>
                  <span>
                    {distMode === 'hold20' && '死拿20天实际值'}
                    {distMode === 'best' && '操作最佳理论极值'}
                    {distMode === 'worst' && '操作最差理论极值'}
                  </span>
                  <span 
                    className="tooltip-trigger tooltip-bottom tooltip-align-right" 
                    data-tooltip={
                      distMode === 'hold20' 
                        ? "死拿20天结算分布(实际值)：统计所有信号买入后第20交易日结算收盘时的盈亏分布情况。" 
                        : distMode === 'best' 
                          ? "操作最佳分布(理论上限)：统计持有20日内触及最高价时的理论盈利分布。" 
                          : "操作最差分布(理论下限)：统计持有20日内触及最低价时的理论最深浮亏/回撤分布。"
                    }
                    style={{ cursor: 'help', color: 'var(--text-muted)' }}
                  >
                    <Info size={9} />
                  </span>
                </div>

                <button
                  onClick={handleNextMode}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none'
                  }}
                >
                  <ChevronRight size={11} />
                </button>
              </div>
              <div style={{ flex: 1, height: '75px' }}>
                <ReactECharts
                  option={chartOption}
                  style={{ height: '100%', width: '100%' }}
                  theme="dark"
                />
              </div>
            </div>
          </div>

          {/* Signals Filter & Signals Log List */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Filter Input */}
            <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-light)', background: 'rgba(255, 255, 255, 0.01)' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '280px' }}>
                <input
                  type="text"
                  placeholder="搜索代码/名称过滤"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: '28px',
                    height: '28px',
                    fontSize: '11px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-light)'
                  }}
                />
                <Search size={11} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                匹配记录数: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{filteredSignals.length}</strong> / {signals.length}
              </span>
            </div>

            {/* Grid Scroll Table */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', minWidth: '850px' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: 'rgba(20, 20, 25, 0.95)', zIndex: 10, borderBottom: '1px solid var(--border-light)' }}>
                    <th onClick={() => handleSort('code')} style={{ padding: '8px 12px', textAlign: 'left', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      代码 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'code' ? 1 : 0.4 }} />
                    </th>
                    <th onClick={() => handleSort('name')} style={{ padding: '8px 12px', textAlign: 'left', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      股票名称 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'name' ? 1 : 0.4 }} />
                    </th>
                    <th onClick={() => handleSort('p3_breakDate')} style={{ padding: '8px 12px', textAlign: 'left', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      突破日期 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'p3_breakDate' ? 1 : 0.4 }} />
                    </th>
                    <th onClick={() => handleSort('buyPrice')} style={{ padding: '8px 12px', textAlign: 'right', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      买入价 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'buyPrice' ? 1 : 0.4 }} />
                    </th>
                    <th onClick={() => handleSort('ret3')} style={{ padding: '8px 12px', textAlign: 'right', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      3日收益 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'ret3' ? 1 : 0.4 }} />
                    </th>
                    <th onClick={() => handleSort('ret5')} style={{ padding: '8px 12px', textAlign: 'right', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      5日收益 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'ret5' ? 1 : 0.4 }} />
                    </th>
                    <th onClick={() => handleSort('ret10')} style={{ padding: '8px 12px', textAlign: 'right', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      10日收益 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'ret10' ? 1 : 0.4 }} />
                    </th>
                    <th onClick={() => handleSort('ret20')} style={{ padding: '8px 12px', textAlign: 'right', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      20日收益 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'ret20' ? 1 : 0.4 }} />
                    </th>
                    <th onClick={() => handleSort('maxProfit')} style={{ padding: '8px 12px', textAlign: 'right', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      20日最高 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'maxProfit' ? 1 : 0.4 }} />
                    </th>
                    <th onClick={() => handleSort('maxDrawdown')} style={{ padding: '8px 12px', textAlign: 'right', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      20日最大撤 <ArrowUpDown size={10} style={{ marginLeft: '4px', verticalAlign: 'middle', opacity: sortField === 'maxDrawdown' ? 1 : 0.4 }} />
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 400 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSignals.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        无符合搜索条件的交易记录
                      </td>
                    </tr>
                  ) : (
                    sortedSignals.map((sig, idx) => (
                      <tr
                        key={`${sig.code}-${sig.p3_breakDate}-${idx}`}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.02)',
                          transition: 'background 0.2s',
                          cursor: 'pointer'
                        }}
                        onClick={() => onSelectSignal(sig)}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{sig.code}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>{sig.name}</td>
                        <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{sig.p3_breakDate}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {sig.buyPrice.toFixed(2)}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{renderReturn(sig.returns[3])}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{renderReturn(sig.returns[5])}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{renderReturn(sig.returns[10])}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{renderReturn(sig.returns[20])}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{renderMaxProfit(sig.maxProfit)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{renderDrawdown(sig.maxDrawdown)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectSignal(sig);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-blue)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              padding: '2px 4px',
                              fontSize: '10px'
                            }}
                            title="复盘此历史突破信号"
                          >
                            <span>复盘</span>
                            <ExternalLink size={9} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
