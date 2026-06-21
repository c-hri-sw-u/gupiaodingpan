export interface ScanParams {
  [key: string]: any;
  // 阶段启用开关
  p1_enabled: boolean;              // 启用阶段一：趋势初现及首波上攻
  p2_enabled: boolean;              // 启用阶段二：中期整理与回撤
  p2_requirePit: boolean;           // (旧参数，保留防兼容报错)
  p3_pullback_enabled: boolean;     // 启用阶段三：深度回落与清洗（踩年线）
  p3_enabled: boolean;              // 是否需要完成阶段四突破（若启用则要求突破，若禁用则匹配到最新阶段蓄势状态即可）

  // Phase 1: 启动位置与连板形态
  p1_maPeriod: number;              // 均线周期，默认 250 (年线)
  p1_maxOffsetPct: number;          // (旧参数，保留防兼容报错)
  p1_minOffsetPct: number;          // (旧参数，保留防兼容报错)
  p1_checkAboveMa: boolean;         // 是否限制在年线之上，默认 true
  p1_limitUpDays: number;           // 涨停板连板天数，默认 3
  p1_limitUpPct: number;            // 涨停板幅度阈值，默认 9.5
  p1_checkTBoard: boolean;          // 最后一个涨停是否为T字涨停
  p1_tBoardMaxRealBodyPct: number;  // T字涨停实体最大占比 (%，相对前收)

  // Phase 2: 回落60日线
  p2_maPeriod: number;              // 阶段二依托均线，默认 60
  p2_nearThresholdPct: number;      // 靠近 60 日线的偏离度阈值，默认 3.0 (%)
  p2_aboveDurationMin: number;      // (旧参数，保留防兼容报错)
  p2_aboveDurationMax: number;      // (旧参数，保留防兼容报错)
  p2_pitDurationMin: number;        // (旧参数，保留防兼容报错)
  p2_pitDurationMax: number;        // (旧参数，保留防兼容报错)
  p2_maxPitDropPct: number;         // (旧参数，保留防兼容报错)
  p2_maConvergencePct: number;      // (旧参数，保留防兼容报错)

  // Phase 3 & 4: 回落年线与突破
  p3_maPeriod: number;              // 阶段三依托均线，默认 250 (年线)
  p3_nearThresholdPct: number;      // 靠近年线的偏离度阈值，默认 3.0 (%)
  p3_refPriceSource: 'day3_close' | 'day3_high' | 'p2_high'; // (旧参数，保留防兼容报错)
  p3_gapUpOpen: boolean;            // 是否跳空高开，默认 true
  p3_minOpenDiffPct: number;        // (旧参数，保留防兼容报错)
  p3_maxTriggerDays: number;        // 阶段三回落后，必须在多少天内突破，默认 15 (天)
}

export interface KlinePoint {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  turnoverRate: number;
  // Computed indicators
  ma: Record<number, number>; // e.g., ma[60], ma[250]
  changePct: number;         // 涨跌幅 (%)
}

export interface ChartAnnotation {
  type: 'area' | 'point' | 'line';
  name: string;
  label?: string;
  xAxis?: string;
  yAxis?: number;
  startAxis?: string;
  endAxis?: string;
  color?: string;
  symbol?: 'circle' | 'pin' | 'arrow' | 'none';
  position?: 'top' | 'bottom' | 'insideTop' | 'insideBottom';
}

export interface MatchResult {
  code: string;
  name: string;
  p1_startDate: string;  // 连板第一天
  p1_endDate: string;    // 连板最后一天 (第3个板)
  p2_aboveStart: string; // 站稳MA60开始
  p2_pitStart: string;   // 下穿支撑均线开始 (下穿整理开始/若无则显示'围绕均线横盘')
  p2_recoverDate: string;// 重新收复支撑均线且收敛日
  p3_breakDate: string;  // 突破确认日 (若P3禁用则为 '待突破')
  refPrice: number;      // 突破的参考价
  breakOpenPrice: number;// 突破当天的开盘价
  notes: string;         // 技术特征分析说明
  klineData: KlinePoint[];// 带MA的完整日K线数据，方便前端渲染
  annotations?: ChartAnnotation[]; // 通用图表标记数据
}

export interface UIControlOption {
  label: string;
  value: any;
}

export interface UIControl {
  id: string;
  type: 'slider' | 'checkbox' | 'select';
  label: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: any;
  options?: UIControlOption[];
  group: string;
  tooltip?: string;
}

export interface UIControlGroup {
  name: string;
  enabledParam?: string;
  icon?: 'flame' | 'layers' | 'zap' | 'settings';
}

