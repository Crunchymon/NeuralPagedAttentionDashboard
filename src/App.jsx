import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, FastForward, Rewind, Activity, Cpu, Database, TerminalSquare, AlertTriangle, Download, Settings, PlayCircle, ArrowLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './index.css';

const API_BASE = 'https://suryanshchattree-neural-paged-attention-env.hf.space/api';
const MAX_HISTORY = 150; 

function App() {
  const [appMode, setAppMode] = useState('config'); // 'config' | 'playback'

  // Config Form State
  const [selectedAgent, setSelectedAgent] = useState('lru');
  const [selectedTask, setSelectedTask] = useState('hard');
  const [customTicks, setCustomTicks] = useState('');
  
  const [gpuBlocks, setGpuBlocks] = useState('');
  const [cpuBlocks, setCpuBlocks] = useState('');
  const [tokensPerBlock, setTokensPerBlock] = useState('');
  const [maxTicksEasy, setMaxTicksEasy] = useState('');
  const [maxTicksMedium, setMaxTicksMedium] = useState('');
  const [maxTicksHard, setMaxTicksHard] = useState('');

  const [availableAgents, setAvailableAgents] = useState([
    { id: 'lru', name: 'Least Recently Used (LRU)' },
    { id: 'random', name: 'Random Agent' },
    { id: 'qlearning', name: 'Tabular Q-Learning Agent' },
    { id: 'neural', name: 'Deep Q-Network (DQN) Agent' }
  ]);

  const [defaultSettings, setDefaultSettings] = useState(null);
  const [currentConfig, setCurrentConfig] = useState(null);

  // Playback state
  const [simulationTrace, setSimulationTrace] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  const [currentTickIndex, setCurrentTickIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState(null);

  // Fetch agents and default settings on mount
  useEffect(() => {
    const initData = async () => {
      try {
        const [agentRes, settingsRes] = await Promise.all([
          fetch(`${API_BASE}/agents`),
          fetch(`${API_BASE}/settings`)
        ]);
        
        const agentData = await agentRes.json();
        if (agentData.status === 'success' && agentData.available_agents) {
          setAvailableAgents(agentData.available_agents);
        }

        const settingsData = await settingsRes.json();
        if (settingsData.status === 'success' && settingsData.default_settings) {
          setDefaultSettings(settingsData.default_settings);
        }
      } catch (err) {
        console.error('Failed to initialize data:', err);
      }
    };
    initData();
  }, []);

  const playStateRef = useRef({ isPlaying, currentTickIndex, traceLength: simulationTrace.length });
  useEffect(() => {
    playStateRef.current = { isPlaying, currentTickIndex, traceLength: simulationTrace.length };
  }, [isPlaying, currentTickIndex, simulationTrace.length]);

  const handleStartSimulation = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // 1. Send Settings
      setLoadingText('Applying Environment Settings...');
      const settingsPayload = {
        gpu_total_blocks: gpuBlocks ? parseInt(gpuBlocks, 10) : null,
        cpu_total_blocks: cpuBlocks ? parseInt(cpuBlocks, 10) : null,
        tokens_per_block: tokensPerBlock ? parseInt(tokensPerBlock, 10) : null,
        max_ticks_easy: maxTicksEasy ? parseInt(maxTicksEasy, 10) : null,
        max_ticks_medium: maxTicksMedium ? parseInt(maxTicksMedium, 10) : null,
        max_ticks_hard: maxTicksHard ? parseInt(maxTicksHard, 10) : null,
      };

      const settingsRes = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload)
      });
      if (!settingsRes.ok) throw new Error('Failed to apply settings');

      // 2. Run Simulation
      setLoadingText('Running Headless Simulation...');
      
      setCurrentConfig({
        agent: selectedAgent,
        task: selectedTask,
        gpu: settingsPayload.gpu_total_blocks || defaultSettings?.GPU_TOTAL_BLOCKS || 'Default',
        cpu: settingsPayload.cpu_total_blocks || defaultSettings?.CPU_TOTAL_BLOCKS || 'Default',
        tokens: settingsPayload.tokens_per_block || defaultSettings?.TOKENS_PER_BLOCK || 'Default',
      });

      const simPayload = {
        agent: selectedAgent,
        task: selectedTask,
        ticks: customTicks ? parseInt(customTicks, 10) : null
      };

      const simRes = await fetch(`${API_BASE}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simPayload)
      });
      
      if (!simRes.ok) throw new Error('Simulation failed');
      const data = await simRes.json();

      if (data.session_logs && data.session_logs.length > 0) {
        setSessionData(data.session_logs[0]);
      } else {
        setSessionData(null);
      }

      let newLogs = [];
      if (data.tick_logs && Array.isArray(data.tick_logs)) {
        newLogs = data.tick_logs;
      } else if (Array.isArray(data)) {
        newLogs = data;
      } else {
        newLogs = [data];
      }
      
      setSimulationTrace(newLogs);
      setCurrentTickIndex(newLogs.length > 0 ? 0 : -1);
      
      // 3. Transition to Playback Dashboard
      setAppMode('playback');
      
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during configuration');
    } finally {
      setIsLoading(false);
    }
  };

  // Main playback loop
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(() => {
        const { currentTickIndex: idx, traceLength } = playStateRef.current;
        if (idx < traceLength - 1) {
          setCurrentTickIndex(idx + 1);
        } else {
          setIsPlaying(false); // Reached end
        }
      }, 500 / playbackSpeed); // Scale duration by playback speed
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  const handleStep = (amount) => {
    setCurrentTickIndex(prev => {
      const nextIdx = prev + amount;
      if (nextIdx < 0) return 0;
      if (nextIdx >= simulationTrace.length) return simulationTrace.length - 1;
      return nextIdx;
    });
  };

  // Derive visible history for charts (rolling window ending at currentTickIndex)
  const history = useMemo(() => {
    if (currentTickIndex < 0 || simulationTrace.length === 0) return [];
    const endIndex = currentTickIndex + 1;
    const startIndex = Math.max(0, endIndex - MAX_HISTORY);
    return simulationTrace.slice(startIndex, endIndex);
  }, [simulationTrace, currentTickIndex]);

  const currentTick = history.length > 0 ? history[history.length - 1] : null;

  // Color logic for visualizations
  const getResourceColor = (utilization) => {
    if (utilization >= 0.85) return 'var(--danger-color)'; // Red
    if (utilization >= 0.60) return '#f59e0b'; // Amber
    return 'var(--accent-color)'; // Green
  };

  const currentScore = currentTick ? (currentTick.score || 0) : 0;
  const scoreColor = currentScore < 0 ? 'var(--danger-color)' : '#6ee7b7';
  const scoreBg = currentScore < 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';

  const currentGpu = currentTick ? (currentTick.gpu_utilization_pct || 0) : 0;
  const currentCpu = currentTick ? (currentTick.cpu_utilization_pct || 0) : 0;

  const downloadLogs = (format = 'json') => {
    if (simulationTrace.length === 0) return;
    
    let content = '';
    let mimeType = '';
    let filename = '';

    if (format === 'json') {
      const exportData = {
        agent: selectedAgent,
        task: selectedTask,
        session: sessionData,
        logs: simulationTrace
      };
      content = JSON.stringify(exportData, null, 2);
      mimeType = 'application/json';
      filename = `simulation_${selectedAgent}_${selectedTask}_logs.json`;
    } else if (format === 'csv') {
      const headers = Object.keys(simulationTrace[0]).join(',');
      const rows = simulationTrace.map(log => Object.values(log).join(',')).join('\n');
      content = `${headers}\n${rows}`;
      mimeType = 'text/csv';
      filename = `simulation_${selectedAgent}_${selectedTask}_logs.csv`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Custom Tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'rgba(11, 15, 25, 0.9)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px', borderRadius: '8px' }}>
          <p style={{ margin: 0, color: '#9ca3af', fontSize: '12px' }}>Tick: {label}</p>
          {payload.map((entry, index) => (
            <p key={`item-${index}`} style={{ margin: '4px 0 0', color: entry.color, fontSize: '14px', fontWeight: 'bold' }}>
              {entry.name}: {entry.value.toFixed(3)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Render Configuration Wizard
  if (appMode === 'config') {
    return (
      <div className="config-container">
        <div className="config-panel">
          <div className="config-header">
            <h1>Neural PagedAttention</h1>
            <p>Configure Environment & Start Simulation</p>
          </div>
          
          <form onSubmit={handleStartSimulation}>
            {/* Global Settings Section */}
            <div className="config-section">
              <h2><Settings size={18} /> Global Environment Constants</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Leave fields blank to use default values.</p>
              <div className="config-grid">
                <div className="form-group">
                  <label>GPU Total Blocks</label>
                  <input type="number" className="form-control" placeholder={defaultSettings?.GPU_TOTAL_BLOCKS || "Default"} value={gpuBlocks} onChange={e => setGpuBlocks(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>CPU Total Blocks</label>
                  <input type="number" className="form-control" placeholder={defaultSettings?.CPU_TOTAL_BLOCKS || "Default"} value={cpuBlocks} onChange={e => setCpuBlocks(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Tokens Per Block</label>
                  <input type="number" className="form-control" placeholder={defaultSettings?.TOKENS_PER_BLOCK || "Default"} value={tokensPerBlock} onChange={e => setTokensPerBlock(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Task Limits Section */}
            <div className="config-section">
              <h2><Activity size={18} /> Maximum Ticks by Task Difficulty</h2>
              <div className="config-grid">
                <div className="form-group">
                  <label>Max Ticks (Easy)</label>
                  <input type="number" className="form-control" placeholder={defaultSettings?.max_ticks_easy || "Default"} value={maxTicksEasy} onChange={e => setMaxTicksEasy(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Max Ticks (Medium)</label>
                  <input type="number" className="form-control" placeholder={defaultSettings?.max_ticks_medium || "Default"} value={maxTicksMedium} onChange={e => setMaxTicksMedium(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Max Ticks (Hard)</label>
                  <input type="number" className="form-control" placeholder={defaultSettings?.max_ticks_hard || "Default"} value={maxTicksHard} onChange={e => setMaxTicksHard(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Simulation Parameters Section */}
            <div className="config-section">
              <h2><PlayCircle size={18} /> Simulation Parameters</h2>
              <div className="config-grid">
                <div className="form-group">
                  <label>Agent Policy</label>
                  <select className="form-control" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)} required>
                    {availableAgents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Task Difficulty</label>
                  <select className="form-control" value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)} required>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>Specific Ticks for this Run (Optional)</label>
                  <input type="number" className="form-control" placeholder="Override default ticks for this specific session" value={customTicks} onChange={e => setCustomTicks(e.target.value)} />
                </div>
              </div>
            </div>

            {error && <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', padding: '12px', borderRadius: '8px', color: '#fca5a5', marginBottom: '20px' }}>{error}</div>}

            <button type="submit" className="btn-large" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Activity className="spinner" size={20} /> 
                  {loadingText}
                </>
              ) : (
                <>
                  <PlayCircle size={20} /> START SIMULATION
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Playback Dashboard
  return (
    <div className="dashboard-container">
      
      {/* Controls Panel */}
      <div className="controls">
        <button className="btn" onClick={() => { setIsPlaying(false); setAppMode('config'); }}>
          <ArrowLeft size={16} /> NEW SIMULATION
        </button>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }}></div>

        <button 
          className={`btn ${isPlaying ? 'active' : ''}`} 
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={simulationTrace.length === 0}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        
        <button className="btn" onClick={() => handleStep(-10)} disabled={simulationTrace.length === 0}>
          <Rewind size={16} /> -10
        </button>
        
        <button className="btn" onClick={() => handleStep(1)} disabled={simulationTrace.length === 0}>
          <FastForward size={16} /> +1
        </button>
        
        <button className="btn" onClick={() => handleStep(10)} disabled={simulationTrace.length === 0}>
          <FastForward size={16} /> +10
        </button>

        {/* Playback Speed Control */}
        <select 
          className="btn" 
          value={playbackSpeed} 
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
          style={{ marginLeft: '8px' }}
        >
          <option value={1}>1x Speed</option>
          <option value={2}>2x Speed</option>
          <option value={3}>3x Speed</option>
          <option value={5}>5x Speed</option>
        </select>

        <span style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Tick: 
          <input 
            type="number" 
            className="btn"
            style={{ width: '60px', padding: '4px', textAlign: 'center', margin: 0, height: 'auto' }}
            min={1} 
            max={simulationTrace.length} 
            value={simulationTrace.length > 0 ? currentTickIndex + 1 : 0} 
            disabled={simulationTrace.length === 0}
            onChange={(e) => {
              let val = parseInt(e.target.value, 10);
              if (isNaN(val)) return;
              if (val < 1) val = 1;
              if (val > simulationTrace.length) val = simulationTrace.length;
              setCurrentTickIndex(val - 1);
            }}
          /> 
          / {simulationTrace.length}
        </span>
      </div>

      {currentConfig && (
        <div style={{ gridColumn: 'span 12', display: 'flex', gap: '20px', padding: '12px 20px', background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)', fontSize: '0.85rem' }}>
          <div style={{ color: 'var(--text-secondary)' }}><strong>Agent:</strong> <span style={{ color: '#fff' }}>{currentConfig.agent.toUpperCase()}</span></div>
          <div style={{ color: 'var(--text-secondary)' }}><strong>Task:</strong> <span style={{ color: '#fff' }}>{currentConfig.task.toUpperCase()}</span></div>
          <div style={{ color: 'var(--text-secondary)' }}><strong>GPU Blocks:</strong> <span style={{ color: '#fff' }}>{currentConfig.gpu}</span></div>
          <div style={{ color: 'var(--text-secondary)' }}><strong>CPU Blocks:</strong> <span style={{ color: '#fff' }}>{currentConfig.cpu}</span></div>
          <div style={{ color: 'var(--text-secondary)' }}><strong>Tokens/Block:</strong> <span style={{ color: '#fff' }}>{currentConfig.tokens}</span></div>
        </div>
      )}

      {/* Top Row: Pools */}
      <div className="panel grid-col-4">
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper purple"><Database size={16} /></div>
            HIGH PRIORITY (VIP)
          </div>
          <span className="metric-badge purple">{currentTick ? ((currentTick.vip_queue_pressure || 0) * 100).toFixed(1) : 0}% Pressure</span>
        </div>
        <div className="metric-list">
          <div className="metric-item">
            <span className="metric-badge purple">Wait Time</span>
            <div className="metric-value">
              {currentTick ? ((currentTick.vip_max_wait_time_pct || 0) * 100).toFixed(1) : 0}%
              <span className="metric-sub">Max Wait Time Pct</span>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-badge purple">Size</span>
            <div className="metric-value">
              {currentTick ? (currentTick.vip_size_mean || 0).toFixed(2) : 0}
              <span className="metric-sub">Mean Size</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel grid-col-4">
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper blue"><Database size={16} /></div>
            STANDARD POOL (FREE)
          </div>
          <span className="metric-badge blue">{currentTick ? ((currentTick.free_queue_pressure || 0) * 100).toFixed(1) : 0}% Pressure</span>
        </div>
        <div className="metric-list">
          <div className="metric-item">
            <span className="metric-badge blue">Wait Time</span>
            <div className="metric-value">
              {currentTick ? ((currentTick.free_max_wait_time_pct || 0) * 100).toFixed(1) : 0}%
              <span className="metric-sub">Max Wait Time Pct</span>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-badge blue">Size</span>
            <div className="metric-value">
              {currentTick ? (currentTick.free_size_mean || 0).toFixed(2) : 0}
              <span className="metric-sub">Mean Size</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel grid-col-4">
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper green"><Activity size={16} /></div>
            SYSTEM STATUS (AGENT: {selectedAgent.toUpperCase()})
          </div>
          <span className="metric-badge" style={{ background: scoreBg, color: scoreColor, transition: 'all 0.3s' }}>
            Score: {currentScore.toFixed(2)}
          </span>
        </div>
        <div className="metric-list">
          <div className="metric-item">
            <span className="metric-badge">Memory Trend</span>
            <div className="metric-value">
              {currentTick ? (currentTick.memory_pressure_trend || 0).toFixed(3) : 0}
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-badge">Yield Preempt</span>
            <div className="metric-value">
              {currentTick ? (currentTick.yield_preempt_active || 0).toFixed(3) : 0}
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: Bars and Reward Graph */}
      <div className="panel grid-col-4" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper green"><Cpu size={16} /></div>
            RESOURCE UTILIZATION
          </div>
        </div>
        
        {/* Progress Bars */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>GPU Utilization</span>
              <span style={{ fontWeight: 'bold', color: getResourceColor(currentGpu) }}>
                {(currentGpu * 100).toFixed(1)}%
              </span>
            </div>
            <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ 
                width: `${currentGpu * 100}%`, 
                height: '100%', 
                background: getResourceColor(currentGpu), 
                transition: 'all 0.3s ease' 
              }}></div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>CPU Utilization</span>
              <span style={{ fontWeight: 'bold', color: getResourceColor(currentCpu) }}>
                {(currentCpu * 100).toFixed(1)}%
              </span>
            </div>
            <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ 
                width: `${currentCpu * 100}%`, 
                height: '100%', 
                background: getResourceColor(currentCpu), 
                transition: 'all 0.3s ease' 
              }}></div>
            </div>
          </div>
        </div>

        {/* Crash Status */}
        {sessionData && (
          <div style={{ 
            marginTop: '20px', 
            padding: '12px', 
            borderRadius: '8px', 
            background: sessionData.crashed ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
            border: `1px solid ${sessionData.crashed ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <AlertTriangle size={18} color={sessionData.crashed ? '#ef4444' : '#10b981'} />
            <div>
              <div style={{ fontSize: '0.8rem', color: sessionData.crashed ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>
                {sessionData.crashed ? 'EPISODE CRASHED' : 'EPISODE COMPLETED'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {sessionData.crashed ? `Agent failed at tick ${sessionData.ticks_run}` : `Successfully reached tick ${sessionData.ticks_run}`}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel grid-col-8">
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper purple"><Activity size={16} /></div>
            AGENT REWARD GRAPH
          </div>
        </div>
        <div style={{ width: '100%', height: '280px' }}>
          <ResponsiveContainer>
            <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="tick" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="score" name="Cumulative Score" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row: Traffic and Logs */}
      <div className="panel grid-col-8">
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper purple"><Activity size={16} /></div>
            TRAFFIC GENERATION (QUEUE SIZE)
          </div>
        </div>
        <div style={{ width: '100%', height: '350px' }}>
          <ResponsiveContainer>
            <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="tick" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="total_vip_req" name="VIP Requests" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="total_free_req" name="Free Requests" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel grid-col-4" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper"><TerminalSquare size={16} /></div>
            EVENT LOG
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => downloadLogs('json')} disabled={simulationTrace.length === 0}>JSON</button>
            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.7rem' }} onClick={() => downloadLogs('csv')} disabled={simulationTrace.length === 0}>CSV</button>
          </div>
        </div>
        <div className="log-container" style={{ maxHeight: '350px' }}>
          {history.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '20px', fontSize: '0.85rem' }}>
              No logs yet. Click RUN SIMULATION to start.
            </div>
          ) : (
            // Reverse history to show newest at top
            [...history].reverse().map((log, index) => (
              <div key={`${log.tick || index}-${index}`} className={`log-item ${index === 0 ? 'highlight' : ''}`}>
                <span className="log-tick">[{log.tick || 0}]</span>
                <span className="log-action">ACTION: {log.action || 'Unknown'}</span>
                <span className="log-reward">{log.reward > 0 ? '+' : ''}{(log.reward || 0).toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}

export default App;
