import React from 'react';
import { MatchResult } from '../utils/scannerEngine';
import { Download, HelpCircle, ShoppingCart, Search } from 'lucide-react';

interface ResultListProps {
  results: MatchResult[];
  selectedCode: string | null;
  onSelectStock: (code: string) => void;
  isScanning: boolean;
  scanProgress: { current: number; total: number } | null;
  scanText?: string;
  metadata?: Record<string, { industry: string; totalCap: number; circCap: number; price: number }>;
  favorites: string[];
  favoriteNames?: Record<string, string>;
  onToggleFavorite: (code: string, name: string) => void;
  onClearFavorites?: () => void;
  onDiagnose?: () => void;
}

export const ResultList: React.FC<ResultListProps> = ({
  results,
  selectedCode,
  onSelectStock,
  isScanning,
  scanProgress,
  scanText,
  metadata = {},
  favorites = [],
  favoriteNames = {},
  onToggleFavorite,
  onClearFavorites,
  onDiagnose
}) => {
  const [activeTab, setActiveTab] = React.useState<'results' | 'favorites'>('results');
  const [filterIndustry, setFilterIndustry] = React.useState<string>('All');
  const [filterCap, setFilterCap] = React.useState<string>('All');
  const [filterPrice, setFilterPrice] = React.useState<string>('All');
  const [searchText, setSearchText] = React.useState<string>('');

  const { availableIndustries, industryStats } = React.useMemo(() => {
    const industries = new Set<string>();
    const matchedCounts: Record<string, number> = {};
    results.forEach(item => {
      const meta = metadata[item.code];
      if (meta?.industry) {
        industries.add(meta.industry);
        const ind = meta.industry;
        matchedCounts[ind] = (matchedCounts[ind] || 0) + 1;
      }
    });

    const marketCounts: Record<string, number> = {};
    Object.values(metadata).forEach(meta => {
      if (meta?.industry) {
        marketCounts[meta.industry] = (marketCounts[meta.industry] || 0) + 1;
      }
    });

    return {
      availableIndustries: Array.from(industries).sort(),
      industryStats: { matchedCounts, marketCounts }
    };
  }, [results, metadata]);

  // Reset filters if results change
  React.useEffect(() => {
    setFilterIndustry('All');
    setFilterCap('All');
    setFilterPrice('All');
    setSearchText('');
  }, [results]);

  const formatCap = (capInRgb: number) => {
    if (!capInRgb) return '暂无';
    if (capInRgb >= 100000000000) {
      return `${(capInRgb / 100000000000).toFixed(1)}千亿`;
    }
    if (capInRgb >= 100000000) {
      return `${(capInRgb / 100000000).toFixed(1)}亿`;
    }
    return `${(capInRgb / 10000).toFixed(0)}万`;
  };

  const filteredResults = React.useMemo(() => {
    return results.filter(item => {
      const meta = metadata[item.code];
      
      // 1. Filter Industry
      if (filterIndustry !== 'All') {
        const industryName = meta?.industry || '其它';
        if (industryName !== filterIndustry) return false;
      }
      
      // 2. Filter Cap
      if (filterCap !== 'All') {
        const capVal = meta?.totalCap || 0;
        if (filterCap === '<50') {
          if (capVal >= 5000000000) return false;
        } else if (filterCap === '50-100') {
          if (capVal < 5000000000 || capVal >= 10000000000) return false;
        } else if (filterCap === '100-200') {
          if (capVal < 10000000000 || capVal >= 20000000000) return false;
        } else if (filterCap === '>200') {
          if (capVal < 20000000000) return false;
        }
      }
      
      // 3. Filter Price
      if (filterPrice !== 'All') {
        const price = meta?.price || (item.klineData && item.klineData.length > 0 ? item.klineData[item.klineData.length - 1].close : item.refPrice);
        if (filterPrice === '<10') {
          if (price >= 10) return false;
        } else if (filterPrice === '10-30') {
          if (price < 10 || price >= 30) return false;
        } else if (filterPrice === '30-100') {
          if (price < 30 || price >= 100) return false;
        } else if (filterPrice === '>100') {
          if (price < 100) return false;
        }
      }

      // 4. Text Search
      if (searchText.trim()) {
        const query = searchText.toLowerCase().trim();
        const matchesCode = item.code.includes(query);
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesIndustry = meta?.industry ? meta.industry.toLowerCase().includes(query) : false;
        if (!matchesCode && !matchesName && !matchesIndustry) return false;
      }
      
      return true;
    });
  }, [results, metadata, filterIndustry, filterCap, filterPrice, searchText]);

  const filteredFavorites = React.useMemo(() => {
    return favorites.filter(code => {
      if (!searchText.trim()) return true;
      const query = searchText.toLowerCase().trim();
      const matchesCode = code.includes(query);
      const name = favoriteNames[code] || '自选股';
      const matchesName = name.toLowerCase().includes(query);
      const meta = metadata[code];
      const matchesIndustry = meta?.industry ? meta.industry.toLowerCase().includes(query) : false;
      return matchesCode || matchesName || matchesIndustry;
    });
  }, [favorites, favoriteNames, metadata, searchText]);

  const handleExportCSV = () => {
    if (results.length === 0) return;
    
    // Construct CSV Header and Content
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "代码,名称,启动日期,挖坑日期,突破日期,参考价格,突破开盘价,说明\n";
    
    results.forEach(item => {
      // Add ' prefix to stock code to prevent Excel from stripping leading zeros
      const codeStr = `'${item.code}`;
      const row = [
        codeStr,
        item.name,
        item.p1_startDate,
        item.p2_pitStart,
        item.p3_breakDate,
        item.refPrice,
        item.breakOpenPrice,
        `"${item.notes.replace(/"/g, '""')}"`
      ].join(",");
      csvContent += row + "\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `星轨盯盘_选股结果_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="glass-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tabs Switcher Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', marginBottom: '12px', gap: '12px' }}>
        <button
          onClick={() => setActiveTab('results')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'results' ? '2px solid var(--text-primary)' : '2px solid transparent',
            color: activeTab === 'results' ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '6px 8px 10px 8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none'
          }}
        >
          筛选结果 ({results.length})
        </button>
        <button
          onClick={() => setActiveTab('favorites')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'favorites' ? '2px solid var(--text-primary)' : '2px solid transparent',
            color: activeTab === 'favorites' ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '6px 8px 10px 8px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            outline: 'none'
          }}
        >
          自选股 ({favorites.length})
        </button>
      </div>

      {/* Search Input Box */}
      {((activeTab === 'results' && results.length > 0) || (activeTab === 'favorites' && favorites.length > 0)) && (
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <input
            type="text"
            placeholder={activeTab === 'results' ? "搜索代码/名称/行业过滤筛选结果" : "搜索自选股代码/名称"}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '28px',
              paddingRight: '10px',
              height: '28px',
              fontSize: '11px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-sm)',
              outline: 'none',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)'
            }}
          />
          <Search size={11} style={{ position: 'absolute', left: '10px', top: '8px', color: 'var(--text-muted)' }} />
        </div>
      )}

      {/* Conditional Header based on Active Tab */}
      {activeTab === 'results' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', marginBottom: '4px' }}>
          <div>
            <h2>技术形态筛选结果</h2>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              共筛选出 <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{results.length}</span> 只证券
              {filteredResults.length !== results.length && (
                <span> (已过滤显示 <span style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>{filteredResults.length}</span> 只)</span>
              )}
            </p>
          </div>
          
          {results.length > 0 && (
            <button 
              onClick={handleExportCSV}
              className="btn-secondary" 
              style={{ padding: '4px 8px', fontSize: '11px', height: '26px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="导出为自选CSV"
            >
              <Download size={12} />
              <span>导出</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', marginBottom: '4px' }}>
          <div>
            <h2>自选股监视列表</h2>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
              共收藏 <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{favorites.length}</span> 只证券
            </p>
          </div>
          
          {favorites.length > 0 && onClearFavorites && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm('确定要清空所有自选股吗？')) {
                  onClearFavorites();
                }
              }}
              className="btn-secondary" 
              style={{ padding: '4px 8px', fontSize: '11px', height: '26px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}
              title="清空自选股"
            >
              <span>清空</span>
            </button>
          )}
        </div>
      )}

      {/* Filter Options Panel - Only for results */}
      {activeTab === 'results' && !isScanning && results.length > 0 && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr 1fr', 
          gap: '6px', 
          marginBottom: '8px', 
          padding: '6px', 
          borderRadius: 'var(--radius-sm)', 
          background: 'var(--bg-input)', 
          border: '1px solid var(--border-light)' 
        }}>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>行业分类</label>
            <select 
              value={filterIndustry} 
              onChange={(e) => setFilterIndustry(e.target.value)}
              style={{ width: '100%', fontSize: '11px', padding: '2px 4px', height: '24px' }}
            >
              <option value="All">所有行业 ({results.length})</option>
              {availableIndustries.map(ind => {
                const matchedVal = industryStats.matchedCounts[ind] || 0;
                const marketVal = industryStats.marketCounts[ind] || 0;
                return (
                  <option key={ind} value={ind}>
                    {ind} ({matchedVal}{marketVal > 0 ? `/${marketVal}` : ''})
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>总市值</label>
            <select 
              value={filterCap} 
              onChange={(e) => setFilterCap(e.target.value)}
              style={{ width: '100%', fontSize: '11px', padding: '2px 4px', height: '24px' }}
            >
              <option value="All">全部市值</option>
              <option value="<50">&lt; 50 亿</option>
              <option value="50-100">50 - 100 亿</option>
              <option value="100-200">100 - 200 亿</option>
              <option value=">200">&gt; 200 亿</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>最新股价</label>
            <select 
              value={filterPrice} 
              onChange={(e) => setFilterPrice(e.target.value)}
              style={{ width: '100%', fontSize: '11px', padding: '2px 4px', height: '24px' }}
            >
              <option value="All">全部价格</option>
              <option value="<10">&lt; 10 元</option>
              <option value="10-30">10 - 30 元</option>
              <option value="30-100">30 - 100 元</option>
              <option value=">100">&gt; 100 元</option>
            </select>
          </div>
        </div>
      )}

      {/* Risk Alert Banner */}
      <div style={{ 
        fontSize: '10px', 
        color: '#eab308', 
        background: 'rgba(251, 191, 36, 0.05)', 
        padding: '8px 10px', 
        border: '1px solid rgba(251, 191, 36, 0.15)', 
        borderRadius: 'var(--radius-sm)',
        marginBottom: '8px', 
        lineHeight: '1.4' 
      }}>
        <strong>⚠️ 风险提示：</strong>
        形态筛选仅作为技术回溯，不构成投资建议。请严格执行止损以控制下行风险。
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '2px' }}>
        {/* Scanning status (only for results tab) */}
        {isScanning && activeTab === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid var(--text-secondary)', borderTopColor: 'transparent', margin: '0 auto 8px auto', animation: 'spin 1s linear infinite' }}></div>
            <p style={{ fontWeight: 500 }}>{scanText || '正在扫描全市场 K 线...'}</p>
            {scanProgress && (
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {scanProgress.current} / {scanProgress.total} ({Math.round((scanProgress.current / scanProgress.total) * 100)}%)
              </span>
            )}
          </div>
        )}

        {/* Results Tab Rendering */}
        {activeTab === 'results' && !isScanning && results.length > 0 && filteredResults.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
            <HelpCircle size={28} style={{ marginBottom: '8px', opacity: 0.3 }} />
            <p>没有符合条件的股票</p>
            <p style={{ fontSize: '10px', marginTop: '4px' }}>请尝试放宽或重置分类筛选条件</p>
          </div>
        )}

        {/* Unmatched State */}
        {activeTab === 'results' && !isScanning && results.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '16px', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <HelpCircle size={28} style={{ marginBottom: '8px', opacity: 0.3 }} />
              <p style={{ fontWeight: 500, color: 'var(--text-primary)' }}>未找到匹配个股</p>
              <p style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-secondary)' }}>可尝试在左侧放宽技术规则参数，重新扫描。</p>
            </div>
            {onDiagnose && (
              <button
                type="button"
                onClick={onDiagnose}
                className="btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  background: 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#fff',
                  boxShadow: '0 0 12px rgba(37, 99, 235, 0.3)',
                  fontWeight: 500
                }}
              >
                <span>🔍 一键诊断 (AI 智能调优建议)</span>
              </button>
            )}
          </div>
        )}

        {activeTab === 'results' && !isScanning && filteredResults.map((item) => {
          const isSelected = selectedCode === item.code;
          const isPending = item.p3_breakDate === '蓄势待突破';
          const meta = metadata[item.code];
          
          return (
            <div
              key={item.code}
              onClick={() => onSelectStock(item.code)}
              className="fade-in"
              style={{
                padding: '10px',
                borderRadius: 'var(--radius-sm)',
                border: isSelected 
                  ? '1px solid rgba(255, 255, 255, 0.25)' 
                  : '1px solid var(--border-light)',
                background: isSelected 
                  ? 'var(--bg-active)' 
                  : 'rgba(255, 255, 255, 0.01)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                position: 'relative',
                overflow: 'hidden',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'var(--border-light)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{item.name}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginLeft: '6px' }}>{item.code}</span>
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px', 
                  border: isPending ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(225, 29, 72, 0.3)', 
                  background: isPending ? 'rgba(234, 179, 8, 0.08)' : 'rgba(225, 29, 72, 0.08)', 
                  color: isPending ? '#eab308' : '#f43f5e', 
                  padding: '2px 8px', 
                  borderRadius: '4px', 
                  fontSize: '10px',
                  fontWeight: 500
                }}>
                  <span>{isPending ? '整理中' : `突破: ${item.p3_breakDate}`}</span>
                </div>
              </div>

              {meta && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '10px', flexWrap: 'wrap' }}>
                  <span style={{ 
                    background: 'rgba(255, 255, 255, 0.04)', 
                    color: 'var(--text-secondary)', 
                    padding: '1px 5px', 
                    border: '1px solid var(--border-light)',
                    borderRadius: '4px'
                  }}>
                    {meta.industry}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    市值: <span style={{ color: 'var(--text-secondary)' }}>{formatCap(meta.totalCap)}</span>
                  </span>
                  {meta.price > 0 && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      股价: <span style={{ color: 'var(--text-secondary)' }}>{meta.price}元</span>
                    </span>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
                <div>阻力价: <span style={{ color: 'var(--text-primary)' }}>{item.refPrice} 元</span></div>
                {isPending ? (
                  <div>突破价: <span style={{ color: 'var(--text-muted)' }}>待触发</span></div>
                ) : (
                  <div>突破价: <span style={{ color: 'var(--text-primary)' }}>{item.breakOpenPrice} 元</span></div>
                )}
              </div>

              <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineBreak: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {item.notes}
              </p>

              {/* Favorites action button at the bottom */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(item.code, item.name);
                  }}
                  className="btn-secondary"
                  style={{
                    padding: '2px 8px',
                    fontSize: '10px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    borderRadius: '4px',
                    borderColor: favorites.includes(item.code) ? 'rgba(255, 255, 255, 0.2)' : 'var(--border-light)',
                    color: favorites.includes(item.code) ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                >
                  <ShoppingCart size={10} />
                  <span>{favorites.includes(item.code) ? '已加自选' : '加入自选'}</span>
                </button>
              </div>
            </div>
          );
        })}

        {/* Favorites Tab Rendering */}
        {activeTab === 'favorites' && favorites.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
            <ShoppingCart size={28} style={{ marginBottom: '8px', opacity: 0.3 }} />
            <p>暂无自选股</p>
            <p style={{ fontSize: '10px', marginTop: '4px' }}>您可以在筛选结果列表中点击“加入自选”添加</p>
          </div>
        )}

        {activeTab === 'favorites' && favorites.length > 0 && filteredFavorites.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
            <Search size={28} style={{ marginBottom: '8px', opacity: 0.3 }} />
            <p>未找到匹配的自选股</p>
          </div>
        )}

        {activeTab === 'favorites' && favorites.length > 0 && filteredFavorites.map((code) => {
          const matched = results.find(x => x.code === code);
          const isSelected = selectedCode === code;
          const meta = metadata[code];
          const name = favoriteNames[code] || '自选股';

          if (matched) {
            // Render matched card in favorites list
            const isPending = matched.p3_breakDate === '蓄势待突破';
            return (
              <div
                key={code}
                onClick={() => onSelectStock(code)}
                className="fade-in"
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected 
                    ? '1px solid rgba(255, 255, 255, 0.25)' 
                    : '1px solid var(--border-light)',
                  background: isSelected 
                    ? 'var(--bg-active)' 
                    : 'rgba(255, 255, 255, 0.01)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  position: 'relative',
                  overflow: 'hidden',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginLeft: '6px' }}>{code}</span>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    border: '1px solid var(--border-light)', 
                    background: 'rgba(255,255,255,0.03)', 
                    color: 'var(--text-secondary)', 
                    padding: '2px 6px', 
                    borderRadius: '4px', 
                    fontSize: '10px' 
                  }}>
                    <span>{isPending ? '整理中' : `突破: ${matched.p3_breakDate}`}</span>
                  </div>
                </div>

                {meta && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '10px', flexWrap: 'wrap' }}>
                    <span style={{ 
                      background: 'rgba(255, 255, 255, 0.04)', 
                      color: 'var(--text-secondary)', 
                      padding: '1px 5px', 
                      border: '1px solid var(--border-light)',
                      borderRadius: '4px'
                    }}>
                      {meta.industry}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      市值: <span style={{ color: 'var(--text-secondary)' }}>{formatCap(meta.totalCap)}</span>
                    </span>
                    {meta.price > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        股价: <span style={{ color: 'var(--text-secondary)' }}>{meta.price}元</span>
                      </span>
                    )}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
                  <div>阻力价: <span style={{ color: 'var(--text-primary)' }}>{matched.refPrice} 元</span></div>
                  {isPending ? (
                    <div>突破价: <span style={{ color: 'var(--text-muted)' }}>待触发</span></div>
                  ) : (
                    <div>突破价: <span style={{ color: 'var(--text-primary)' }}>{matched.breakOpenPrice} 元</span></div>
                  )}
                </div>

                <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineBreak: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {matched.notes}
                </p>

                {/* Favorites action button at the bottom */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(code, name);
                    }}
                    className="btn-secondary"
                    style={{
                      padding: '2px 8px',
                      fontSize: '10px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderRadius: '4px',
                      borderColor: 'var(--border-light)',
                      color: 'var(--text-muted)'
                    }}
                  >
                    <ShoppingCart size={10} />
                    <span>移出自选</span>
                  </button>
                </div>
              </div>
            );
          } else {
            // Render unmatched favorite card
            return (
              <div
                key={code}
                onClick={() => onSelectStock(code)}
                className="fade-in"
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  border: isSelected 
                    ? '1px solid rgba(255, 255, 255, 0.25)' 
                    : '1px solid var(--border-light)',
                  background: isSelected 
                    ? 'var(--bg-active)' 
                    : 'rgba(255, 255, 255, 0.01)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                  position: 'relative',
                  overflow: 'hidden',
                  flexShrink: 0
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--border-light)';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.01)';
                  }
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginLeft: '6px' }}>{code}</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border-light)', background: 'rgba(255, 255, 255, 0.03)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>
                    <span>自选股</span>
                  </div>
                </div>

                {meta && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontSize: '10px', flexWrap: 'wrap' }}>
                    {meta.industry && (
                      <span style={{ 
                        background: 'rgba(255, 255, 255, 0.04)', 
                        color: 'var(--text-secondary)', 
                        padding: '1px 5px', 
                        border: '1px solid var(--border-light)',
                        borderRadius: '4px'
                      }}>
                        {meta.industry}
                      </span>
                    )}
                    <span style={{ color: 'var(--text-muted)' }}>
                      市值: <span style={{ color: 'var(--text-secondary)' }}>{formatCap(meta.totalCap)}</span>
                    </span>
                    {meta.price > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}>
                        股价: <span style={{ color: 'var(--text-secondary)' }}>{meta.price}元</span>
                      </span>
                    )}
                  </div>
                )}

                <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  自选证券。点击卡片可载入并查看其历史走势。
                </p>

                {/* Favorites action button at the bottom */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(code, name);
                    }}
                    className="btn-secondary"
                    style={{
                      padding: '2px 8px',
                      fontSize: '10px',
                      height: '22px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderRadius: '4px',
                      borderColor: 'var(--border-light)',
                      color: 'var(--text-muted)'
                    }}
                  >
                    <ShoppingCart size={10} />
                    <span>移出自选</span>
                  </button>
                </div>
              </div>
            );
          }
        })}
      </div>
    </div>
  );
};
