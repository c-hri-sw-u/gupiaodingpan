import React, { useState } from 'react';
import { ScanParams, Rule, UIControl, UIControlGroup } from '../utils/scannerEngine';
import { Flame, Layers, Zap, Info, ChevronDown, ChevronUp, Plus, Edit3, Trash2, Settings } from 'lucide-react';

interface ControlPanelProps {
  params: ScanParams;
  onChange: (newParams: ScanParams) => void;
  onScan: () => void;
  isScanning: boolean;
  rules: Rule[];
  selectedRuleId: string;
  onSelectRule: (ruleId: string) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
  onOpenSettingsModal: () => void;
}

export const DEFAULT_PARAMS: ScanParams = {
  p1_enabled: true,
  p2_enabled: true,
  p2_requirePit: true,
  p3_pullback_enabled: true,
  p3_enabled: true,

  p1_maPeriod: 250,
  p1_maxOffsetPct: 20,
  p1_minOffsetPct: -5,
  p1_checkAboveMa: true,
  p1_limitUpDays: 3,
  p1_limitUpPct: 9.5,
  p1_checkTBoard: true,
  p1_tBoardMaxRealBodyPct: 1.5,

  p2_maPeriod: 60,
  p2_nearThresholdPct: 3.0,
  p2_aboveDurationMin: 40,
  p2_aboveDurationMax: 150,
  p2_pitDurationMin: 5,
  p2_pitDurationMax: 40,
  p2_maxPitDropPct: 25,
  p2_maConvergencePct: 3.5,

  p3_maPeriod: 250,
  p3_nearThresholdPct: 3.0,
  p3_refPriceSource: 'day3_close',
  p3_gapUpOpen: true,
  p3_minOpenDiffPct: 0,
  p3_maxTriggerDays: 15
};
export const DEFAULT_UI_GROUPS: UIControlGroup[] = [
  { name: "阶段一：年线之上连板及阴线", enabledParam: "p1_enabled", icon: "flame" },
  { name: "阶段二：中期回落 (60日线)", enabledParam: "p2_enabled", icon: "layers" },
  { name: "阶段三：深调回落 (年线)", enabledParam: "p3_pullback_enabled", icon: "layers" },
  { name: "阶段四：通道突破", enabledParam: "p3_enabled", icon: "zap" }
];

export const DEFAULT_UI_CONTROLS: UIControl[] = [
  {
    id: "p1_checkAboveMa",
    type: "checkbox",
    label: "限制在年线之上运行",
    defaultValue: true,
    group: "阶段一：年线之上连板及阴线",
    tooltip: "连板期间，K线收盘价均须处于250日均线（年线）之上"
  },
  {
    id: "p1_limitUpDays",
    type: "slider",
    label: "连续涨停天数 (N)",
    min: 1,
    max: 5,
    step: 1,
    defaultValue: 3,
    group: "阶段一：年线之上连板及阴线"
  },
  {
    id: "p1_limitUpPct",
    type: "slider",
    label: "涨停判定幅度阈值",
    min: 9.0,
    max: 10.5,
    step: 0.1,
    defaultValue: 9.5,
    group: "阶段一：年线之上连板及阴线",
    tooltip: "主要用于容忍历史日线前复权（QFQ）后小数点除权精度误差，同时容忍尾盘被砸开但具有同等动能的‘准涨停’K 线。"
  },
  {
    id: "p1_checkTBoard",
    type: "checkbox",
    label: "最后一个涨停为T字涨停",
    defaultValue: true,
    group: "阶段一：年线之上连板及阴线",
    tooltip: "第N个涨停日须为T字板：开盘≈收盘≈涨停价（实体极小），盘中曾下探后再封回涨停（有明显下影线）"
  },
  {
    id: "p2_maPeriod",
    type: "select",
    label: "阶段二依托均线",
    defaultValue: 60,
    options: [
      { label: "20日均线", value: 20 },
      { label: "30日均线", value: 30 },
      { label: "60日均线", value: 60 }
    ],
    group: "阶段二：中期回落 (60日线)"
  },
  {
    id: "p2_nearThresholdPct",
    type: "slider",
    label: "靠近均线容差度",
    min: 1.0,
    max: 8.0,
    step: 0.5,
    defaultValue: 3.0,
    group: "阶段二：中期回落 (60日线)"
  },
  {
    id: "p3_maPeriod",
    type: "select",
    label: "阶段三依托均线",
    defaultValue: 250,
    options: [
      { label: "120日均线", value: 120 },
      { label: "250日年线", value: 250 }
    ],
    group: "阶段三：深调回落 (年线)"
  },
  {
    id: "p3_nearThresholdPct",
    type: "slider",
    label: "靠近均线容差度",
    min: 1.0,
    max: 8.0,
    step: 0.5,
    defaultValue: 3.0,
    group: "阶段三：深调回落 (年线)"
  },
  {
    id: "p3_gapUpOpen",
    type: "checkbox",
    label: "要求跳空高开突破",
    defaultValue: true,
    group: "阶段四：通道突破",
    tooltip: "突破当天的开盘价大于前一日收盘价，且高于阶段一连板前前高"
  },
  {
    id: "p3_maxTriggerDays",
    type: "slider",
    label: "最大突破限时",
    min: 5,
    max: 30,
    step: 1,
    defaultValue: 15,
    group: "阶段四：通道突破"
  }
];

