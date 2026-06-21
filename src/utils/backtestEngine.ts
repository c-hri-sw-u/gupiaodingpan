import { ScanParams, preprocessKlines, isLimitUp, isTBoardLimitUp } from './scannerEngine';

export interface BacktestSignal {
  code: string;
  name: string;
  p1_startDate: string;
  p1_endDate: string;
  p2_aboveStart: string; // 阴线日
  p2_pitStart: string;   // 踩60日
  p2_recoverDate: string;// 踩年线
  p3_breakDate: string;  // 突破日
  buyPrice: number;
  refPrice: number;
  // returns & prices at 3, 5, 10, 20 trading days
  returns: Record<number, number | null>;
  prices: Record<number, number | null>;
  maxProfit: number;   // 20日内最大最高涨幅 (%)
  maxDrawdown: number; // 20日内最大最低回撤 (%)
}

export interface BacktestSummary {
  totalSignals: number;
  winRates: Record<number, number>;    // e.g., 3: 55.4 (%)
  avgReturns: Record<number, number>;  // e.g., 3: 2.1 (%)
  medianReturns: Record<number, number>; // e.g., 3: 1.2 (%)
  avgMaxProfit: number;
  avgMaxDrawdown: number;
  medianMaxProfit: number;
  medianMaxDrawdown: number;
}

export type BuyPriceType = 'open' | 'close' | 'ref';

function resolveBuyPrice(
  buyPriceType: BuyPriceType,
  refPrice: number,
  dayOpen: number,
  dayClose: number
): number {
  if (buyPriceType === 'open') return dayOpen;
  if (buyPriceType === 'ref') return refPrice;
  return dayClose;
}

/**
 * 扫描单只个股的所有历史四阶段突破买点，并统计买入后表现
 */