export interface Rule {
  id: string;
  name: string;
  params: Record<string, any>;
  uiControls?: UIControl[];
  uiGroups?: UIControlGroup[];
  userPrompt?: string;         // 初始自然语言输入
  refinedPrompt?: string;      // 模型返回完善后的 Prompt / 确认方案 HTML 说明
  customFilterCode?: string;   // 规则算法核心 JS 代码
}

/**
 * 计算简单移动平均线 (SMA)
 */
export function calculateMA(klines: any[], period: number): number[] {
  const ma: number[] = [];
  let sum = 0;
  for (let i = 0; i < klines.length; i++) {
    const close = klines[i][2]; // Close price is at index 2
    sum += close;
    if (i >= period) {
      sum -= klines[i - period][2];
      ma.push(Number((sum / period).toFixed(3)));
    } else if (i === period - 1) {
      ma.push(Number((sum / period).toFixed(3)));
    } else {
      ma.push(NaN); // Not enough data
    }
  }
  return ma;
}

/**
 * 判断是否是涨停板
 */
export function isLimitUp(close: number, prevClose: number, code: string, thresholdPct: number = 9.5): boolean {
  let expectedLimit = 0.10;
  if (code.startsWith('300') || code.startsWith('688')) {
    expectedLimit = 0.20;
  } else if (code.startsWith('8') || code.startsWith('4')) {
    expectedLimit = 0.30;
  }
  
  const theoreticalLimitPrice = Number((prevClose * (1 + expectedLimit)).toFixed(2));
  const currentGain = ((close - prevClose) / prevClose) * 100;
  return close >= theoreticalLimitPrice - 0.01 || currentGain >= thresholdPct * (expectedLimit / 0.10);
}

/**
 * 判断是否为T字涨停：开盘≈收盘≈涨停价（实体极小），盘中下探后再封回（有明显下影线）
 */
export function isTBoardLimitUp(
  kline: KlinePoint,
  prevClose: number,
  code: string,
  limitThresholdPct: number,
  maxRealBodyPct: number
): boolean {
  if (!isLimitUp(kline.close, prevClose, code, limitThresholdPct)) {
    return false;
  }

  const realBodyPct = (Math.abs(kline.close - kline.open) / prevClose) * 100;
  if (realBodyPct > maxRealBodyPct) {
    return false;
  }

  const lowerShadow = Math.min(kline.open, kline.close) - kline.low;
  if (lowerShadow <= 0) {
    return false;
  }

  const lowerShadowPct = (lowerShadow / prevClose) * 100;
  return lowerShadowPct >= 0.5;
}

/**
 * 全量数据格式化并计算均线
 */
export function preprocessKlines(_code: string, rawKlines: any[]): KlinePoint[] {
  const ma5 = calculateMA(rawKlines, 5);
  const ma10 = calculateMA(rawKlines, 10);
  const ma20 = calculateMA(rawKlines, 20);
  const ma30 = calculateMA(rawKlines, 30);
  const ma60 = calculateMA(rawKlines, 60);
  const ma120 = calculateMA(rawKlines, 120);
  const ma250 = calculateMA(rawKlines, 250);

  return rawKlines.map((item, index) => {
    const prevClose = index > 0 ? rawKlines[index - 1][2] : item[1];
    const changePct = index > 0 ? Number((((item[2] - prevClose) / prevClose) * 100).toFixed(2)) : 0;
    
    return {
      date: item[0],
      open: item[1],
      close: item[2],
      high: item[3],
      low: item[4],
      volume: item[5],
      amount: item[6],
      turnoverRate: item[7],
      changePct,
      ma: {
        5: ma5[index],
        10: ma10[index],
        20: ma20[index],
        30: ma30[index],
        60: ma60[index],
        120: ma120[index],
        250: ma250[index]
      }
    };
  });
}

/**
 * 模式扫描与匹配算法
 */