const IconComponent = ({ name, size, style }: { name?: string; size: number; style?: React.CSSProperties }) => {
  switch (name) {
    case 'flame':
      return <Flame size={size} style={style} />;
    case 'layers':
      return <Layers size={size} style={style} />;
    case 'zap':
      return <Zap size={size} style={style} />;
    default:
      return <Settings size={size} style={style} />;
  }
};
export const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  onChange,
  onScan,
  isScanning,
  rules,
  selectedRuleId,
  onSelectRule,
  onOpenCreateModal,
  onOpenEditModal,
  onDeleteRule,
  onOpenSettingsModal
}) => {
  const activeRule = rules.find(r => r.id === selectedRuleId) || rules[0];
  const uiGroups = activeRule?.uiGroups || DEFAULT_UI_GROUPS;
  const uiControls = activeRule?.uiControls || DEFAULT_UI_CONTROLS;

  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const currentExpanded = expandedSection !== null ? expandedSection : (uiGroups[0]?.name || null);

  const updateParam = (key: string, value: any) => {
    onChange({
      ...params,
      [key]: value
    });
  };

  const toggleSection = (groupName: string) => {
    setExpandedSection(currentExpanded === groupName ? '' : groupName);
  };

  const handleResetParams = () => {
    const defaultParams: Record<string, any> = {};
    uiGroups.forEach(g => {
      if (g.enabledParam) {
        defaultParams[g.enabledParam] = true;
      }
    });
    uiControls.forEach(ctrl => {
      defaultParams[ctrl.id] = ctrl.defaultValue;
    });
    onChange(defaultParams as ScanParams);
  };

  return (
    <div className="glass-panel" style={{ padding: '12px', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
        <h2>技术参数规则配置</h2>
        <span style={{ color: 'var(--text-muted)' }}>多维度设置</span>
      </div>

      {/* 规则选择与管理栏 */}
      <div style={{ 
        display: 'flex', 
        gap: '6px', 
        alignItems: 'center', 
        background: 'rgba(255,255,255,0.01)', 
        border: '1px solid var(--border-light)', 
        borderRadius: 'var(--radius-sm)', 
        padding: '6px' 
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>选择策略规则</label>
          <select
            value={selectedRuleId}
            onChange={(e) => onSelectRule(e.target.value)}
            style={{ 
              width: '100%', 
              background: 'rgba(0,0,0,0.3)', 
              border: '1px solid var(--border-light)', 
              color: 'var(--text-primary)', 
              padding: '3px 6px', 
              borderRadius: '4px', 
              outline: 'none',
              fontSize: '12px'
            }}
          >
            {rules.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        
        {/* 操作按钮组 */}
        <div style={{ display: 'flex', gap: '4px', alignSelf: 'flex-end' }}>
          <button 
            onClick={onOpenSettingsModal}
            title="配置 API 密钥和模型"
            style={{ 
              padding: '5px', 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border-light)', 
              borderRadius: '4px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: '26px',
              height: '26px'
            }}
          >
            <Settings size={13} style={{ color: 'var(--text-secondary)' }} />
          </button>

          <button 
            onClick={onOpenCreateModal}
            title="克隆当前为新规则"
            style={{ 
              padding: '5px', 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--border-light)', 
              borderRadius: '4px', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: '26px',
              height: '26px'
            }}
          >
            <Plus size={13} style={{ color: 'var(--text-primary)' }} />
          </button>
          
          {selectedRuleId !== 'default' && (
            <>
              <button 
                onClick={() => onOpenEditModal(selectedRuleId)}
                title="修改当前规则属性与 Prompt"
                style={{ 
                  padding: '5px', 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid var(--border-light)', 
                  borderRadius: '4px', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  width: '26px',
                  height: '26px'
                }}
              >
                <Edit3 size={13} style={{ color: 'var(--text-primary)' }} />
              </button>
              
              <button 
                onClick={() => {
                  if (confirm('确认删除当前规则吗？此操作不可恢复。')) {
                    onDeleteRule(selectedRuleId);
                  }
                }}
                title="删除当前规则"
                style={{ 
                  padding: '5px', 
                  background: 'rgba(239, 68, 68, 0.1)', 
                  border: '1px solid rgba(239, 68, 68, 0.3)', 
                  borderRadius: '4px', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  width: '26px',
                  height: '26px'
                }}
              >
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 动态渲染控件分组 */}
      {uiGroups.map((group) => {
        const isGroupEnabled = group.enabledParam ? (params[group.enabledParam] !== undefined ? !!params[group.enabledParam] : true) : true;
        const isExpanded = currentExpanded === group.name;
        const groupControls = uiControls.filter(c => c.group === group.name);

        return (
          <div key={group.name} style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <div 
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.02)', userSelect: 'none' }}
            >
              <div 
                onClick={() => toggleSection(group.name)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  color: isGroupEnabled ? 'var(--text-primary)' : 'var(--text-muted)', 
                  textShadow: isGroupEnabled ? '0 0 8px rgba(255, 255, 255, 0.4)' : 'none',
                  cursor: 'pointer', 
                  flex: 1 
                }}
              >
                <IconComponent 
                  name={group.icon} 
                  size={14} 
                  style={{ 
                    color: isGroupEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
                    filter: isGroupEnabled ? 'drop-shadow(0 0 3px rgba(255, 255, 255, 0.3))' : 'none'
                  }} 
                />
                <span style={{ fontWeight: 500, textDecoration: isGroupEnabled ? 'none' : 'line-through' }}>{group.name}</span>
                {isExpanded ? <ChevronUp size={12} style={{ marginLeft: '2px' }} /> : <ChevronDown size={12} style={{ marginLeft: '2px' }} />}
              </div>
              {group.enabledParam && (
                <input 
                  type="checkbox" 
                  checked={isGroupEnabled} 
                  onChange={(e) => updateParam(group.enabledParam!, e.target.checked)} 
                  title={`启用/禁用${group.name}`}
                  style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                />
              )}
            </div>
            
            {isExpanded && (
              <div style={{ 
                padding: '10px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px', 
                borderTop: '1px solid var(--border-light)',
                opacity: isGroupEnabled ? 1 : 0.4,
                pointerEvents: isGroupEnabled ? 'auto' : 'none',
                transition: 'opacity 0.2s ease-out'
              }}>
                {groupControls.map((ctrl) => {
                  const ctrlValue = params[ctrl.id] !== undefined ? params[ctrl.id] : ctrl.defaultValue;

                  switch (ctrl.type) {
                    case 'checkbox':
                      return (
                        <div key={ctrl.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>{ctrl.label}</span>
                            {ctrl.tooltip && (
                              <span className="tooltip-trigger" data-tooltip={ctrl.tooltip}>
                                <Info size={11} />
                              </span>
                            )}
                          </div>
                          <input 
                            type="checkbox" 
                            checked={!!ctrlValue} 
                            onChange={(e) => updateParam(ctrl.id, e.target.checked)} 
                          />
                        </div>
                      );
                    case 'select':
                      return (
                        <div key={ctrl.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{ctrl.label}</span>
                          <select 
                            value={ctrlValue} 
                            onChange={(e) => updateParam(ctrl.id, isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value))}
                            style={{ 
                              width: '95px', 
                              padding: '3px 6px', 
                              background: 'rgba(0,0,0,0.3)', 
                              border: '1px solid var(--border-light)', 
                              color: 'var(--text-primary)',
                              borderRadius: '4px',
                              outline: 'none',
                              fontSize: '12px'
                            }}
                          >
                            {ctrl.options?.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      );
                    case 'slider':
                    default:
                      return (
                        <div key={ctrl.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>{ctrl.label}</span>
                              {ctrl.tooltip && (
                                <span className="tooltip-trigger" data-tooltip={ctrl.tooltip}>
                                  <Info size={11} />
                                </span>
                              )}
                            </div>
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{ctrlValue}</span>
                          </div>
                          <input 
                            type="range" 
                            min={ctrl.min ?? 0}
                            max={ctrl.max ?? 100}
                            step={ctrl.step ?? 1}
                            value={ctrlValue} 
                            onChange={(e) => updateParam(ctrl.id, Number(e.target.value))} 
                          />
                        </div>
                      );
                  }
                })}
                {groupControls.length === 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '6px' }}>
                    该分组下没有可调参数
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 'auto', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button 
          className="btn-primary" 
          onClick={onScan}
          disabled={isScanning}
          style={{ width: '100%', height: '36px' }}
        >
          {isScanning ? '计算中...' : '执行形态策略筛选'}
        </button>
        
        <button 
          className="btn-secondary" 
          onClick={handleResetParams}
          style={{ width: '100%', height: '32px' }}
        >
          重置参数
        </button>
      </div>
      
      {/* Risk Warning Disclaimer */}
      <div style={{ 
        fontSize: '10px', 
        color: '#eab308', 
        background: 'rgba(251, 191, 36, 0.05)', 
        padding: '10px', 
        border: '1px solid rgba(251, 191, 36, 0.15)', 
        borderRadius: 'var(--radius-sm)', 
        lineHeight: '1.4' 
      }}>
        <strong>⚠️ 风险提示：</strong>
        技术形态筛选根据历史公式计算得出，不预示未来走势。设定过于特定案例的参数可能导致过度拟合，请谨慎参考。
      </div>
    </div>
  );
};
