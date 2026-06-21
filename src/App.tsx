import { useState, useEffect, useRef, useMemo } from 'react';
import { ControlPanel, DEFAULT_PARAMS, DEFAULT_UI_GROUPS, DEFAULT_UI_CONTROLS } from './components/ControlPanel';
import { StockChart } from './components/StockChart';
import { ResultList } from './components/ResultList';
import { scanStockPattern, ScanParams, MatchResult, preprocessKlines, Rule, isLimitUp } from './utils/scannerEngine';
import { Database, Search, UploadCloud, AlertCircle, History, Trash2, RefreshCw, Settings } from 'lucide-react';
import casesData from './data/cases.json';
import defaultMetadata from './data/stock_metadata.json';
import { HistoryItem } from './components/SearchHistory';
import { BacktestDashboard } from './components/BacktestDashboard';
import { backtestStockPattern, calculateBacktestSummary, getBacktestBuyPhaseLabel, BuyPriceType, BacktestSignal, BacktestSummary } from './utils/backtestEngine';

// Pre-cast casesData to any to bypass strict JSON type checking for array indexing
const builtInCases = casesData as any;

// JSONP helper to fetch A-share stock data directly in browser sandbox, avoiding CORS & local dev server TLS proxy issues
function fetchJsonp(url: string, callbackName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const uniqueCallback = `${callbackName}_${Math.random().toString(36).substring(2, 10)}`;
    
    (window as any)[uniqueCallback] = (data: any) => {
      resolve(data);
      cleanup();
    };

    const separator = url.includes('?') ? '&' : '?';
    const script = document.createElement('script');
    script.src = `${url}${separator}cb=${uniqueCallback}`;
    script.async = true;

    const cleanup = () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      delete (window as any)[uniqueCallback];
    };

    script.onerror = () => {
      reject(new Error('网络请求超时，请确认您的网络状态。'));
      cleanup();
    };

    document.body.appendChild(script);
  });
}

interface RuleDiagnosis {
  explanation: string;
  suggestedUserPrompt: string;
  suggestedOutline: string;
}