export function scanStockPattern(
  code: string,
  name: string,
  rawKlines: any[],
  params: ScanParams
): MatchResult | null {
  if (!rawKlines || rawKlines.length < 250) {
    return null; // 需要年线数据，至少需要250个交易日
  }

  const klines = preprocessKlines(code, rawKlines);
  const len = klines.length;

  const N = params.p1_limitUpDays ?? 3;
  const p1_ma = params.p1_maPeriod ?? 250;
  const p1_limit_pct = params.p1_limitUpPct ?? 9.5;
  const p2_ma = params.p2_maPeriod ?? 60;
  const p2_threshold = (params.p2_nearThresholdPct ?? 3.0) / 100;
  const p3_ma = params.p3_maPeriod ?? 250;
  const p3_threshold = (params.p3_nearThresholdPct ?? 3.0) / 100;
  const max_trigger = params.p3_maxTriggerDays ?? 15;

  // 遍历历史K线寻找匹配点。i为阶段一（连板）结束的那个交易日索引
  // 我们留出足够的空间来计算250日均线，且最后留出一些空间供回落和突破判断
  for (let i = 250; i < len - 2; i++) {
    // 1. 阶段一：连板形态检测
    let isP1Valid = true;
    for (let j = 0; j < N; j++) {
      const idx = i - N + 1 + j;
      const prevIdx = idx - 1;
      
      // 判断是否涨停
      if (!isLimitUp(klines[idx].close, klines[prevIdx].close, code, p1_limit_pct)) {
        isP1Valid = false;
        break;
      }
      
      // 判断是否在年线（250日均线）上方
      if (params.p1_checkAboveMa) {
        const ma250 = klines[idx].ma[p1_ma];
        if (isNaN(ma250) || klines[idx].close <= ma250) {
          isP1Valid = false;
          break;
        }
      }
    }
    if (!isP1Valid) continue;

    if (params.p1_checkTBoard) {
      const maxRealBodyPct = params.p1_tBoardMaxRealBodyPct ?? 1.5;
      if (!isTBoardLimitUp(klines[i], klines[i - 1].close, code, p1_limit_pct, maxRealBodyPct)) {
        continue;
      }
    }

    // 连板的第四天（即第N+1天，索引为 i+1）收阴线
    const negPt = klines[i + 1];
    if (negPt.close >= negPt.open) {
      continue; // 必须是阴线（收盘价低于开盘价）
    }

    const p1_startDate = klines[i - N + 1].date;
    const p1_endDate = klines[i].date;
    const p1_last_limit_up_close = klines[i].close; // 第N个涨停的收盘价

    // 2. 阶段二：k线回落到60日线附近
    let p2_date = '';
    let p2_idx = -1;

    if (params.p2_enabled) {
      // 从第N+2天（索引 i+2）开始向后寻找
      for (let j = i + 2; j < len; j++) {
        const pt = klines[j];
        const ma60 = pt.ma[p2_ma];
        if (isNaN(ma60)) break;

        // 靠近均线：收盘价在均线附近，或者日K线的最高/最低价区间覆盖了均线范围
        const dev = Math.abs(pt.close - ma60) / ma60;
        const overlaps = pt.low <= ma60 * (1 + p2_threshold) && pt.high >= ma60 * (1 - p2_threshold);

        if (dev <= p2_threshold || overlaps) {
          p2_date = pt.date;
          p2_idx = j;
          break;
        }

        // 如果收盘跌破60日线超过10%，判定趋势破位，取消当前连板点的筛选
        if (pt.close < ma60 * 0.90) {
          break;
        }
      }
      if (!p2_date || p2_idx === -1) continue;
    } else {
      p2_date = klines[i + 1].date;
      p2_idx = i + 1;
    }

    // 3. 阶段三：k线回落到年线 (250日线) 附近
    let p3_date = '';
    let p3_idx = -1;

    if (params.p3_pullback_enabled) {
      // 从上一个阶段回落点之后开始向后寻找
      for (let k = p2_idx + 1; k < len; k++) {
        const pt = klines[k];
        const ma250 = pt.ma[p3_ma];
        if (isNaN(ma250)) break;

        const dev = Math.abs(pt.close - ma250) / ma250;
        const overlaps = pt.low <= ma250 * (1 + p3_threshold) && pt.high >= ma250 * (1 - p3_threshold);

        if (dev <= p3_threshold || overlaps) {
          p3_date = pt.date;
          p3_idx = k;
          break;
        }

        // 如果收盘跌破年线超过10%，判定破位，取消筛选
        if (pt.close < ma250 * 0.90) {
          break;
        }
      }
      if (!p3_date || p3_idx === -1) continue;
    } else {
      p3_date = p2_date;
      p3_idx = p2_idx;
    }

    // 4. 阶段四：k线跳空高开, 收盘价高于第三个（第N个）涨停的收盘价
    
    // 构建通用图表标记数据
    const annotations: ChartAnnotation[] = [];
    if (p1_startDate && p1_endDate) {
      annotations.push({
        type: 'area',
        name: '① 涨停阶段',
        startAxis: p1_startDate,
        endAxis: p1_endDate
      });
    }
    
    const p2_start = klines[i + 1].date;
    const p2_end = params.p2_enabled ? p2_date : '';
    if (p2_start && p2_end) {
      annotations.push({
        type: 'area',
        name: '② 回踩60日',
        startAxis: p2_start,
        endAxis: p2_end
      });
    }
    
    const p3_start = p2_end;
    const p3_end = params.p3_pullback_enabled ? p3_date : '';
    if (p3_start && p3_end) {
      annotations.push({
        type: 'area',
        name: '③ 回踩年线',
        startAxis: p3_start,
        endAxis: p3_end
      });
    }

    if (klines[i + 1].date) {
      annotations.push({
        type: 'point',
        name: '阴线日',
        label: '① 阴线',
        xAxis: klines[i + 1].date,
        position: 'top'
      });
    }

    if (params.p2_enabled && p2_date) {
      annotations.push({
        type: 'point',
        name: '回落60日线',
        label: '② 回踩60日',
        xAxis: p2_date,
        position: 'top'
      });
    }

    if (params.p3_pullback_enabled && p3_date) {
      annotations.push({
        type: 'point',
        name: '回落年线',
        label: '③ 回踩年线',
        xAxis: p3_date,
        position: 'bottom'
      });
    }

    if (p1_last_limit_up_close) {
      annotations.push({
        type: 'line',
        name: '参考阻力位',
        label: `阻力 ${p1_last_limit_up_close.toFixed(2)}`,
        yAxis: Number(p1_last_limit_up_close.toFixed(2))
      });
    }

    // 如果没有启用突破确认，直接把当前阶段当成蓄势状态输出
    if (!params.p3_enabled) {
      const notesParts = [`阶段一于 ${p1_startDate} 启动连续 ${N} 个涨停，随后在 ${klines[i + 1].date} 收阴。`];
      if (params.p2_enabled) {
        notesParts.push(`阶段二于 ${p2_date} 成功回落至 ${p2_ma} 日线附近支撑。`);
      }
      if (params.p3_pullback_enabled) {
        notesParts.push(`阶段三于 ${p3_date} 再次回落至 ${p3_ma} 日年线附近支撑。`);
      }
      if (params.p2_enabled || params.p3_pullback_enabled) {
        notesParts.push(`形态已完成洗盘，处于突破蓄势状态。`);
      } else {
        notesParts.push(`当前处于阴线蓄势状态。`);
      }

      return {
        code,
        name,
        p1_startDate,
        p1_endDate,
        p2_aboveStart: klines[i + 1].date, // 阴线日
        p2_pitStart: params.p2_enabled ? p2_date : '', 
        p2_recoverDate: params.p3_pullback_enabled ? p3_date : '',
        p3_breakDate: '蓄势待突破',
        refPrice: Number(p1_last_limit_up_close.toFixed(2)),
        breakOpenPrice: 0,
        notes: notesParts.join(' '),
        klineData: klines,
        annotations
      };
    }

    let p4_date = '';
    let break_open = 0;
    const maxScanIdx = Math.min(p3_idx + 1 + max_trigger, len);

    for (let m = p3_idx + 1; m < maxScanIdx; m++) {
      const pt = klines[m];
      const prevPt = klines[m - 1];

      // 跳空高开：开盘价大于前一日收盘价
      let isGapUp = true;
      if (params.p3_gapUpOpen) {
        isGapUp = pt.open > prevPt.close;
      }

      // 收盘价高于阶段一第N个涨停收盘价
      if (isGapUp && pt.close > p1_last_limit_up_close) {
        p4_date = pt.date;
        break_open = pt.open;
        break;
      }
    }

    if (p4_date) {
      const notesParts = [`阶段一连续 ${N} 涨停后于 ${klines[i + 1].date} 收阴；`];
      if (params.p2_enabled) {
        notesParts.push(`阶段二于 ${p2_date} 回落 ${p2_ma} 日线；`);
      }
      if (params.p3_pullback_enabled) {
        notesParts.push(`阶段三于 ${p3_date} 回落 ${p3_ma} 日年线附近；`);
      }
      notesParts.push(`阶段四于 ${p4_date} 跳空高开突破连板前高 ${p1_last_limit_up_close.toFixed(2)} 元，确立突破信号。`);

      // 针对突破，追加突破点标记
      annotations.push({
        type: 'point',
        name: '突破点',
        label: '④ 高开突破',
        xAxis: p4_date,
        yAxis: break_open,
        position: 'top'
      });

      return {
        code,
        name,
        p1_startDate,
        p1_endDate,
        p2_aboveStart: klines[i + 1].date, // 阴线日
        p2_pitStart: params.p2_enabled ? p2_date : '', 
        p2_recoverDate: params.p3_pullback_enabled ? p3_date : '',
        p3_breakDate: p4_date,
        refPrice: Number(p1_last_limit_up_close.toFixed(2)),
        breakOpenPrice: break_open,
        notes: notesParts.join(''),
        klineData: klines,
        annotations
      };
    }
  }

  return null;
}