export function backtestStockPattern(
  code: string,
  name: string,
  rawKlines: any[],
  params: ScanParams,
  buyPriceType: BuyPriceType = 'close'
): BacktestSignal[] {
  if (!rawKlines || rawKlines.length < 250) {
    return [];
  }

  const klines = preprocessKlines(code, rawKlines);
  const len = klines.length;
  const signals: BacktestSignal[] = [];

  const N = params.p1_limitUpDays ?? 3;
  const p1_ma = params.p1_maPeriod ?? 250;
  const p1_limit_pct = params.p1_limitUpPct ?? 9.5;
  const p2_ma = params.p2_maPeriod ?? 60;
  const p2_threshold = (params.p2_nearThresholdPct ?? 3.0) / 100;
  const p3_ma = params.p3_maPeriod ?? 250;
  const p3_threshold = (params.p3_nearThresholdPct ?? 3.0) / 100;
  const max_trigger = params.p3_maxTriggerDays ?? 15;

  let i = 250;
  while (i < len - 2) {
    // 1. 阶段一：连板形态检测
    let isP1Valid = true;
    for (let j = 0; j < N; j++) {
      const idx = i - N + 1 + j;
      const prevIdx = idx - 1;
      if (idx <= 0 || prevIdx < 0) {
        isP1Valid = false;
        break;
      }
      
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
    if (!isP1Valid) {
      i++;
      continue;
    }

    if (params.p1_checkTBoard) {
      const maxRealBodyPct = params.p1_tBoardMaxRealBodyPct ?? 1.5;
      if (!isTBoardLimitUp(klines[i], klines[i - 1].close, code, p1_limit_pct, maxRealBodyPct)) {
        i++;
        continue;
      }
    }

    // 连板的第四天（即第N+1天，索引为 i+1）收阴线
    if (i + 1 >= len) {
      i++;
      continue;
    }
    const negPt = klines[i + 1];
    if (negPt.close >= negPt.open) {
      i++;
      continue; // 必须是阴线（收盘价低于开盘价）
    }

    const p1_startDate = klines[i - N + 1].date;
    const p1_endDate = klines[i].date;
    const p1_last_limit_up_close = klines[i].close; // 第N个涨停的收盘价

    // 2. 阶段二：k线回落到60日线附近
    let p2_date = '';
    let p2_idx = -1;

    if (params.p2_enabled) {
      for (let j = i + 2; j < len; j++) {
        const pt = klines[j];
        const ma60 = pt.ma[p2_ma];
        if (isNaN(ma60)) break;

        const dev = Math.abs(pt.close - ma60) / ma60;
        const overlaps = pt.low <= ma60 * (1 + p2_threshold) && pt.high >= ma60 * (1 - p2_threshold);

        if (dev <= p2_threshold || overlaps) {
          p2_date = pt.date;
          p2_idx = j;
          break;
        }

        // 如果收盘跌破60日线超过10%，判定趋势破位，取消当前连板点
        if (pt.close < ma60 * 0.90) {
          break;
        }
      }
      if (!p2_date || p2_idx === -1) {
        i++;
        continue;
      }
    } else {
      p2_date = klines[i + 1].date;
      p2_idx = i + 1;
    }

    // 3. 阶段三：k线回落到年线附近
    let p3_date = '';
    let p3_idx = -1;

    if (params.p3_pullback_enabled) {
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
      if (!p3_date || p3_idx === -1) {
        i++;
        continue;
      }
    } else {
      p3_date = p2_date;
      p3_idx = p2_idx;
    }

    // 4. 定位买点及计入交易信号
    let buyIdx = -1;
    let buyDate = '';
    let buyPrice = 0;

    if (params.p3_enabled) {
      // 启用了阶段四：需要进行突破确认
      let p4_date = '';
      let p4_idx = -1;
      let break_open = 0;
      let break_close = 0;
      const maxScanIdx = Math.min(p3_idx + 1 + max_trigger, len);

      for (let m = p3_idx + 1; m < maxScanIdx; m++) {
        const pt = klines[m];
        const prevPt = klines[m - 1];

        let isGapUp = true;
        if (params.p3_gapUpOpen) {
          isGapUp = pt.open > prevPt.close;
        }

        if (isGapUp && pt.close > p1_last_limit_up_close) {
          p4_date = pt.date;
          p4_idx = m;
          break_open = pt.open;
          break_close = pt.close;
          break;
        }
      }

      if (p4_idx !== -1) {
        buyIdx = p4_idx;
        buyDate = p4_date;
        buyPrice = resolveBuyPrice(
          buyPriceType,
          p1_last_limit_up_close,
          break_open,
          break_close
        );
      }
    } else {
      // 禁用了阶段四：根据最后一个启用的阶段自动选择买点
      if (params.p3_pullback_enabled) {
        buyIdx = p3_idx;
        buyDate = p3_date;
      } else if (params.p2_enabled) {
        buyIdx = p2_idx;
        buyDate = p2_date;
      } else {
        buyIdx = i + 1; // 阶段一之后的首个阴线日
        buyDate = klines[buyIdx].date;
      }
      buyPrice = resolveBuyPrice(
        buyPriceType,
        p1_last_limit_up_close,
        klines[buyIdx].open,
        klines[buyIdx].close
      );
    }

    if (buyIdx !== -1) {
      // 计算买入后 3, 5, 10, 20 天的表现
      const targetDays = [3, 5, 10, 20];
      const returns: Record<number, number | null> = {};
      const prices: Record<number, number | null> = {};

      for (const d of targetDays) {
        const futureIdx = buyIdx + d;
        if (futureIdx < len) {
          const futurePrice = klines[futureIdx].close;
          prices[d] = futurePrice;
          returns[d] = Number((((futurePrice - buyPrice) / buyPrice) * 100).toFixed(2));
        } else {
          prices[d] = null;
          returns[d] = null;
        }
      }

      // 计算 20 日持仓期内的最大盈利 (最高价) 和最大回撤 (最低价)
      const lookbackEnd = Math.min(buyIdx + 20, len - 1);
      let maxHigh = buyPrice;
      let minLow = buyPrice;

      for (let index = buyIdx + 1; index <= lookbackEnd; index++) {
        if (klines[index].high > maxHigh) {
          maxHigh = klines[index].high;
        }
        if (klines[index].low < minLow) {
          minLow = klines[index].low;
        }
      }

      const maxProfit = Number((((maxHigh - buyPrice) / buyPrice) * 100).toFixed(2));
      const maxDrawdown = Number((((minLow - buyPrice) / buyPrice) * 100).toFixed(2));

      signals.push({
        code,
        name,
        p1_startDate,
        p1_endDate,
        p2_aboveStart: klines[i + 1].date,
        p2_pitStart: params.p2_enabled ? p2_date : '',
        p2_recoverDate: params.p3_pullback_enabled ? p3_date : '',
        p3_breakDate: buyDate, // 回测交易列表买入日显示为所选定位日期
        buyPrice,
        refPrice: Number(p1_last_limit_up_close.toFixed(2)),
        returns,
        prices,
        maxProfit,
        maxDrawdown
      });

      // 冷却 20 个交易日以检索下一个突破循环，避免重合建仓
      i = buyIdx + 20;
    } else {
      i++;
    }
  }

  return signals;
}

/** 回测模拟买入所依据的最后一个启用阶段 */
export function getBacktestBuyPhaseLabel(params: ScanParams): string {
  if (params.p3_enabled) return '阶段四';
  if (params.p3_pullback_enabled) return '阶段三';
  if (params.p2_enabled) return '阶段二';
  return '阶段一';
}

function getMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 统计回测信号的总合数据
 */
export function calculateBacktestSummary(signals: BacktestSignal[]): BacktestSummary {
  const totalSignals = signals.length;
  const targetDays = [3, 5, 10, 20];
  const winRates: Record<number, number> = {};
  const avgReturns: Record<number, number> = {};
  const medianReturns: Record<number, number> = {};

  let sumMaxProfit = 0;
  let sumMaxDrawdown = 0;
  const allMaxProfits: number[] = [];
  const allMaxDrawdowns: number[] = [];

  for (const d of targetDays) {
    let resolvedCount = 0;
    let winCount = 0;
    let totalReturn = 0;
    const dayReturns: number[] = [];

    for (const sig of signals) {
      const ret = sig.returns[d];
      if (ret !== null) {
        resolvedCount++;
        totalReturn += ret;
        dayReturns.push(ret);
        if (ret > 0) {
          winCount++;
        }
      }
    }

    winRates[d] = resolvedCount > 0 ? Number(((winCount / resolvedCount) * 100).toFixed(1)) : 0;
    avgReturns[d] = resolvedCount > 0 ? Number((totalReturn / resolvedCount).toFixed(2)) : 0;
    medianReturns[d] = resolvedCount > 0 ? Number(getMedian(dayReturns).toFixed(2)) : 0;
  }

  for (const sig of signals) {
    sumMaxProfit += sig.maxProfit;
    sumMaxDrawdown += sig.maxDrawdown;
    allMaxProfits.push(sig.maxProfit);
    allMaxDrawdowns.push(sig.maxDrawdown);
  }

  const avgMaxProfit = totalSignals > 0 ? Number((sumMaxProfit / totalSignals).toFixed(2)) : 0;
  const avgMaxDrawdown = totalSignals > 0 ? Number((sumMaxDrawdown / totalSignals).toFixed(2)) : 0;
  const medianMaxProfit = totalSignals > 0 ? Number(getMedian(allMaxProfits).toFixed(2)) : 0;
  const medianMaxDrawdown = totalSignals > 0 ? Number(getMedian(allMaxDrawdowns).toFixed(2)) : 0;

  return {
    totalSignals,
    winRates,
    avgReturns,
    medianReturns,
    avgMaxProfit,
    avgMaxDrawdown,
    medianMaxProfit,
    medianMaxDrawdown
  };
}