function App() {
  const [params, setParams] = useState<ScanParams>(DEFAULT_PARAMS);
  const [rules, setRules] = useState<Rule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('default');
  const [ruleDiagnosis, setRuleDiagnosis] = useState<RuleDiagnosis | null>(null);

  // Load rules from localStorage on mount
  useEffect(() => {
    const savedRules = localStorage.getItem('stock_rules');
    const savedRuleId = localStorage.getItem('stock_selected_rule_id') || 'default';
    if (savedRules) {
      try {
        const parsed = JSON.parse(savedRules);
        setRules(parsed);
        setSelectedRuleId(savedRuleId);
        const active = parsed.find((r: Rule) => r.id === savedRuleId);
        if (active) {
          setParams(active.params as ScanParams);
        }
      } catch (e) {
        console.error('加载本地规则失败:', e);
      }
    } else {
      // 初始化默认规则和测试规则1
      const initialRules: Rule[] = [
        {
          id: 'default',
          name: '默认四阶段回踩策略',
          params: DEFAULT_PARAMS,
          uiGroups: DEFAULT_UI_GROUPS,
          uiControls: DEFAULT_UI_CONTROLS
        },
        {
          id: 'test_rule_1',
          name: '测试规则1',
          params: {
            ...DEFAULT_PARAMS,
            p1_limitUpDays: 2 // 微调：涨停2天以示区别
          },
          uiGroups: DEFAULT_UI_GROUPS,
          uiControls: DEFAULT_UI_CONTROLS
        }
      ];
      setRules(initialRules);
      setSelectedRuleId('default');
      setParams(DEFAULT_PARAMS);
      localStorage.setItem('stock_rules', JSON.stringify(initialRules));
      localStorage.setItem('stock_selected_rule_id', 'default');
    }
  }, []);

  const handleSelectRule = (id: string) => {
    setSelectedRuleId(id);
    localStorage.setItem('stock_selected_rule_id', id);
    const rule = rules.find(r => r.id === id);
    if (rule) {
      setParams(rule.params as ScanParams);
    }
  };

  const [ruleModal, setRuleModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'edit';
    ruleId?: string;
    name: string;
    userPrompt: string;
  }>({
    isOpen: false,
    mode: 'create',
    name: '',
    userPrompt: ''
  });
  const [isAIGenerating, setIsAIGenerating] = useState<boolean>(false);
  const [aiLoadingText, setAiLoadingText] = useState<string>('AI 正在处理...');
  const [outlineText, setOutlineText] = useState<string>('');

  const [apiSettings, setApiSettings] = useState<{
    apiKey: string;
    model: string;
  }>({
    apiKey: '',
    model: 'deepseek/deepseek-v4-flash'
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsApiKey, setSettingsApiKey] = useState<string>('');
  const [settingsModel, setSettingsModel] = useState<string>('');

  const handleOpenSettingsModal = () => {
    setSettingsApiKey(apiSettings.apiKey);
    setSettingsModel(apiSettings.model);
    setIsSettingsOpen(true);
  };

  useEffect(() => {
    const savedKey = localStorage.getItem('openrouter_api_key') || '';
    const savedModel = localStorage.getItem('openrouter_model') || 'deepseek/deepseek-v4-flash';
    setApiSettings({ apiKey: savedKey, model: savedModel });
  }, []);

  const handleSaveSettings = (apiKey: string, model: string) => {
    setApiSettings({ apiKey, model });
    localStorage.setItem('openrouter_api_key', apiKey);
    localStorage.setItem('openrouter_model', model);
    setIsSettingsOpen(false);
  };

  const handleOpenCreateModal = () => {
    setOutlineText('');
    setRuleDiagnosis(null);
    setRuleModal({
      isOpen: true,
      mode: 'create',
      name: '新自定义策略规则',
      userPrompt: ''
    });
  };

  const handleOpenEditModal = (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    setRuleDiagnosis(null);
    if (rule) {
      setRuleModal({
        isOpen: true,
        mode: 'edit',
        ruleId,
        name: rule.name,
        userPrompt: rule.userPrompt || ''
      });
      setOutlineText(rule.refinedPrompt || '');
    } else {
      setOutlineText('');
    }
  };

  const handleCloseRuleModal = () => {
    setRuleModal(prev => ({ ...prev, isOpen: false }));
    setOutlineText('');
    setRuleDiagnosis(null);
  };

  const runStrategyDiagnosis = async () => {
    const activeRule = rules.find(r => r.id === selectedRuleId);
    if (!activeRule) {
      alert('未找到当前活跃的策略规则，无法进行诊断。');
      return;
    }

    const apiKey = apiSettings.apiKey;
    const model = apiSettings.model || 'deepseek/deepseek-v4-flash';

    if (!apiKey || !apiKey.trim()) {
      alert('请先在配置中设置您的 OpenRouter API Key！点击选择规则右侧的小齿轮按钮进行设置。');
      setIsSettingsOpen(true);
      return;
    }

    setIsAIGenerating(true);
    setAiLoadingText('AI 正在诊断为何匹配不到个股并拟定修改建议...');
    
    try {
      const systemPrompt = `You are an expert quantitative trading strategy debugger. 
The user ran a stock screening strategy, but it matched 0 stocks in the current market.
Your task is to analyze the strategy's requirements, identify which conditions might be too strict (e.g., too many consecutive limit-up days, too narrow ma pullback range, too many indicator filters active at once), and propose realistic modifications to relax the rules so that it can match stocks while preserving the core trading logic.

You must output ONLY a valid JSON object. Do not include markdown code block syntax (like \`\`\`json). The JSON must conform exactly to this schema:
{
  "explanation": "A brief explanation of why the current strategy matched 0 stocks (e.g., '连续涨停3天且回踩偏离度小于1%的要求在当前大盘下过于苛刻，建议降低涨停天数或放宽回踩幅度') in Chinese.",
  "suggestedUserPrompt": "The proposed modified natural language strategy description (in Chinese). This should relax the too-strict criteria.",
  "suggestedOutline": "The proposed modified step-by-step strategy outline (in Chinese)."
}
`;

      const userContent = `当前运行的策略名称: ${activeRule.name}
用户初始策略要求: ${activeRule.userPrompt || '未提供'}
AI 编译出来的策略步骤大纲: ${activeRule.refinedPrompt || '未提供'}
当前应用的策略参数: ${JSON.stringify(activeRule.params)}

诊断背景: 在当前市场行情快照下进行全市场扫描，发现符合以上规则条件的个股数量为 0。
请诊断为何无法找到个股，并给出推荐 of 放宽参数或条件的修改建议，同时给出修改后的初始策略要求和策略大纲。`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Stock Monitor System'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `请求失败，HTTP 状态码: ${response.status}`);
      }

      const resJson = await response.json();
      let responseText = resJson.choices?.[0]?.message?.content;
      if (!responseText) {
        throw new Error('API 返回的诊断内容为空。');
      }

      responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      const parsedData = JSON.parse(responseText);

      if (!parsedData.suggestedUserPrompt || !parsedData.suggestedOutline) {
        throw new Error('返回的诊断数据缺少关键建议字段。');
      }

      setRuleModal({
        isOpen: true,
        mode: 'edit',
        ruleId: activeRule.id,
        name: activeRule.name,
        userPrompt: activeRule.userPrompt || ''
      });
      setOutlineText(activeRule.refinedPrompt || '');
      
      setRuleDiagnosis({
        explanation: parsedData.explanation || '策略过于严格，未匹配到任何个股。',
        suggestedUserPrompt: parsedData.suggestedUserPrompt,
        suggestedOutline: parsedData.suggestedOutline
      });

    } catch (err: any) {
      console.error('AI 策略诊断出错:', err);
      alert(`AI 一键诊断策略失败：\n${err.message || err}`);
    } finally {
      setIsAIGenerating(false);
    }
  };

  const handleSaveRuleFromModal = (name: string, userPrompt: string) => {
    if (ruleModal.mode === 'create') {
      const newRule: Rule = {
        id: 'rule_' + Date.now(),
        name,
        params: { ...params },
        userPrompt,
        refinedPrompt: outlineText || "【📝 新策略规则大纲草稿】\n- 连板/建构阶段：请设置连板天数或均线形态\n- 回踩支撑阶段：请设置回踩均线周期或偏离阈值\n- 突破买入阶段：请设置高开/突破触发天数\n\n尚未运行 AI 策略解析流程。修改上方策略描述后，点击「1. 运行 AI 解析」生成详细的大纲。"
      };
      const updated = [...rules, newRule];
      setRules(updated);
      localStorage.setItem('stock_rules', JSON.stringify(updated));
      setSelectedRuleId(newRule.id);
      localStorage.setItem('stock_selected_rule_id', newRule.id);
      setParams(newRule.params as ScanParams);
    } else if (ruleModal.mode === 'edit' && ruleModal.ruleId) {
      const updated = rules.map(r => r.id === ruleModal.ruleId ? {
        ...r,
        name,
        userPrompt,
        refinedPrompt: outlineText
      } : r);
      setRules(updated);
      localStorage.setItem('stock_rules', JSON.stringify(updated));
    }
    handleCloseRuleModal();
  };

  const runAIOutlineFlow = async (userPrompt: string) => {
    const apiKey = apiSettings.apiKey;
    const model = apiSettings.model || 'deepseek/deepseek-v4-flash';

    if (!apiKey || !apiKey.trim()) {
      alert('请先在配置中设置您的 OpenRouter API Key！点击选择规则右侧的小齿轮按钮进行设置。');
      setIsSettingsOpen(true);
      return;
    }

    setIsAIGenerating(true);
    setAiLoadingText('AI 正在分析策略意图与设计大纲...');
    try {
      const systemPrompt = `You are a quantitative stock research AI assistant. Your task is to analyze the user's natural language stock screening idea and translate it into a clear, structured, step-by-step strategy outline in Chinese.
Focus on organizing the rules into three logical phases:
1. Limit-Up/Base setup phase (连板或形态建构阶段)
2. Pullback/Support phase (均线回踩或支撑阶段)
3. Breakout/Trigger phase (突破或买入信号触发阶段)

Provide your response as a plain text outline with clear numbered lists and descriptions in Chinese. Do NOT use HTML tags. Keep it concise, professional, and easy to edit.`;

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Stock Monitor System'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `请求失败，HTTP 状态码: ${response.status}`);
      }

      const resJson = await response.json();
      const responseText = resJson.choices?.[0]?.message?.content;
      if (!responseText) {
        throw new Error('API 返回的数据为空。');
      }

      let cleanText = responseText.trim();
      cleanText = cleanText.replace(/<[^>]*>/g, '');
      cleanText = cleanText.replace(/^```[a-z]*\n/i, '').replace(/\n```$/, '');
      setOutlineText(cleanText);
    } catch (err: any) {
      console.error('AI 解析意图出错:', err);
      alert(`AI 解析策略大纲失败：\n${err.message || err}`);
    } finally {
      setIsAIGenerating(false);
    }
  };

  const validateCompiledStrategy = (parsedData: any): string[] => {
    const errors: string[] = [];

    if (typeof parsedData !== 'object' || parsedData === null) {
      errors.push('返回的 JSON 数据必须是一个对象');
      return errors;
    }

    // 1. Validate strategyName
    if (!parsedData.strategyName || typeof parsedData.strategyName !== 'string') {
      errors.push('缺少 strategyName 字段，或它不是非空字符串。');
    }

    // 2. Validate uiGroups
    const groupNames = new Set<string>();
    if (parsedData.uiGroups !== undefined) {
      if (!Array.isArray(parsedData.uiGroups)) {
        errors.push('uiGroups 字段必须是一个数组。');
      } else {
        parsedData.uiGroups.forEach((group: any, idx: number) => {
          if (!group || typeof group !== 'object') {
            errors.push(`uiGroups[${idx}] 必须是一个对象。`);
          } else if (!group.name || typeof group.name !== 'string') {
            errors.push(`uiGroups[${idx}] 缺少有效的 name 属性。`);
          } else {
            groupNames.add(group.name);
          }
        });
      }
    }

    // 3. Validate uiControls
    const controlIds = new Set<string>();
    if (parsedData.uiControls !== undefined) {
      if (!Array.isArray(parsedData.uiControls)) {
        errors.push('uiControls 字段必须是一个数组。');
      } else {
        parsedData.uiControls.forEach((ctrl: any, idx: number) => {
          if (!ctrl || typeof ctrl !== 'object') {
            errors.push(`uiControls[${idx}] 必须是一个对象。`);
            return;
          }
          if (!ctrl.id || typeof ctrl.id !== 'string') {
            errors.push(`uiControls[${idx}] 缺少 id 属性。`);
          } else {
            controlIds.add(ctrl.id);
          }
          if (!ctrl.label || typeof ctrl.label !== 'string') {
            errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 缺少 label 属性。`);
          }
          if (!ctrl.type || !['slider', 'checkbox', 'select'].includes(ctrl.type)) {
            errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 的 type 必须是 'slider', 'checkbox' 或 'select'。`);
          }
          if (!ctrl.group || typeof ctrl.group !== 'string') {
            errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 缺少 group 属性。`);
          } else if (!groupNames.has(ctrl.group)) {
            errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 的 group "${ctrl.group}" 未在 uiGroups 中定义。`);
          }

          if (ctrl.type === 'slider') {
            if (typeof ctrl.min !== 'number' || typeof ctrl.max !== 'number' || typeof ctrl.step !== 'number') {
              errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 是 slider 类型，必须提供数值类型的 min, max 和 step。`);
            }
            if (typeof ctrl.defaultValue !== 'number') {
              errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 是 slider 类型，defaultValue 必须是数值。`);
            }
          } else if (ctrl.type === 'checkbox') {
            if (typeof ctrl.defaultValue !== 'boolean') {
              errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 是 checkbox 类型，defaultValue 必须是布尔值。`);
            }
          } else if (ctrl.type === 'select') {
            if (!Array.isArray(ctrl.options) || ctrl.options.length === 0) {
              errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 是 select 类型，必须提供非空的 options 数组。`);
            } else {
              ctrl.options.forEach((opt: any, optIdx: number) => {
                if (!opt || typeof opt !== 'object' || opt.label === undefined || opt.value === undefined) {
                  errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 的 options[${optIdx}] 必须是包含 label 和 value 的对象。`);
                }
              });
              if (ctrl.defaultValue === undefined) {
                errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 是 select 类型，必须提供 defaultValue。`);
              } else {
                const hasVal = ctrl.options.some((o: any) => o && o.value === ctrl.defaultValue);
                if (!hasVal) {
                  errors.push(`uiControls[${idx}] (${ctrl.id || idx}) 的 defaultValue "${ctrl.defaultValue}" 不在 options 的可选值列表中。`);
                }
              }
            }
          }
        });
      }
    }

    // 4. Validate params
    if (!parsedData.params || typeof parsedData.params !== 'object') {
      errors.push('缺少 params 属性，或它不是一个对象。');
    } else {
      controlIds.forEach(id => {
        if (parsedData.params[id] === undefined) {
          errors.push(`params 中缺少控件 "${id}" 的对应默认值。`);
        }
      });
      if (Array.isArray(parsedData.uiGroups)) {
        parsedData.uiGroups.forEach((group: any) => {
          if (group.enabledParam && parsedData.params[group.enabledParam] === undefined) {
            errors.push(`params 中缺少分组启用开关 "${group.enabledParam}" 的对应默认值。`);
          }
        });
      }
    }

    // 5. Validate customFilterCode
    if (!parsedData.customFilterCode || typeof parsedData.customFilterCode !== 'string') {
      errors.push('缺少 customFilterCode 属性，或它不是字符串。');
    } else {
      try {
        const codeToTest = parsedData.customFilterCode.trim();
        const filterFn = new Function(
          'code',
          'name',
          'rawKlines',
          'params',
          'preprocessKlines',
          'isLimitUp',
          `
            const klines = preprocessKlines(code, rawKlines);
            const filter = ${codeToTest};
            return filter(code, name, klines, params, preprocessKlines, isLimitUp);
          `
        );

        // 构造300天的模拟K线数据进行运行测试，捕获运行时TypeError等潜在异常
        const mockRawKlines = Array.from({ length: 300 }, (_, i) => {
          const date = new Date(2026, 0, i + 1).toISOString().split('T')[0];
          const close = 10 + Math.sin(i * 0.1);
          return [
            date, 
            close - 0.1, // open
            close,       // close
            close + 0.2, // high
            close - 0.2, // low
            10000,       // volume
            100000,      // amount
            1.0          // turnover
          ];
        });

        // 运行测试以捕获参数签名不正确或其它运行时错误
        filterFn(
          'SH600519',
          '贵州茅台',
          mockRawKlines,
          parsedData.params || {},
          preprocessKlines,
          isLimitUp
        );
      } catch (e: any) {
        errors.push(`JavaScript 代码运行时执行测试失败（可能调用辅助函数参数不正确或属性访问错误）: ${e.message}`);
      }
    }

    return errors;
  };

  const runAICodeFlow = async (name: string, userPrompt: string, outline: string) => {
    const apiKey = apiSettings.apiKey;
    const model = apiSettings.model || 'deepseek/deepseek-v4-flash';

    if (!apiKey || !apiKey.trim()) {
      alert('请先在配置中设置您的 OpenRouter API Key！点击选择规则右侧的小齿轮按钮进行设置。');
      setIsSettingsOpen(true);
      return;
    }

    setIsAIGenerating(true);
    setAiLoadingText('AI 正在编译核心逻辑与图表标记...');
    
    try {
      const systemPrompt = `You are a quantitative stock research AI assistant. Your task is to compile a structured step-by-step strategy outline into standard parameters, custom filtering code, dynamic chart annotations, and dynamic UI controls.

OUTPUT FORMAT:
You must output ONLY a valid JSON object. Do not include markdown code block syntax (like \`\`\`json). The JSON must conform exactly to this schema:
{
  "strategyName": "A short, concise name for the strategy (in Chinese, e.g., '均线回踩突破策略')",
  "uiGroups": [
    {
      "name": "Group Name (e.g. '阶段一：均线支撑')",
      "enabledParam": "Optionally specify a parameter key (e.g., 'p1_enabled') that will toggle this entire group. Omit or leave null if this group cannot be disabled.",
      "icon": "flame|layers|zap|settings"
    }
  ],
  "uiControls": [
    {
      "id": "param_key_name (e.g., 'ma_period')",
      "type": "slider|checkbox|select",
      "label": "Display name of control in Chinese (e.g., '均线周期')",
      "min": number (only for slider),
      "max": number (only for slider),
      "step": number (only for slider),
      "defaultValue": any,
      "options": [ (only for select)
        { "label": "Display Option (e.g., '60日均线')", "value": 60 }
      ],
      "group": "Must match one of the group names defined in 'uiGroups' exactly.",
      "tooltip": "Optional explanation tooltip string in Chinese."
    }
  ],
  "params": {
    "All parameter keys defined in uiControls and uiGroups (e.g., 'p1_enabled', 'ma_period') mapped to their initial default values."
  },
  "customFilterCode": "JavaScript code string of an ES6 function to run the strategy matching logic.
Function Signature:
(code, name, klines, params, preprocessKlines, isLimitUp) => MatchResult | null
You can access all parameter values in params (e.g., params.ma_period) to dynamically check conditions.

Helper Functions Signatures:
- preprocessKlines(code, rawKlines) => returns KlinePoint[]. (Note: the third argument 'klines' passed to filter is already preprocessed. You rarely need to call this helper yourself).
- isLimitUp(closePriceOrKline, prevClosePrice, code) => returns boolean. (Call this to check if a kline/day is a limit-up day).

Important: If the strategy outline matches the standard 4-phase pullback strategy, you can use parameters like 'p1_limitUpDays', 'p2_maPeriod' etc. and output the corresponding uiGroups/uiControls. Otherwise, define completely custom uiGroups/uiControls and read them inside customFilterCode to filter klines."
}

ANNOTATIONS RULES:
You must generate chart annotations to mark key milestones of the rule on the stock chart:
- 'area': range of consecutive days (e.g., { type: 'area', name: '① 连板阶段', startAxis: 'date1', endAxis: 'date2' })
- 'point': specific event dates (e.g., { type: 'point', name: '触碰均线', label: '② 回踩', xAxis: 'date', position: 'bottom' })
- 'line': horizontal price lines (e.g., { type: 'line', name: '参考阻力位', yAxis: price })
All dates used in annotations MUST match exact date strings present in 'klines'.`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: outline }
      ];

      let attempts = 0;
      const maxAttempts = 3;
      let success = false;
      let parsedData: any = null;

      while (attempts < maxAttempts && !success) {
        attempts++;
        if (attempts > 1) {
          setAiLoadingText(`AI 正在重新编译（第 ${attempts} 次尝试，进行自我修正）...`);
        }

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Stock Monitor System'
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson?.error?.message || `请求失败，HTTP 状态码: ${response.status}`);
        }

        const resJson = await response.json();
        let responseText = resJson.choices?.[0]?.message?.content;
        if (!responseText) {
          throw new Error('API 返回的数据为空。');
        }

        responseText = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
        
        let localParsedData: any;
        try {
          localParsedData = JSON.parse(responseText);
        } catch (jsonErr: any) {
          if (attempts < maxAttempts) {
            console.warn(`第 ${attempts} 次尝试中 JSON 解析失败，准备重试:`, jsonErr.message);
            messages.push({ role: 'assistant', content: responseText });
            messages.push({ role: 'user', content: `JSON 解析失败: ${jsonErr.message}。请确保输出的是合法的 JSON 格式，不要包含任何 markdown 代码块标记，直接以 { 开始。` });
            continue;
          } else {
            throw new Error(`JSON 解析失败: ${jsonErr.message}\n原始输出：${responseText}`);
          }
        }

        const validationErrors = validateCompiledStrategy(localParsedData);
        if (validationErrors.length > 0) {
          const errMsg = `第 ${attempts} 次尝试 Schema 校验失败：\n` + validationErrors.map((e, idx) => `${idx + 1}. ${e}`).join('\n');
          console.warn(errMsg);

          if (attempts < maxAttempts) {
            messages.push({ role: 'assistant', content: responseText });
            messages.push({ role: 'user', content: `Schema 校验失败或 JavaScript 代码编译出错：\n${validationErrors.join('\n')}\n\n请修正这些错误，并输出完整且完全符合规范的 JSON。` });
            continue;
          } else {
            throw new Error(errMsg);
          }
        }

        parsedData = localParsedData;
        success = true;
      }

      if (!parsedData) {
        throw new Error('AI 编译未成功生成有效数据。');
      }

      const strategyName = (name === '新自定义策略规则') ? (parsedData.strategyName || name) : name;
      const customFilterCode = parsedData.customFilterCode || '';
      const mockParams: Record<string, any> = {
        ...parsedData.params
      };

      if (ruleModal.mode === 'create') {
        const newRule: Rule = {
          id: 'rule_' + Date.now(),
          name: strategyName,
          params: mockParams,
          uiControls: parsedData.uiControls,
          uiGroups: parsedData.uiGroups,
          userPrompt,
          refinedPrompt: outline,
          customFilterCode
        };
        const updated = [...rules, newRule];
        setRules(updated);
        localStorage.setItem('stock_rules', JSON.stringify(updated));
        setSelectedRuleId(newRule.id);
        localStorage.setItem('stock_selected_rule_id', newRule.id);
        setParams(mockParams as ScanParams);
      } else if (ruleModal.mode === 'edit' && ruleModal.ruleId) {
        const updated = rules.map(r => r.id === ruleModal.ruleId ? {
          ...r,
          name: strategyName,
          params: mockParams,
          uiControls: parsedData.uiControls,
          uiGroups: parsedData.uiGroups,
          userPrompt,
          refinedPrompt: outline,
          customFilterCode
        } : r);
        setRules(updated);
        localStorage.setItem('stock_rules', JSON.stringify(updated));
        if (selectedRuleId === ruleModal.ruleId) {
          setParams(mockParams as ScanParams);
        }
      }

      handleCloseRuleModal();
    } catch (err: any) {
      console.error('AI 编译逻辑出错:', err);
      alert(`AI 编译策略代码失败：\n${err.message || err}`);
    } finally {
      setIsAIGenerating(false);
    }
  };


  const handleDeleteRule = (id: string) => {
    if (id === 'default') return;
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    localStorage.setItem('stock_rules', JSON.stringify(updated));
    if (selectedRuleId === id) {
      handleSelectRule('default');
    }
  };

  const handleParamsChange = (newParams: ScanParams) => {
    setParams(newParams);
    // 自动将更改保存到当前活跃的规则中
    const updated = rules.map(r => 
      r.id === selectedRuleId ? { ...r, params: newParams } : r
    );
    setRules(updated);
    localStorage.setItem('stock_rules', JSON.stringify(updated));
  };

  const runActiveScanner = (code: string, name: string, rawKlines: any[]): MatchResult | null => {
    const activeRule = rules.find(r => r.id === selectedRuleId);
    if (activeRule && activeRule.customFilterCode && activeRule.customFilterCode.trim()) {
      try {
        const filterFn = new Function(
          'code',
          'name',
          'rawKlines',
          'params',
          'preprocessKlines',
          'isLimitUp',
          `
            const klines = preprocessKlines(code, rawKlines);
            const filter = ${activeRule.customFilterCode.trim()};
            return filter(code, name, klines, params, preprocessKlines, isLimitUp);
          `
        );
        return filterFn(code, name, rawKlines, params, preprocessKlines, isLimitUp);
      } catch (e) {
        console.error(`执行自定义规则 [${activeRule.name}] 出错:`, e);
        return null;
      }
    }
    return scanStockPattern(code, name, rawKlines, params);
  };

  const buyPhaseLabel = useMemo(() => getBacktestBuyPhaseLabel(params), [params]);
  const [currentStock, setCurrentStock] = useState<{ code: string; name: string; klines: any[] } | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  
  // Data Sources
  const [marketSnapshot, setMarketSnapshot] = useState<Record<string, { name: string; klines: any[] }> | null>(null);
  const [dataSourceName, setDataSourceName] = useState<string>('内置经典案例(海星股份)');
  
  // Searching & Scanning States
  const [searchCode, setSearchCode] = useState<string>('');
  const [isSearchingLive, setIsSearchingLive] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);
  const [scanResults, setScanResults] = useState<MatchResult[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState<boolean>(false);
  const [scanText, setScanText] = useState<string>('正在扫描全市场 K 线...');
  const scanSessionRef = useRef<number>(0);
  const [stockMetadata, setStockMetadata] = useState<Record<string, { industry: string; totalCap: number; circCap: number; price: number }>>(defaultMetadata as any);

  // Favorites stock list states
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteNames, setFavoriteNames] = useState<Record<string, string>>({});
  const [showFavoritesDropdown, setShowFavoritesDropdown] = useState<boolean>(false);

  // Tab Navigation State
  const [activeTab, setActiveTab] = useState<'chart' | 'backtest'>('chart');

  // Backtest States
  const [isBacktesting, setIsBacktesting] = useState<boolean>(false);
  const [backtestProgress, setBacktestProgress] = useState<{ current: number; total: number } | null>(null);
  const [backtestSignals, setBacktestSignals] = useState<BacktestSignal[]>([]);
  const [backtestSummary, setBacktestSummary] = useState<BacktestSummary | null>(null);
  const [buyPriceType, setBuyPriceType] = useState<BuyPriceType>('close');

  // Close history dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.history-dropdown-container')) {
        setShowHistoryDropdown(false);
      }
    };
    if (showHistoryDropdown) {
      document.addEventListener('click', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [showHistoryDropdown]);

  // Close favorites dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.favorites-dropdown-container')) {
        setShowFavoritesDropdown(false);
      }
    };
    if (showFavoritesDropdown) {
      document.addEventListener('click', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [showFavoritesDropdown]);

  // Initialize with built-in case study: Ocean Star (海星股份) & Search History
  useEffect(() => {
    // Load search history from local storage
    const saved = localStorage.getItem('stock_search_history');
    if (saved) {
      try {
        setHistoryList(JSON.parse(saved));
      } catch (e) {
        console.error("加载历史记录失败", e);
      }
    }

    // Load favorites from local file if exists, fallback to local storage
    const loadInitialFavorites = async () => {
      try {
        const res = await fetch('/src/data/favorites.json?t=' + Date.now());
        if (res.ok) {
          const data = await res.json();
          if (data.favorites && data.favoriteNames) {
            setFavorites(data.favorites);
            setFavoriteNames(data.favoriteNames);
            return;
          }
        }
      } catch (e) {
        console.log('No local favorites.json loaded, trying localStorage:', e);
      }

      // Fallback to local storage
      const savedFavs = localStorage.getItem('stock_favorites');
      const savedFavNames = localStorage.getItem('stock_favorite_names');
      if (savedFavs) {
        try {
          setFavorites(JSON.parse(savedFavs));
        } catch (e) {}
      }
      if (savedFavNames) {
        try {
          setFavoriteNames(JSON.parse(savedFavNames));
        } catch (e) {}
      }
    };
    loadInitialFavorites();

    if (builtInCases && builtInCases['603115']) {
      const stock = {
        code: '603115',
        name: builtInCases['603115'].name,
        klines: builtInCases['603115'].klines
      };
      setCurrentStock(stock);
      
      // Calculate matching result for Ocean Star using default parameters
      const match = runActiveScanner(stock.code, stock.name, stock.klines);
      setMatchResult(match);
    }

    // Auto-load market snapshot from local project directory if it exists
    const loadInitialSnapshot = async () => {
      try {
        const res = await fetch('/src/data/market_snapshot.json?t=' + Date.now());
        if (res.ok) {
          const snapshot = await res.json();
          setMarketSnapshot(snapshot);
          setDataSourceName('本地自动生成 (market_snapshot.json)');
        }
      } catch (e) {
        console.log('No initial market snapshot loaded:', e);
      }
    };
    loadInitialSnapshot();
  }, []);

  // Whenever parameters are modified, update the chart markers for currently viewed stock in real-time
  useEffect(() => {
    if (currentStock) {
      const match = runActiveScanner(currentStock.code, currentStock.name, currentStock.klines);
      setMatchResult(match);
    }
  }, [params]);

  // Helper to save favorites to local disk file
  const saveFavoritesToFile = async (favs: string[], names: Record<string, string>) => {
    try {
      await fetch('/api/save-favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ favorites: favs, favoriteNames: names })
      });
    } catch (e) {
      console.error('自动保存自选股到本地文件失败:', e);
    }
  };

  // Favorites handlers
  const handleToggleFavorite = (code: string, name: string) => {
    setFavorites(prevFavs => {
      const updatedFavs = prevFavs.includes(code)
        ? prevFavs.filter(x => x !== code)
        : [...prevFavs, code];
      
      setFavoriteNames(prevNames => {
        const updatedNames = { ...prevNames, [code]: name };
        
        // Save to localStorage
        localStorage.setItem('stock_favorites', JSON.stringify(updatedFavs));
        localStorage.setItem('stock_favorite_names', JSON.stringify(updatedNames));
        
        // Save to local disk file
        saveFavoritesToFile(updatedFavs, updatedNames);
        
        return updatedNames;
      });
      
      return updatedFavs;
    });
  };

  const handleClearFavorites = () => {
    setFavorites([]);
    setFavoriteNames({});
    localStorage.removeItem('stock_favorites');
    localStorage.removeItem('stock_favorite_names');
    saveFavoritesToFile([], {});
  };

  const handleSelectStockFromFavorites = async (code: string) => {
    if (marketSnapshot && marketSnapshot[code]) {
      const stock = marketSnapshot[code];
      setCurrentStock({
        code,
        name: stock.name,
        klines: stock.klines
      });
      setDataSourceName(`本地自选股: ${stock.name}`);
      setMatchResult(runActiveScanner(code, stock.name, stock.klines));
    } else {
      setSearchCode(code);
      setIsSearchingLive(true);
      setErrorMessage(null);
      try {
        const prefix = code.startsWith('6') ? 'sh' : 'sz';
        const marketCode = `${prefix}${code}`;
        const klineUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketCode},day,,,600,qfq`;
        const klineRes = await fetch(klineUrl);
        const text = await klineRes.text();
        const jsonStart = text.indexOf('{');
        if (jsonStart === -1) throw new Error('数据接口异常');
        const response = JSON.parse(text.substring(jsonStart));
        const stockData = response?.data?.[marketCode];
        const qfqData = stockData?.qfqday || stockData?.day;
        if (qfqData && qfqData.length > 0) {
          const klines = qfqData.map((item: any) => [
            item[0],
            parseFloat(item[1]),
            parseFloat(item[2]),
            parseFloat(item[3]),
            parseFloat(item[4]),
            parseInt(item[5]) || 0,
            0,
            0
          ]);
          const name = favoriteNames[code] || '自选股';
          setCurrentStock({ code, name, klines });
          setDataSourceName(`在线自选股: ${name}`);
          setMatchResult(runActiveScanner(code, name, klines));
        }
      } catch (e) {
        showError('拉取自选股数据失败，请确认网络代理。');
      } finally {
        setIsSearchingLive(false);
      }
    }
  };

  // Handle single stock Live Search
  const handleLiveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = searchCode.trim();
    if (!cleanCode || cleanCode.length !== 6 || !/^\d+$/.test(cleanCode)) {
      showError('请输入正确的 6 位股票代码！');
      return;
    }

    setIsSearchingLive(true);
    setErrorMessage(null);

    try {
      // 1. Fetch suggest info directly from EastMoney suggest domain via JSONP
      const suggestUrl = `https://searchapi.eastmoney.com/api/suggest/get?input=${cleanCode}&type=14`;
      const obj = await fetchJsonp(suggestUrl, 'jQuerySuggest');
      
      const data = obj?.QuotationCodeTable?.Data;
      if (!data || data.length === 0) {
        throw new Error('未找到匹配的股票数据。');
      }

      const info = data[0];
      const name = info.Name;
      const secid = info.QuoteID;

      // 2. Fetch daily K-line data directly from Tencent Finance via standard CORS fetch to bypass TLS/CORS blocks
      const prefix = secid.split('.')[0]; // "1" for SH, "0" for SZ
      const mkt = prefix === '1' ? 'sh' : 'sz';
      const marketCode = `${mkt}${cleanCode}`;
      const klineUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${marketCode},day,,,600,qfq`;
      
      const klineRes = await fetch(klineUrl);
      const text = await klineRes.text();
      
      // Extract JSON from "kline_day={...}"
      const jsonStart = text.indexOf('{');
      if (jsonStart === -1) {
        throw new Error('腾讯财经返回了损坏的 K 线数据。');
      }
      const response = JSON.parse(text.substring(jsonStart));

      const stockData = response?.data?.[marketCode];
      const qfqData = stockData?.qfqday || stockData?.day;
      if (!qfqData || qfqData.length === 0) {
        throw new Error('腾讯财经未返回该股有效的 K 线数据。');
      }

      const klines = qfqData.map((item: any) => {
        return [
          item[0],                  // Date
          parseFloat(item[1]),      // Open
          parseFloat(item[2]),      // Close
          parseFloat(item[3]),      // High
          parseFloat(item[4]),      // Low
          parseInt(item[5]) || 0,   // Volume
          0,                        // Amount
          0                         // Turnover Rate
        ];
      });

      const searchedStock = { code: cleanCode, name, klines };
      setCurrentStock(searchedStock);
      setDataSourceName(`在线实时查询: ${name}`);
      
      // Calculate pattern match immediately
      const matchObj = runActiveScanner(cleanCode, name, klines);
      setMatchResult(matchObj);
      
      // Clear bulk scan results to prevent confusing indicators
      setScanResults([]); 

      // Add to search history
      const newItem: HistoryItem = {
        code: cleanCode,
        name,
        klines,
        timestamp: Date.now()
      };
      setHistoryList(prev => {
        const filtered = prev.filter(x => x.code !== cleanCode);
        const updated = [newItem, ...filtered].slice(0, 30);
        localStorage.setItem('stock_search_history', JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      showError(err.message || '查询失败，请检查网络连接及代理设置。');
    } finally {
      setIsSearchingLive(false);
    }
  };

  // Run full market strategy backtest in chunks
  const handleRunBacktest = () => {
    if (!marketSnapshot) {
      showError('请先导入全市场 JSON 行情快照文件 (market_snapshot.json)');
      return;
    }

    setIsBacktesting(true);
    setBacktestProgress({ current: 0, total: 0 });
    setBacktestSignals([]);
    setBacktestSummary(null);

    const codes = Object.keys(marketSnapshot);
    const total = codes.length;
    const batchSize = 100;
    let currentIndex = 0;
    const accumulatedSignals: BacktestSignal[] = [];

    const processBatch = () => {
      const limit = Math.min(currentIndex + batchSize, total);
      setBacktestProgress({ current: limit, total });

      for (let j = currentIndex; j < limit; j++) {
        const code = codes[j];
        const stock = marketSnapshot[code];
        const sigs = backtestStockPattern(code, stock.name, stock.klines, params, buyPriceType);
        accumulatedSignals.push(...sigs);
      }

      currentIndex = limit;

      if (currentIndex < total) {
        setTimeout(processBatch, 0);
      } else {
        setIsBacktesting(false);
        setBacktestProgress(null);
        // Sort by breakout date descending
        accumulatedSignals.sort((a, b) => b.p3_breakDate.localeCompare(a.p3_breakDate));
        setBacktestSignals(accumulatedSignals);
        setBacktestSummary(calculateBacktestSummary(accumulatedSignals));
      }
    };

    processBatch();
  };

  // Perform non-blocking batch market scanning
  const handleMarketScan = () => {
    if (!marketSnapshot) {
      showError('请先导入全市场 JSON 行情快照文件 (market_snapshot.json)');
      return;
    }

    setIsScanning(true);
    setScanText('正在扫描全市场 K 线...');
    setScanResults([]);
    setErrorMessage(null);

    const codes = Object.keys(marketSnapshot);
    const total = codes.length;
    const batchSize = 150; // Process 150 stocks per animation frame to keep browser responsive
    let currentIndex = 0;
    const resultsAccumulator: MatchResult[] = [];
    
    const sessionId = ++scanSessionRef.current;

    const processBatch = () => {
      if (sessionId !== scanSessionRef.current) {
        return; // Aborted by a newer scan/filter
      }

      const limit = Math.min(currentIndex + batchSize, total);
      setScanProgress({ current: limit, total });

      for (let j = currentIndex; j < limit; j++) {
        const code = codes[j];
        const stock = marketSnapshot[code];
        const match = runActiveScanner(code, stock.name, stock.klines);
        if (match) {
          resultsAccumulator.push(match);
        }
      }

      currentIndex = limit;

      if (currentIndex < total) {
        // Schedule next batch
        setTimeout(processBatch, 0);
      } else {
        // Completed
        setIsScanning(false);
        setScanProgress(null);
        // Sort results: Latest Breakthrough Date first
        resultsAccumulator.sort((a, b) => b.p3_breakDate.localeCompare(a.p3_breakDate));
        setScanResults(resultsAccumulator);

        if (resultsAccumulator.length > 0) {
          // Auto select first result
          const firstMatch = resultsAccumulator[0];
          const stock = marketSnapshot[firstMatch.code];
          setCurrentStock({
            code: firstMatch.code,
            name: stock.name,
            klines: stock.klines
          });
          setMatchResult(firstMatch);
        }

        // 每次点击执行筛选后，理论检验部分自动更新
        handleRunBacktest();
      }
    };

    // Kick off scanning loop
    processBatch();
  };

  // Jump from a backtest record to K-line chart and zoom focus on the breakout date
  const handleSelectSignal = (sig: BacktestSignal) => {
    if (!marketSnapshot) return;
    
    const stock = marketSnapshot[sig.code];
    if (!stock) return;

    setCurrentStock({
      code: sig.code,
      name: sig.name,
      klines: stock.klines
    });

    // Construct a custom MatchResult representing this specific historical trade signal
    const klinesPreprocessed = preprocessKlines(sig.code, stock.klines);
    const customMatchResult: MatchResult = {
      code: sig.code,
      name: sig.name,
      p1_startDate: sig.p1_startDate,
      p1_endDate: sig.p1_endDate,
      p2_aboveStart: sig.p2_aboveStart,
      p2_pitStart: sig.p2_pitStart,
      p2_recoverDate: sig.p2_recoverDate,
      p3_breakDate: sig.p3_breakDate,
      refPrice: sig.refPrice,
      breakOpenPrice: sig.buyPrice,
      notes: `【历史回测】于 ${sig.p3_breakDate} 触发突破信号。模拟买入价: ${sig.buyPrice.toFixed(2)}元。20交易日内最高拉升 +${sig.maxProfit}%，最大回撤 ${sig.maxDrawdown}%。`,
      klineData: klinesPreprocessed
    };

    setMatchResult(customMatchResult);
    setActiveTab('chart'); // Switch tabs back to走势图表
  };

  // Select stock from result list or favorites list
  const handleSelectStock = async (code: string) => {
    const matched = scanResults.find(x => x.code === code);
    if (matched && marketSnapshot) {
      const stock = marketSnapshot[code];
      setCurrentStock({
        code,
        name: stock.name,
        klines: stock.klines
      });
      setMatchResult(matched);
    } else if (builtInCases[code]) {
      // Case select
      setCurrentStock({
        code,
        name: builtInCases[code].name,
        klines: builtInCases[code].klines
      });
      setMatchResult(runActiveScanner(code, builtInCases[code].name, builtInCases[code].klines));
    } else {
      // Load favorite or other stock
      await handleSelectStockFromFavorites(code);
    }
  };

  const handleSelectStockFromHistory = (stock: { code: string; name: string; klines: any[] }) => {
    setCurrentStock(stock);
    setDataSourceName(`在线查询历史: ${stock.name}`);
    setMatchResult(runActiveScanner(stock.code, stock.name, stock.klines));
    setScanResults([]); // Clear bulk scan results
  };

  const handleClearHistory = () => {
    setHistoryList([]);
    localStorage.removeItem('stock_search_history');
  };

  // Handle local File Import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadJsonFile(file);
  };

  const loadJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        // Basic validation of data schema
        const firstKey = Object.keys(parsed)[0];
        if (!firstKey || !parsed[firstKey].klines || !parsed[firstKey].name) {
          throw new Error('JSON 数据格式不正确。应为: { "代码": { "name": "名称", "klines": [...] } }');
        }
        setMarketSnapshot(parsed);
        setDataSourceName(file.name);
        setErrorMessage(null);
        
        // Auto load first stock in the snapshot
        setCurrentStock({
          code: firstKey,
          name: parsed[firstKey].name,
          klines: parsed[firstKey].klines
        });
        setMatchResult(runActiveScanner(firstKey, parsed[firstKey].name, parsed[firstKey].klines));
      } catch (err: any) {
        showError(err.message || '解析 JSON 文件失败，请确认文件是否正确加密或损坏。');
      }
    };
    reader.readAsText(file);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    // Clear error after 6 seconds
    setTimeout(() => setErrorMessage(null), 6000);
  };

  // Drag and drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.json')) {
      loadJsonFile(file);
    } else {
      showError('只能拖入 .json 格式的数据源文件！');
    }
  };

  const [isUpdatingMetadata, setIsUpdatingMetadata] = useState<boolean>(false);

  const handleUpdateMetadata = async () => {
    setIsUpdatingMetadata(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/run-fetch-metadata');
      const data = await res.json();
      if (data.success) {
        // Fetch new json directly from dev server
        const jsonRes = await fetch('/src/data/stock_metadata.json?t=' + Date.now());
        if (jsonRes.ok) {
          const newMeta = await jsonRes.json();
          setStockMetadata(newMeta);
        }
        alert('个股行业与市值元数据更新成功！');
      } else {
        throw new Error(data.error || '脚本执行失败');
      }
    } catch (err: any) {
      showError('元数据更新失败: ' + err.message);
    } finally {
      setIsUpdatingMetadata(false);
    }
  };

  const [isUpdatingKline, setIsUpdatingKline] = useState<boolean>(false);
  const [klineProgress, setKlineProgress] = useState<{ current: number; total: number; message: string } | null>(null);

  const getUpdateStatusText = () => {
    if (!marketSnapshot) return '上次更新: 未载入';
    const keys = Object.keys(marketSnapshot);
    if (keys.length === 0) return '上次更新: 无数据';
    
    // Find the latest date
    let latestDateStr = '';
    for (let i = 0; i < Math.min(keys.length, 5); i++) {
      const klines = marketSnapshot[keys[i]]?.klines || [];
      if (klines.length > 0) {
        const date = klines[klines.length - 1][0]; // YYYY-MM-DD
        if (date > latestDateStr) {
          latestDateStr = date;
        }
      }
    }
    
    if (!latestDateStr) return '上次更新: 无日期';
    
    try {
      const latestDate = new Date(latestDateStr + 'T00:00:00');
      const today = new Date();
      latestDate.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      const diffMs = today.getTime() - latestDate.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 0) {
        return `上次更新: ${latestDateStr} (最新)`;
      } else {
        return `上次更新: ${latestDateStr} (${diffDays}天未更新)`;
      }
    } catch (e) {
      return `上次更新: ${latestDateStr}`;
    }
  };

  const handleUpdateKline = async () => {
    setIsUpdatingKline(true);
    setKlineProgress({ current: 0, total: 0, message: '正在初始化增量更新...' });
    setErrorMessage(null);
    try {
      // 0. Load the existing snapshot if not already in memory
      let currentSnapshot = marketSnapshot;
      if (!currentSnapshot) {
        setKlineProgress({ current: 0, total: 0, message: '正在载入本地现有 K 线缓存...' });
        try {
          const localRes = await fetch('/src/data/market_snapshot.json?t=' + Date.now());
          if (localRes.ok) {
            currentSnapshot = await localRes.json();
          }
        } catch (e) {
          console.log('No local snapshot found, starting fresh');
        }
      }
      if (!currentSnapshot) {
        currentSnapshot = {};
      }

      // 1. Fetch latest market trading date from Shanghai Composite Index (sh000001)
      setKlineProgress({ current: 0, total: 0, message: '正在获取最新市场交易日期...' });
      let latestMarketDate = '';
      try {
        const indexUrl = `/tencent-kline/appstock/app/fqkline/get?param=sh000001,day,,,5,qfq`;
        const indexRes = await fetch(indexUrl);
        if (indexRes.ok) {
          const indexText = await indexRes.text();
          const jsonStart = indexText.indexOf('{');
          if (jsonStart !== -1) {
            const indexJson = JSON.parse(indexText.substring(jsonStart));
            const indexData = indexJson?.data?.['sh000001'];
            const indexKlines = indexData?.qfqday || indexData?.day;
            if (indexKlines && indexKlines.length > 0) {
              latestMarketDate = indexKlines[indexKlines.length - 1][0]; // YYYY-MM-DD
            }
          }
        }
      } catch (e) {
        console.error('获取大盘最新交易日失败:', e);
      }

      // 2. Fetch Sina pages concurrently (pages 1 to 75) to get stock list
      setKlineProgress({ current: 0, total: 0, message: '正在获取 A 股股票列表...' });
      const fetchSinaPage = async (page: number) => {
        const url = `/sina-openapi/d/api/openapi_proxy.php/?__s=[[%22hq%22,%22hs_a%22,%22%22,0,${page},80]]`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        const data = await res.json();
        if (data && Array.isArray(data) && data.length > 0) {
          return data[0].items || [];
        }
        return [];
      };

      const pages = Array.from({ length: 75 }, (_, i) => i + 1);
      const pagesResults = await Promise.all(pages.map(p => fetchSinaPage(p).catch(() => [])));
      const rawStocks = pagesResults.flat();
      
      if (rawStocks.length === 0) {
        throw new Error('未获取到股票列表，请检查网络代理设置。');
      }

      // Filter and de-duplicate
      const uniqueStocksMap = new Map<string, { code: string; name: string; symbol: string }>();
      for (const item of rawStocks) {
        const symbol = item[0];
        const code = item[1];
        const name = item[2];
        if (symbol && (symbol.startsWith('sh') || symbol.startsWith('sz'))) {
          uniqueStocksMap.set(code, { code, name, symbol });
        }
      }
      const stocksList = Array.from(uniqueStocksMap.values());
      const total = stocksList.length;

      setKlineProgress({ current: 0, total, message: '分析数据状态并筛选待更新股...' });

      // Identify which stocks need full fetch, incremental fetch, or skip
      const stocksToFetch: { stock: { code: string; name: string; symbol: string }; limit: number; existingKlines: any[] }[] = [];
      const snapshot: Record<string, { name: string; klines: any[] }> = {};
      let skippedCount = 0;

      for (const stock of stocksList) {
        const code = stock.code;
        const existingData = (currentSnapshot as any)[code];
        const existingKlines = existingData?.klines || [];
        
        if (existingKlines.length > 0) {
          const latestStockDate = existingKlines[existingKlines.length - 1][0]; // YYYY-MM-DD
          
          if (latestMarketDate && latestStockDate === latestMarketDate) {
            // Already up to date! Skip fetching, just preserve in new snapshot
            snapshot[code] = {
              name: stock.name,
              klines: existingKlines
            };
            skippedCount++;
          } else {
            // Needs incremental update. Calculate dynamic limit based on time gap.
            let limit = 30; // Fallback
            if (latestMarketDate && latestStockDate) {
              const stockTime = new Date(latestStockDate).getTime();
              const marketTime = new Date(latestMarketDate).getTime();
              if (!isNaN(stockTime) && !isNaN(marketTime)) {
                const diffDays = Math.ceil((marketTime - stockTime) / (1000 * 60 * 60 * 24));
                if (diffDays > 0) {
                  limit = Math.min(diffDays + 5, 500); // Dynamic limit with a 5-day buffer, capped at 500
                }
              }
            }
            stocksToFetch.push({
              stock,
              limit,
              existingKlines
            });
          }
        } else {
          // Doesn't exist, needs full fetch
          stocksToFetch.push({
            stock,
            limit: 500,
            existingKlines: []
          });
        }
      }

      const fetchTotal = stocksToFetch.length;
      let completed = 0;
      let fetchedCount = 0;

      setKlineProgress({ 
        current: 0, 
        total: fetchTotal, 
        message: `已跳过 ${skippedCount} 只最新股。正在下载 ${fetchTotal} 只待更新股...` 
      });

      // 3. Fetch K-line data concurrently (50 parallel workers) for the filtered list
      const concurrency = 50;

      const worker = async (iterator: IterableIterator<[number, { stock: { code: string; name: string; symbol: string }; limit: number; existingKlines: any[] }]>) => {
        for (const [_, item] of iterator) {
          try {
            const { stock, limit, existingKlines } = item;
            const symbol = stock.symbol;
            // Fetch K-line through Vite proxy
            const klineUrl = `/tencent-kline/appstock/app/fqkline/get?param=${symbol},day,,,${limit},qfq`;
            const klineRes = await fetch(klineUrl);
            if (!klineRes.ok) {
              // On error, preserve existing if we have it
              if (existingKlines.length > 0) {
                snapshot[stock.code] = { name: stock.name, klines: existingKlines };
              }
              continue;
            }

            const resText = await klineRes.text();
            const jsonStart = resText.indexOf('{');
            if (jsonStart === -1) {
              if (existingKlines.length > 0) {
                snapshot[stock.code] = { name: stock.name, klines: existingKlines };
              }
              continue;
            }
            const resJson = JSON.parse(resText.substring(jsonStart));

            const stockData = resJson?.data?.[symbol];
            const qfqData = stockData?.qfqday || stockData?.day;
            if (qfqData && Array.isArray(qfqData) && qfqData.length > 0) {
              const newKlines = qfqData.map((k: any) => [
                k[0],                  // Date
                parseFloat(k[1]),      // Open
                parseFloat(k[2]),      // Close
                parseFloat(k[3]),      // High
                parseFloat(k[4]),      // Low
                parseInt(k[5]) || 0,   // Volume
                0,                        // Amount
                0                         // Turnover Rate
              ]);
              
              if (existingKlines.length > 0) {
                // Merge and de-duplicate by date
                const mergedMap = new Map<string, any[]>();
                for (const kl of existingKlines) {
                  mergedMap.set(kl[0], kl);
                }
                for (const kl of newKlines) {
                  mergedMap.set(kl[0], kl);
                }
                const sortedKlines = Array.from(mergedMap.values()).sort((a, b) => a[0].localeCompare(b[0]));
                snapshot[stock.code] = {
                  name: stock.name,
                  klines: sortedKlines.slice(-500) // Keep latest 500 days
                };
              } else {
                snapshot[stock.code] = {
                  name: stock.name,
                  klines: newKlines.slice(-500)
                };
              }
              fetchedCount++;
            } else {
              // Fallback to existing if tencent returned empty/error
              if (existingKlines.length > 0) {
                snapshot[stock.code] = { name: stock.name, klines: existingKlines };
              }
            }
          } catch (e) {
            // Fallback to existing
            if (item.existingKlines.length > 0) {
              snapshot[item.stock.code] = { name: item.stock.name, klines: item.existingKlines };
            }
          } finally {
            completed++;
            if (completed % 25 === 0 || completed === fetchTotal) {
              setKlineProgress({
                current: completed,
                total: fetchTotal,
                message: `正在下载数据...`
              });
            }
          }
        }
      };

      if (fetchTotal > 0) {
        const iterator = stocksToFetch.entries();
        const workers = Array(concurrency).fill(null).map(() => worker(iterator));
        await Promise.all(workers);
      }

      const validCount = Object.keys(snapshot).length;
      if (validCount === 0) {
        throw new Error('未获取到有效的 K 线行情数据，请重试。');
      }

      // 4. Update react state
      setMarketSnapshot(snapshot);
      setDataSourceName('本地自动生成 (market_snapshot.json)');

      // 5. Save to local project directory via local endpoint
      try {
        const saveRes = await fetch('/api/save-snapshot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(snapshot)
        });
        const saveResult = await saveRes.json();
        if (!saveResult.success) {
          console.error('自动保存到项目目录失败:', saveResult.error);
        }
      } catch (saveErr) {
        console.error('自动保存到项目目录错误:', saveErr);
      }

      // 6. Trigger browser download
      const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = 'market_snapshot.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(dlUrl);

      // 7. Auto-load the first stock
      const firstKey = Object.keys(snapshot)[0];
      if (firstKey) {
        setCurrentStock({
          code: firstKey,
          name: snapshot[firstKey].name,
          klines: snapshot[firstKey].klines
        });
        setMatchResult(runActiveScanner(firstKey, snapshot[firstKey].name, snapshot[firstKey].klines));
      }

      alert(`A股行情增量更新成功！\n- 跳过(已最新): ${skippedCount} 只\n- 下载/合并: ${fetchedCount} 只\n- 载入总数: ${validCount}\n- 已自动保存并导出`);
    } catch (err: any) {
      showError('行情快照更新失败: ' + err.message);
    } finally {
      setIsUpdatingKline(false);
      setKlineProgress(null);
    }
  };



  return (
    <div className="app-container" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Top Header Navigation */}
      <header className="glass-panel" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 16px',
        margin: '12px 12px 0 12px',
        height: '52px',
        background: 'var(--bg-card)',
        position: 'relative',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px', lineHeight: 1 }}>💫</span>
          <div>
            <h1 style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              星轨盯盘 v0.2.0
            </h1>
          </div>
        </div>

        {/* Live Search Form */}
        <form onSubmit={handleLiveSearch} style={{ display: 'flex', gap: '6px', alignItems: 'center' }} className="history-dropdown-container">
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="查询代码"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              style={{
                width: '130px',
                paddingLeft: '28px',
                height: '28px',
                fontSize: '11px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-light)'
              }}
            />
            <Search size={11} style={{ position: 'absolute', left: '10px', top: '8px', color: 'var(--text-muted)' }} />
          </div>
          <button 
            type="submit" 
            className="btn-primary" 
            style={{ height: '28px', padding: '0 12px', fontSize: '11px' }}
            disabled={isSearchingLive}
          >
            {isSearchingLive ? '...' : '查询'}
          </button>

          {/* History Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
              style={{ height: '28px', width: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="查询历史"
            >
              <History size={12} />
            </button>
            
            {showHistoryDropdown && (
              <div className="glass-panel" style={{
                position: 'absolute',
                top: '38px',
                right: 0,
                width: '240px',
                zIndex: 1100,
                padding: '10px',
                maxHeight: '260px',
                overflowY: 'auto',
                background: 'rgba(20, 20, 25, 0.95)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-sm)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>查询历史 ({historyList.length})</span>
                  {historyList.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearHistory();
                        setShowHistoryDropdown(false);
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                    >
                      <Trash2 size={10} />
                      <span>清空</span>
                    </button>
                  )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {historyList.length === 0 ? (
                    <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                      暂无查询历史
                    </div>
                  ) : (
                    historyList.map(item => {
                      const isSelected = currentStock?.code === item.code;
                      return (
                        <div
                          key={`${item.code}-${item.timestamp}`}
                          onClick={() => {
                            handleSelectStockFromHistory(item);
                            setShowHistoryDropdown(false);
                          }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: '2px',
                            border: isSelected ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid transparent',
                            background: isSelected ? 'var(--bg-active)' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.name}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginLeft: '6px' }}>{item.code}</span>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {new Date(item.timestamp).getHours().toString().padStart(2, '0')}:
                            {new Date(item.timestamp).getMinutes().toString().padStart(2, '0')}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Database Source File Uploader */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '11px' }}>
            <Database size={11} style={{ color: 'var(--text-secondary)' }} />
            <span>数据源:</span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-light)',
              padding: '0 8px',
              borderRadius: '4px',
              height: '28px',
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: '11px'
            }}>
              {dataSourceName}
            </span>
          </div>

          <div 
            className="tooltip-trigger tooltip-bottom" 
            data-tooltip={getUpdateStatusText()} 
            style={{ display: 'inline-flex', cursor: 'pointer' }}
          >
            <button 
              onClick={handleUpdateKline}
              className="btn-primary"
              disabled={isUpdatingKline || isUpdatingMetadata}
              style={{ height: '28px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
            >
              <RefreshCw size={11} style={{ animation: isUpdatingKline ? 'spin 1.5s linear infinite' : 'none' }} />
              <span>
                {isUpdatingKline 
                  ? (klineProgress && klineProgress.total ? `${Math.round((klineProgress.current / klineProgress.total) * 100)}%` : '更新中') 
                  : '更新K线'}
              </span>
            </button>
          </div>

          <button 
            onClick={handleUpdateMetadata}
            className="btn-secondary"
            disabled={isUpdatingKline || isUpdatingMetadata}
            style={{ height: '28px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
          >
            <RefreshCw size={11} style={{ animation: isUpdatingMetadata ? 'spin 1.5s linear infinite' : 'none' }} />
            <span>{isUpdatingMetadata ? '更新中' : '更新市值'}</span>
          </button>

          <label className="btn-secondary" style={{ height: '28px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px' }}>
            <UploadCloud size={11} />
            <span>导入数据</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </header>

      {/* Error Notifications Panel */}
      {errorMessage && (
        <div className="fade-in" style={{
          position: 'fixed',
          top: '76px',
          right: '16px',
          zIndex: 1000,
          background: 'rgba(20, 20, 25, 0.95)',
          border: '1px solid rgba(225, 29, 72, 0.4)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
          padding: '8px 16px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backdropFilter: 'blur(8px)',
          color: '#ef4444'
        }}>
          <AlertCircle size={14} />
          <span style={{ fontWeight: 400 }}>{errorMessage}</span>
        </div>
      )}

      {/* Main Panel grid columns */}
      <main className="main-content" style={{
        marginTop: '12px',
        gridTemplateColumns: activeTab === 'backtest' ? '300px 1fr' : '300px 1fr 320px'
      }}>
        {/* Left Side: Parameters Config */}
        <section style={{ height: '100%', minHeight: 0 }}>
          <ControlPanel
            params={params}
            onChange={handleParamsChange}
            onScan={handleMarketScan}
            isScanning={isScanning}
            rules={rules}
            selectedRuleId={selectedRuleId}
            onSelectRule={handleSelectRule}
            onOpenCreateModal={handleOpenCreateModal}
            onOpenEditModal={handleOpenEditModal}
            onDeleteRule={handleDeleteRule}
            onOpenSettingsModal={handleOpenSettingsModal}
          />
        </section>

        {/* Center: Candlestick interactive chart / Backtester Tab */}
        <section style={{ height: '100%', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }} className="glass-panel">
          {/* Tab Header Selector */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-light)',
            background: 'rgba(255, 255, 255, 0.01)',
            padding: '0 8px',
            height: '38px',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '4px'
          }}>
            <button
              onClick={() => setActiveTab('chart')}
              style={{
                background: activeTab === 'chart' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'chart' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                color: activeTab === 'chart' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 500,
                padding: '0 16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                height: '100%',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              📊 走势图表
            </button>
            <button
              onClick={() => setActiveTab('backtest')}
              style={{
                background: activeTab === 'backtest' ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'backtest' ? '2px solid var(--accent-blue)' : '2px solid transparent',
                color: activeTab === 'backtest' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 500,
                padding: '0 16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                height: '100%',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              🧪 理论检验
            </button>
          </div>

          {/* Tab Content Body */}
          <div style={{ flex: 1, minHeight: 0 }}>
            {activeTab === 'chart' ? (
              <StockChart
                matchResult={matchResult}
                currentStock={currentStock}
              />
            ) : (
              <BacktestDashboard
                signals={backtestSignals}
                summary={backtestSummary}
                isBacktesting={isBacktesting}
                progress={backtestProgress}
                buyPriceType={buyPriceType}
                buyPhaseLabel={buyPhaseLabel}
                onBuyPriceTypeChange={setBuyPriceType}
                onRunBacktest={handleRunBacktest}
                onSelectSignal={handleSelectSignal}
                hasMarketData={!!marketSnapshot}
              />
            )}
          </div>
        </section>

        {/* Right Side: Matched Stock Table */}
        {activeTab !== 'backtest' && (
          <section style={{ height: '100%', minHeight: 0 }}>
            <ResultList
              results={scanResults}
              selectedCode={currentStock ? currentStock.code : null}
              onSelectStock={handleSelectStock}
              isScanning={isScanning}
              scanProgress={scanProgress}
              scanText={scanText}
              metadata={stockMetadata}
              favorites={favorites}
              favoriteNames={favoriteNames}
              onToggleFavorite={handleToggleFavorite}
              onClearFavorites={handleClearFavorites}
              onDiagnose={runStrategyDiagnosis}
            />
          </section>
        )}
      </main>

      {/* Premium Dark Glass Modal for Create & Edit Rules */}
      {ruleModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="glass-panel" style={{
            width: '520px',
            background: 'linear-gradient(135deg, rgba(20, 20, 25, 0.95), rgba(10, 10, 12, 0.98))',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.02)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            position: 'relative',
            maxHeight: '85vh',
            overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  background: 'linear-gradient(135deg, var(--accent-blue), #3b82f6)',
                  width: '6px',
                  height: '14px',
                  borderRadius: '2px',
                  display: 'inline-block'
                }}></span>
                {ruleModal.mode === 'create' ? '新建策略规则' : '编辑策略规则属性与 Prompt'}
              </h3>
              <button 
                onClick={handleCloseRuleModal}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
              >
                &times;
              </button>
            </div>

            {/* Diagnosis (if available) */}
            {ruleDiagnosis && (
              <div style={{
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.15)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', fontSize: '13px', fontWeight: 'bold' }}>
                  <span>🩺 AI 一键诊断与调优建议</span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
                  {ruleDiagnosis.explanation}
                </p>

                {/* Compare View */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.08)', paddingTop: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* Left Column: Old/Original */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>原规则要求</span>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(255, 255, 255, 0.02)', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-light)', minHeight: '60px', overflowY: 'auto', maxHeight: '100px', whiteSpace: 'pre-wrap' }}>
                        <strong>初始要求:</strong><br/>
                        {ruleModal.userPrompt || '无'}<br/><br/>
                        <strong>AI策略大纲:</strong><br/>
                        {outlineText || '无'}
                      </div>
                    </div>
                    {/* Right Column: Suggested */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#60a5fa', fontWeight: 'bold' }}>新修改建议</span>
                      <div style={{ fontSize: '11px', color: '#93c5fd', background: 'rgba(59, 130, 246, 0.05)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.15)', minHeight: '60px', overflowY: 'auto', maxHeight: '100px', whiteSpace: 'pre-wrap' }}>
                        <strong>建议要求:</strong><br/>
                        {ruleDiagnosis.suggestedUserPrompt}<br/><br/>
                        <strong>建议大纲:</strong><br/>
                        {ruleDiagnosis.suggestedOutline}
                      </div>
                    </div>
                  </div>

                  {/* Apply suggestion button */}
                  <button
                    type="button"
                    onClick={() => {
                      setRuleModal(prev => ({
                        ...prev,
                        userPrompt: ruleDiagnosis.suggestedUserPrompt
                      }));
                      setOutlineText(ruleDiagnosis.suggestedOutline);
                    }}
                    className="btn-primary"
                    style={{
                      height: '26px',
                      padding: '0 10px',
                      fontSize: '11px',
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.4)',
                      color: '#93c5fd',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      alignSelf: 'flex-end',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '4px'
                    }}
                  >
                    <span>⚡️ 应用修改建议</span>
                  </button>
                </div>
              </div>
            )}

            {/* Form Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>规则名称</label>
              <input 
                type="text"
                value={ruleModal.name}
                onChange={(e) => setRuleModal(prev => ({ ...prev, name: e.target.value }))}
                placeholder="请输入规则名称，例如：测试规则1"
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>自然语言策略描述 (Prompt)</label>
              <textarea 
                value={ruleModal.userPrompt}
                onChange={(e) => setRuleModal(prev => ({ ...prev, userPrompt: e.target.value }))}
                placeholder="在此输入您的看盘思路，AI 将为您翻译成底层的筛选代码和图表标记。&#10;例如：寻找在年线之上的连续涨停个股，回调至60日线附近，今天跳空高开突破..."
                rows={4}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  resize: 'vertical',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            {/* AI Refined Outline Textarea */}
            {(outlineText !== undefined && (outlineText.length > 0 || ruleModal.mode === 'edit')) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>📋 AI 策略大纲 (可在此确认并修改大纲内容)</span>
                </label>
                <textarea 
                  value={outlineText}
                  onChange={(e) => setOutlineText(e.target.value)}
                  placeholder="等待 AI 生成策略大纲，或者在此手动编写您的量化筛选步骤..."
                  rows={6}
                  style={{
                    width: '100%',
                    background: 'rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '6px',
                    padding: '12px',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            )}

            {/* Loading / Generating Overlay */}
            {isAIGenerating && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(10, 10, 12, 0.9)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                zIndex: 10
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  border: '3px solid rgba(255, 255, 255, 0.05)',
                  borderTop: '3px solid var(--accent-blue)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{aiLoadingText}</span>
              </div>
            )}

            {/* Footer Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginTop: '4px' }}>
              <button 
                onClick={handleCloseRuleModal}
                disabled={isAIGenerating}
                className="btn-secondary"
                style={{ height: '32px', padding: '0 16px', fontSize: '12px' }}
              >
                取消
              </button>
              
              <button 
                onClick={() => handleSaveRuleFromModal(ruleModal.name, ruleModal.userPrompt)}
                disabled={isAIGenerating || !ruleModal.name.trim()}
                className="btn-secondary"
                style={{ height: '32px', padding: '0 16px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                保存草稿
              </button>

              <button 
                onClick={() => runAIOutlineFlow(ruleModal.userPrompt)}
                disabled={isAIGenerating || !ruleModal.name.trim() || !ruleModal.userPrompt.trim()}
                className="btn-primary"
                style={{ 
                  height: '32px', 
                  padding: '0 16px', 
                  fontSize: '12px',
                  background: outlineText ? 'rgba(255, 255, 255, 0.08)' : 'linear-gradient(135deg, var(--accent-blue), #2563eb)',
                  border: outlineText ? '1px solid rgba(255, 255, 255, 0.15)' : 'none',
                  color: outlineText ? 'var(--text-primary)' : '#fff',
                  boxShadow: outlineText ? 'none' : '0 0 12px rgba(37, 99, 235, 0.3)'
                }}
              >
                {outlineText ? '🔄 重新解析大纲' : '1. 运行 AI 解析'}
              </button>

              {outlineText.trim().length > 0 && (
                <button 
                  onClick={() => runAICodeFlow(ruleModal.name, ruleModal.userPrompt, outlineText)}
                  disabled={isAIGenerating || !ruleModal.name.trim() || !outlineText.trim()}
                  className="btn-primary"
                  style={{ 
                    height: '32px', 
                    padding: '0 16px', 
                    fontSize: '12px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  2. 编译并应用策略
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Premium Settings Modal for OpenRouter Configuration */}
      {isSettingsOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div className="glass-panel" style={{
            width: '420px',
            background: 'linear-gradient(135deg, rgba(20, 20, 25, 0.95), rgba(10, 10, 12, 0.98))',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 255, 255, 0.02)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={16} style={{ color: 'var(--accent-blue)' }} />
                <span>OpenRouter API 服务设置</span>
              </h3>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
              >
                &times;
              </button>
            </div>

            {/* Description */}
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
              策略生成需要调用大语言模型进行规则解析。推荐使用 OpenRouter，您可以调用 Gemini 2.5 或 DeepSeek 等顶尖模型。
            </p>

            {/* API Key */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>OpenRouter API 密钥 (API Key)</label>
              <input 
                type="password"
                value={settingsApiKey}
                onChange={(e) => setSettingsApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none'
                }}
              />
            </div>

            {/* Model Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AI 语言模型 (Model ID)</label>
              <input 
                type="text"
                value={settingsModel}
                onChange={(e) => setSettingsModel(e.target.value)}
                placeholder="deepseek/deepseek-v4-flash"
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  fontFamily: 'monospace',
                  outline: 'none'
                }}
              />
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                常用模型：<span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setSettingsModel('deepseek/deepseek-v4-flash')}>deepseek/deepseek-v4-flash</span> 或 <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setSettingsModel('openrouter/owl-alpha')}>openrouter/owl-alpha</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginTop: '4px' }}>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="btn-secondary"
                style={{ height: '30px', padding: '0 14px', fontSize: '12px' }}
              >
                取消
              </button>
              
              <button 
                onClick={() => handleSaveSettings(settingsApiKey, settingsModel)}
                className="btn-primary"
                style={{ height: '30px', padding: '0 14px', fontSize: '12px' }}
              >
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
