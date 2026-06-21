import React, { useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { MatchResult, KlinePoint, preprocessKlines } from '../utils/scannerEngine';
import { TrendingUp } from 'lucide-react';

interface StockChartProps {
  matchResult: MatchResult | null;
  currentStock: { code: string; name: string; klines: any[] } | null;
}

export const StockChart: React.FC<StockChartProps> = ({ matchResult, currentStock }) => {
  const chartRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeZoomRef = useRef<{ start: number; end: number } | null>(null);
  const lastStockCodeRef = useRef<string | null>(null);
  const lastBreakDateRef = useRef<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const chartInstance = chartRef.current?.getEchartsInstance();
      if (!chartInstance) return;

      const deltaX = e.deltaX;
      const deltaY = e.deltaY;

      // Intercept horizontal scrolling for panning
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        e.preventDefault();
        e.stopPropagation();

        const option = chartInstance.getOption();
        const dataZoom = option.dataZoom;
        if (!dataZoom || !dataZoom[0]) return;

        const currentStart = dataZoom[0].start;
        const currentEnd = dataZoom[0].end;
        if (currentStart === undefined || currentEnd === undefined) return;

        const range = currentEnd - currentStart;
        const containerWidth = container.clientWidth || 800;
        // Natural panning speed multiplier based on client screen width
        const deltaPercent = (deltaX / containerWidth) * range * 1.2;

        let newStart = currentStart + deltaPercent;
        let newEnd = currentEnd + deltaPercent;

        if (newStart < 0) {
          newStart = 0;
          newEnd = range;
        } else if (newEnd > 100) {
          newEnd = 100;
          newStart = 100 - range;
        }

        chartInstance.dispatchAction({
          type: 'dataZoom',
          start: newStart,
          end: newEnd
        });
      }
    };

    // Listen in capture phase to intercept before ECharts' default handler zooms on deltaX
    container.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [currentStock]);

  // If no stock is selected, show empty state
  if (!currentStock) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
        <TrendingUp size={48} style={{ marginBottom: '16px', opacity: 0.5, color: 'var(--accent-blue)' }} />
        <h3>暂无选中股票</h3>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '8px' }}>
          从右侧扫描结果列表选择个股，或者在上方实时查询
        </p>
      </div>
    );
  }

  // If we have a stock but no match, pre-calculate its technical indicators for display anyway
  let klines: KlinePoint[] = [];
  if (matchResult && matchResult.code === currentStock.code) {
    klines = matchResult.klineData;
  } else {
    // Basic calculation for raw display if no match
    klines = preprocessKlines(currentStock.code, currentStock.klines);
  }

  // Extract ECharts datasets
  const dates = klines.map(x => x.date);
  
  // Reset zoom state if stock code or selected breakout date changes
  if (lastStockCodeRef.current !== currentStock.code || lastBreakDateRef.current !== (matchResult?.p3_breakDate || null)) {
    lastStockCodeRef.current = currentStock.code;
    lastBreakDateRef.current = matchResult?.p3_breakDate || null;
    activeZoomRef.current = null;
  }

  // Calculate dynamic dataZoom start/end percentages
  let zoomStart = Math.max(0, 100 - (180 / dates.length) * 100);
  let zoomEnd = 100;

  if (activeZoomRef.current) {
    zoomStart = activeZoomRef.current.start;
    zoomEnd = activeZoomRef.current.end;
  } else {
    if (matchResult && matchResult.code === currentStock.code && matchResult.p3_breakDate && matchResult.p3_breakDate !== '蓄势待突破') {
      const breakIdx = klines.findIndex(x => x.date === matchResult.p3_breakDate);
      if (breakIdx !== -1) {
        // Show 110 trading days before the breakout and 40 trading days after
        const startIdx = Math.max(0, breakIdx - 110);
        const endIdx = Math.min(klines.length - 1, breakIdx + 40);
        zoomStart = (startIdx / klines.length) * 100;
        zoomEnd = (endIdx / klines.length) * 100;
      }
    }
    activeZoomRef.current = { start: zoomStart, end: zoomEnd };
  }

  const candlestickData = klines.map(x => [x.open, x.close, x.low, x.high]);
  const volumes = klines.map((x) => {
    const isUp = x.close >= x.open;
    return {
      value: x.volume,
      itemStyle: {
        color: isUp ? '#e11d48' : '#10b981'
      }
    };
  });

  const ma5 = klines.map(x => x.ma[5]);
  const ma10 = klines.map(x => x.ma[10]);
  const ma20 = klines.map(x => x.ma[20]);
  const ma30 = klines.map(x => x.ma[30]);
  const ma60 = klines.map(x => x.ma[60]);
  const ma120 = klines.map(x => x?.ma?.[120] || NaN);
  const ma250 = klines.map(x => x.ma[250]);

  // Construct Phase Markers & Areas if matched
  const markAreas: any[] = [];
  const markPoints: any[] = [];
  const markLines: any[] = [];


  if (matchResult && matchResult.code === currentStock.code) {
    if (matchResult.annotations && matchResult.annotations.length > 0) {
      // 🌟 使用通用动态标记渲染图表元素
      matchResult.annotations.forEach(ann => {
        // 1. 区域 (Area)
        if (ann.type === 'area' && ann.startAxis && ann.endAxis) {
          markAreas.push([
            {
              name: ann.name,
              xAxis: ann.startAxis,
              itemStyle: {
                color: ann.color || (ann.name.includes('①') || ann.name.includes('涨停') ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.02)'),
                borderColor: 'rgba(255, 255, 255, 0.06)',
                borderWidth: 0
              },
              label: {
                color: 'rgba(255, 255, 255, 0.9)',
                position: ann.position || 'insideTop',
                align: 'left',
                verticalAlign: 'bottom',
                offset: [0, 0],
                fontSize: 10,
                fontWeight: 'bold',
                rotate: 45
              }
            },
            {
              xAxis: ann.endAxis
            }
          ]);
        }
        // 2. 标志点 (Point)
        else if (ann.type === 'point' && ann.xAxis) {
          const yVal = ann.yAxis !== undefined 
            ? ann.yAxis 
            : (klines.find(x => x.date === ann.xAxis)?.close || 0);

          markPoints.push({
            name: ann.name,
            xAxis: ann.xAxis,
            yAxis: yVal,
            value: ann.label || ann.name,
            symbol: ann.symbol || 'circle',
            symbolSize: 12,
            itemStyle: {
              color: 'rgba(255,255,255,0.0)',
              borderColor: ann.color || 'rgba(255, 255, 255, 0.85)',
              borderWidth: 2
            },
            label: {
              show: true,
              position: ann.position || 'top',
              backgroundColor: 'transparent',
              borderWidth: 0,
              padding: [1, 3],
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: 10,
              fontWeight: 'bold',
              formatter: ann.label || ann.name
            }
          });
        }
        // 3. 辅助线 (Line)
        else if (ann.type === 'line') {
          if (ann.yAxis !== undefined) {
            markLines.push({
              name: ann.name,
              yAxis: ann.yAxis,
              lineStyle: {
                color: ann.color || 'rgba(255, 255, 255, 0.25)',
                type: 'dashed',
                width: 1
              },
              label: {
                formatter: ann.label || `${ann.name} ${ann.yAxis}`,
                position: 'insideEndTop',
                color: 'rgba(200, 200, 210, 0.7)',
                fontSize: 9,
                fontWeight: 'normal'
              }
            });
          } else if (ann.xAxis) {
            markLines.push({
              name: ann.name,
              xAxis: ann.xAxis,
              lineStyle: {
                color: ann.color || 'rgba(255, 255, 255, 0.25)',
                type: 'dashed',
                width: 1
              },
              label: {
                formatter: ann.label || ann.name,
                position: 'insideEndTop',
                color: 'rgba(200, 200, 210, 0.7)',
                fontSize: 9,
                fontWeight: 'normal'
              }
            });
          }
        }
      });
    } else {
      // 🌟 兜底：使用原有的硬编码绘制逻辑
      // 1. Phase 1 Area (Breakout: p1_startDate -> p1_endDate)
      if (matchResult.p1_startDate && matchResult.p1_endDate) {
        markAreas.push([
          {
            name: '① 涨停阶段',
            xAxis: matchResult.p1_startDate,
            itemStyle: {
              color: 'rgba(255, 255, 255, 0.03)',
              borderColor: 'rgba(255, 255, 255, 0.06)',
              borderWidth: 0
            },
            label: {
              color: 'rgba(255, 255, 255, 0.9)',
              position: 'insideTop',
              align: 'left',
              verticalAlign: 'bottom',
              offset: [0, 0],
              fontSize: 10,
              fontWeight: 'bold',
              rotate: 45
            }
          },
          {
            xAxis: matchResult.p1_endDate
          }
        ]);
      }

      // 2. Phase 2 Area (p2_aboveStart -> p2_pitStart)
      if (matchResult.p2_aboveStart && matchResult.p2_pitStart) {
        markAreas.push([
          {
            name: '② 回踩60日',
            xAxis: matchResult.p2_aboveStart,
            itemStyle: {
              color: 'rgba(255, 255, 255, 0.02)',
              borderWidth: 0
            },
            label: {
              color: 'rgba(255, 255, 255, 0.9)',
              position: 'insideTop',
              align: 'left',
              verticalAlign: 'bottom',
              offset: [0, 0],
              fontSize: 10,
              fontWeight: 'bold',
              rotate: 45
            }
          },
          {
            xAxis: matchResult.p2_pitStart
          }
        ]);
      }

      // 3. Phase 3 Area (p2_pitStart -> p2_recoverDate)
      if (matchResult.p2_pitStart && matchResult.p2_recoverDate) {
        markAreas.push([
          {
            name: '③ 回踩年线',
            xAxis: matchResult.p2_pitStart,
            itemStyle: {
              color: 'rgba(255, 255, 255, 0.02)',
              borderWidth: 0
            },
            label: {
              color: 'rgba(255, 255, 255, 0.9)',
              position: 'insideTop',
              align: 'left',
              verticalAlign: 'bottom',
              offset: [0, 0],
              fontSize: 10,
              fontWeight: 'bold',
              rotate: 45
            }
          },
          {
            xAxis: matchResult.p2_recoverDate
          }
        ]);
      }

      // 4. Mark points for Key Nodes
      // 阴线日 (阶段一后一天)
      if (matchResult.p2_aboveStart) {
        markPoints.push({
          name: '阴线日',
          xAxis: matchResult.p2_aboveStart,
          yAxis: klines.find(x => x.date === matchResult.p2_aboveStart)?.close || 0,
          value: '①',
          symbol: 'circle',
          symbolSize: 12,
          itemStyle: {
            color: 'rgba(255,255,255,0.0)',
            borderColor: 'rgba(255, 255, 255, 0.85)',
            borderWidth: 2
          },
          label: {
            show: true,
            position: 'top',
            backgroundColor: 'transparent',
            borderWidth: 0,
            padding: [1, 3],
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: 10,
            fontWeight: 'bold',
            formatter: '① 阴线'
          }
        });
      }

      // 回落60日线附近点 (阶段二)
      if (matchResult.p2_pitStart) {
        markPoints.push({
          name: '回落60日线',
          xAxis: matchResult.p2_pitStart,
          yAxis: klines.find(x => x.date === matchResult.p2_pitStart)?.close || 0,
          value: '②',
          symbol: 'circle',
          symbolSize: 12,
          itemStyle: {
            color: 'rgba(255,255,255,0.0)',
            borderColor: 'rgba(255, 255, 255, 0.85)',
            borderWidth: 2
          },
          label: {
            show: true,
            position: 'top',
            backgroundColor: 'transparent',
            borderWidth: 0,
            padding: [1, 3],
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: 10,
            fontWeight: 'bold',
            formatter: '② 回踩60日'
          }
        });
      }

      // 回落年线附近点 (阶段三)
      if (matchResult.p2_recoverDate) {
        markPoints.push({
          name: '回落年线',
          xAxis: matchResult.p2_recoverDate,
          yAxis: klines.find(x => x.date === matchResult.p2_recoverDate)?.close || 0,
          value: '③',
          symbol: 'circle',
          symbolSize: 12,
          itemStyle: {
            color: 'rgba(255,255,255,0.0)',
            borderColor: 'rgba(255, 255, 255, 0.85)',
            borderWidth: 2
          },
          label: {
            show: true,
            position: 'bottom',
            backgroundColor: 'transparent',
            borderWidth: 0,
            padding: [1, 3],
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: 10,
            fontWeight: 'bold',
            formatter: '③ 回踩年线'
          }
        });
      }

      if (matchResult.p3_breakDate && matchResult.p3_breakDate !== '蓄势待突破') {
        const breakPt = klines.find(x => x.date === matchResult.p3_breakDate);
        markPoints.push({
          name: '突破点',
          xAxis: matchResult.p3_breakDate,
          yAxis: breakPt ? breakPt.open : 0,
          value: '④',
          symbol: 'circle',
          symbolSize: 12,
          itemStyle: {
            color: 'rgba(255,255,255,0.0)',
            borderColor: 'rgba(255, 255, 255, 0.85)',
            borderWidth: 2
          },
          label: {
            show: true,
            position: 'top',
            backgroundColor: 'transparent',
            borderWidth: 0,
            padding: [1, 3],
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: 10,
            fontWeight: 'bold',
            formatter: '④ 高开突破'
          }
        });
      }

      // 5. Horizontal resistance line
      if (matchResult.refPrice) {
        markLines.push({
          name: '参考阻力位',
          yAxis: matchResult.refPrice,
          lineStyle: {
            color: 'rgba(255, 255, 255, 0.25)',
            type: 'dashed',
            width: 1
          },
          label: {
            formatter: `阻力 ${matchResult.refPrice}`,
            position: 'insideEndTop',
            color: 'rgba(200, 200, 210, 0.7)',
            fontSize: 9,
            fontWeight: 'normal'
          }
        });
      }
    }
  }

  // Setup ECharts options
  const option = {
    animation: false,
    backgroundColor: 'transparent',
    title: {
      text: `${currentStock.name} (${currentStock.code})`,
      left: 10,
      top: 10,
      textStyle: {
        color: '#f3f4f6',
        fontSize: 14,
        fontFamily: 'var(--font-sans)',
        fontWeight: 'bold'
      }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: '#18181b'
        }
      },
      backgroundColor: 'rgba(20, 20, 25, 0.95)',
      borderColor: 'rgba(255,255,255,0.06)',
      textStyle: {
        color: '#f3f4f6',
        fontSize: 11,
        fontFamily: 'var(--font-mono)'
      },
      formatter: function (params: any) {
        let res = params[0].name + '<br/>';
        params.forEach((item: any) => {
          if (item.seriesName === 'K线') {
            const data = item.data; // [index, open, close, low, high]
            res += `<span style="color:var(--text-muted)">开:</span> ${data[1]} &nbsp;&nbsp; <span style="color:var(--text-muted)">收:</span> ${data[2]}<br/>`;
            res += `<span style="color:var(--text-muted)">低:</span> ${data[3]} &nbsp;&nbsp; <span style="color:var(--text-muted)">高:</span> ${data[4]}<br/>`;
            
            // Calc daily gain
            const pt = klines[item.dataIndex];
            const color = pt.changePct >= 0 ? '#e11d48' : '#10b981';
            res += `<span style="color:var(--text-muted)">涨幅:</span> <span style="color:${color};font-weight:bold">${pt.changePct}%</span> &nbsp;&nbsp; `;
            res += `<span style="color:var(--text-muted)">换手:</span> ${pt.turnoverRate}%<br/>`;
          } else {
            if (item.value !== undefined && !isNaN(item.value)) {
              res += `${item.marker} ${item.seriesName}: ${item.value}<br/>`;
            }
          }
        });
        return res;
      }
    },
    legend: {
      data: ['K线', 'MA5', 'MA10', 'MA20', 'MA30', 'MA60', 'MA120', 'MA250'],
      top: 12,
      right: 10,
      textStyle: {
        color: 'var(--text-muted)',
        fontSize: 10
      }
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }]
    },
    grid: [
      {
        left: '5%',
        right: '4%',
        top: '12%',
        height: '56%'
      },
      {
        left: '5%',
        right: '4%',
        top: '75%',
        height: '15%'
      }
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { onZero: false, lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        splitLine: { show: false },
        axisLabel: { color: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--font-mono)' },
        axisPointer: {
          label: {
            show: true
          }
        }
      },
      {
        type: 'category',
        gridIndex: 1,
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false }
      }
    ],
    yAxis: [
      {
        scale: true,
        splitArea: {
          show: false
        },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
        axisLabel: { color: 'var(--text-muted)', fontSize: 9, fontFamily: 'var(--font-mono)' }
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false }
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: [0, 1],
        start: zoomStart,
        end: zoomEnd
      },
      {
        show: true,
        xAxisIndex: [0, 1],
        type: 'slider',
        top: '92%',
        height: 16,
        borderColor: 'rgba(255,255,255,0.03)',
        fillerColor: 'rgba(255, 255, 255, 0.04)',
        handleStyle: {
          color: 'rgba(255, 255, 255, 0.2)'
        },
        textStyle: {
          color: 'var(--text-muted)',
          fontSize: 9,
          fontFamily: 'var(--font-mono)'
        },
        start: zoomStart,
        end: zoomEnd
      }
    ],
    series: [
      {
        name: 'K线',
        type: 'candlestick',
        data: candlestickData,
        itemStyle: {
          color: '#e11d48',
          color0: '#10b981',
          borderColor: '#e11d48',
          borderColor0: '#10b981'
        },
        markArea: {
          data: markAreas
        },
        markPoint: {
          data: markPoints
        },
        markLine: {
          data: markLines
        }
      },
      {
        name: 'MA5',
        type: 'line',
        data: ma5,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#f59e0b' },
        lineStyle: { opacity: 0.8, width: 1, color: '#f59e0b' }
      },
      {
        name: 'MA10',
        type: 'line',
        data: ma10,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#10b981' },
        lineStyle: { opacity: 0.8, width: 1, color: '#10b981' }
      },
      {
        name: 'MA20',
        type: 'line',
        data: ma20,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#3b82f6' },
        lineStyle: { opacity: 0.8, width: 1.2, color: '#3b82f6' }
      },
      {
        name: 'MA30',
        type: 'line',
        data: ma30,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#ec4899' },
        lineStyle: { opacity: 0.8, width: 1.2, color: '#ec4899' }
      },
      {
        name: 'MA60',
        type: 'line',
        data: ma60,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#8b5cf6' },
        lineStyle: { opacity: 0.85, width: 1.5, color: '#8b5cf6' }
      },
      {
        name: 'MA120',
        type: 'line',
        data: ma120,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#06b6d4' },
        lineStyle: { opacity: 0.85, width: 1.5, color: '#06b6d4' }
      },
      {
        name: 'MA250',
        type: 'line',
        data: ma250,
        smooth: true,
        showSymbol: false,
        itemStyle: { color: '#6b7280' },
        lineStyle: { opacity: 0.9, width: 2.0, color: '#6b7280' }
      },
      {
        name: '成交量',
        type: 'bar',
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: volumes
      }
    ]
  };

  const onEvents = {
    'datazoom': () => {
      const chartInstance = chartRef.current?.getEchartsInstance();
      if (chartInstance) {
        const opt = chartInstance.getOption();
        const dz = opt.dataZoom;
        if (dz && dz[0]) {
          activeZoomRef.current = {
            start: dz[0].start,
            end: dz[0].end
          };
        }
      }
    }
  };

  return (
    <div ref={containerRef} style={{ height: '100%', width: '100%', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ReactECharts
          ref={chartRef}
          option={option}
          onEvents={onEvents}
          style={{ height: '100%', width: '100%' }}
          notMerge={true}
          lazyUpdate={true}
        />
      </div>

      {/* Risk Warning Disclaimer */}
      <div style={{
        padding: '6px 12px',
        background: 'rgba(251, 191, 36, 0.05)',
        borderTop: '1px solid rgba(251, 191, 36, 0.15)',
        fontSize: '10px',
        color: '#eab308',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        lineHeight: '1.4'
      }}>
        <span>⚠️ <strong>技术声明：</strong>背景色带与突破标记基于特定公式，不代表任何投资方向与诱导。</span>
      </div>

      {matchResult && matchResult.code === currentStock.code && (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderTop: '1px solid var(--border-light)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          lineHeight: '1.5',
          display: 'flex',
          gap: '6px',
          alignItems: 'flex-start'
        }}>
          <span style={{
            background: matchResult.p3_breakDate === '蓄势待突破' ? 'rgba(234, 179, 8, 0.08)' : 'rgba(225, 29, 72, 0.08)',
            border: matchResult.p3_breakDate === '蓄势待突破' ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(225, 29, 72, 0.3)',
            color: matchResult.p3_breakDate === '蓄势待突破' ? '#eab308' : '#f43f5e',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            fontWeight: 500,
            marginTop: '1px',
            whiteSpace: 'nowrap'
          }}>{matchResult.p3_breakDate === '蓄势待突破' ? '整理中' : '已匹配'}</span>
          <p>{matchResult.notes}</p>
        </div>
      )}
    </div>
  );
};
