import React from 'react';
import { History, Trash2, Clock } from 'lucide-react';

export interface HistoryItem {
  code: string;
  name: string;
  klines: any[];
  timestamp: number;
}

interface SearchHistoryProps {
  historyList: HistoryItem[];
  selectedCode: string | null;
  onSelectStock: (stock: { code: string; name: string; klines: any[] }) => void;
  onClearHistory: () => void;
}

export const SearchHistory: React.FC<SearchHistoryProps> = ({
  historyList,
  selectedCode,
  onSelectStock,
  onClearHistory
}) => {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)' }}>
          <History size={18} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>个股查询历史</h2>
        </div>
        
        {historyList.length > 0 && (
          <button 
            onClick={onClearHistory}
            className="btn-secondary" 
            style={{ padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', background: 'rgba(239, 68, 68, 0.05)' }}
            title="清空查询历史"
          >
            <Trash2 size={12} />
            <span>清空</span>
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '2px' }}>
        {historyList.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
            <Clock size={28} style={{ marginBottom: '10px', opacity: 0.3 }} />
            <p style={{ fontSize: '13px' }}>暂无查询历史</p>
            <p style={{ fontSize: '11px', marginTop: '4px' }}>在上方个股输入框查询，成功后的个股将显示在此处</p>
          </div>
        )}

        {historyList.map((item) => {
          const isSelected = selectedCode === item.code;
          return (
            <div
              key={`${item.code}-${item.timestamp}`}
              onClick={() => onSelectStock({ code: item.code, name: item.name, klines: item.klines })}
              className="fade-in"
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-light)',
                background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.01)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
                position: 'relative',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{item.code}</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Clock size={10} />
                  <span>{formatTime(item.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
