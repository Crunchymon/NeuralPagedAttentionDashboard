import { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, FastForward, Rewind, Activity, Cpu, Database, TerminalSquare, AlertTriangle, Settings, PlayCircle, ArrowLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './index.css';

const API_BASE = 'https://suryanshchattree-neural-paged-attention-env.hf.space/api';
const MAX_HISTORY = 150; 

// Colors for agents in charts
const AGENT_COLORS = {
  lru: '#10b981', // green
  random: '#ef4444', // red
  qlearning: '#3b82f6', // blue
  neural: '#8b5cf6', // purple
  llm: '#f59e0b', // amber
  ppo: '#ec4899', // pink
};

const getAgentColor = (agentId, index) => {
  if (AGENT_COLORS[agentId]) return AGENT_COLORS[agentId];
  const fallbackColors = ['#f472b6', '#34d399', '#60a5fa', '#a78bfa', '#fbbf24'];
  return fallbackColors[index % fallbackColors.length];
};

const RankedLegend = (props) => {
  const { payload, currentTick } = props;
  if (!currentTick || !payload) return null;
  
  const sortedPayload = [...payload].sort((a, b) => {
    const scoreA = currentTick[a.dataKey] || 0;
    const scoreB = currentTick[b.dataKey] || 0;
    return scoreB - scoreA;
  });

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px 0', display: 'flex', gap: '20px', justifyContent: 'center' }}>
      {sortedPayload.map((entry, index) => (
        <li key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '12px', height: '12px', backgroundColor: entry.color, borderRadius: '3px' }}></div>
          <span style={{ fontSize: '13px', color: '#fff', fontWeight: '500' }}>
            {entry.value}: {(currentTick[entry.dataKey] || 0).toFixed(3)}
          </span>
        </li>
      ))}
    </ul>
  );
};

function App() {
  const [appMode, setAppMode] = useState('config'); // 'config' | 'playback'

  // Config Form State
  const [gpuBlocks, setGpuBlocks] = useState('');
  const [cpuBlocks, setCpuBlocks] = useState('');
  const [tokensPerBlock, setTokensPerBlock] = useState('');
  const [maxTicksEasy, setMaxTicksEasy] = useState('');
  const [maxTicksMedium, setMaxTicksMedium] = useState('');
  const [maxTicksHard, setMaxTicksHard] = useState('');
  const [seed, setSeed] = useState(42);

  const [availableAgents, setAvailableAgents] = useState([]);
  const [defaultSettings, setDefaultSettings] = useState(null);
  
  // Dashboard Core Data
  const [batchData, setBatchData] = useState(null);
  const [pivotedTimelines, setPivotedTimelines] = useState({});
  const [currentConfig, setCurrentConfig] = useState(null);

  // Dashboard View State
  const [currentTaskView, setCurrentTaskView] = useState('easy');
  const [currentAgentFocus, setCurrentAgentFocus] = useState('');

  // Playback state
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
          const filtered = agentData.available_agents.filter(a => a.id !== 'random' && a.id !== 'qlearning');
          setAvailableAgents(filtered);
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

  const handleStartSimulation = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      setLoadingText('Applying global configuration...');
      const settingsPayload = {
        gpu_total_blocks: gpuBlocks ? parseInt(gpuBlocks, 10) : null,
        cpu_total_blocks: cpuBlocks ? parseInt(cpuBlocks, 10) : null,
        tokens_per_block: tokensPerBlock ? parseInt(tokensPerBlock, 10) : null,
        max_ticks_easy: maxTicksEasy ? parseInt(maxTicksEasy, 10) : 400,
        max_ticks_medium: maxTicksMedium ? parseInt(maxTicksMedium, 10) : 600,
        max_ticks_hard: maxTicksHard ? parseInt(maxTicksHard, 10) : 1000,
        traffic_seed: seed !== '' ? parseInt(seed, 10) : 42,
      };

      const settingsRes = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsPayload)
      });
      
      if (!settingsRes.ok) {
        throw new Error('Failed to apply configuration settings to the environment.');
      }

      const agentsList = availableAgents.map(a => a.id);
      const tasksList = ['easy', 'medium', 'hard'];
      const results_by_task = {};
      
      for (const task of tasksList) {
        results_by_task[task] = {};
        for (const agent of agentsList) {
          setLoadingText(`Simulating ${agent.toUpperCase()} on ${task.toUpperCase()}...`);
          const simRes = await fetch(`${API_BASE}/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agent, task })
          });
          
          if (!simRes.ok) {
             console.error(`Failed simulation for ${agent} on ${task}`);
             continue; // skip if one fails so it doesn't crash the whole batch
          }
          
          const simData = await simRes.json();
          results_by_task[task][agent] = {
            session_logs: simData.session_logs || [],
            tick_logs: simData.tick_logs || []
          };
        }
      }

      // Synthesize the data object to match what the rest of the app expects
      const data = {
        status: 'success',
        seed: settingsPayload.traffic_seed,
        agents: agentsList,
        tasks: tasksList,
        results_by_task
      };

      // Pivot logic to build deterministic timelines
      const tickMap = {};
      
      tasksList.forEach(task => {
        tickMap[task] = {};
        
        if (data.results_by_task && data.results_by_task[task]) {
          const taskResults = data.results_by_task[task];
          
          agentsList.forEach(agent => {
            if (taskResults[agent] && taskResults[agent].tick_logs) {
              taskResults[agent].tick_logs.forEach(log => {
                const tick = log.tick;
                if (!tickMap[task][tick]) {
                  tickMap[task][tick] = {
                    tick: tick,
                    total_vip_req: log.total_vip_req,
                    total_free_req: log.total_free_req,
                    tick_prompt_tokens: log.tick_prompt_tokens,
                    tick_gen_tokens: log.tick_gen_tokens,
                    raw_logs: {} // Stash original logs for agent focus drilldown
                  };
                }
                // Add agent specific metrics to the unified tick object
                tickMap[task][tick][`${agent}_score`] = log.score;
                tickMap[task][tick][`${agent}_gpu`] = log.gpu_utilization_pct;
                tickMap[task][tick][`${agent}_cpu`] = log.cpu_utilization_pct;
                tickMap[task][tick].raw_logs[agent] = log;
              });
            }
          });
        }
      });
      
      const pivoted = {};
      tasksList.forEach(task => {
        pivoted[task] = Object.values(tickMap[task]).sort((a,b) => a.tick - b.tick);
      });

      setPivotedTimelines(pivoted);
      setBatchData(data);
      
      setCurrentConfig({
        seed: data.seed,
        gpu: settingsPayload.gpu_total_blocks || defaultSettings?.GPU_TOTAL_BLOCKS || 'Default',
        cpu: settingsPayload.cpu_total_blocks || defaultSettings?.CPU_TOTAL_BLOCKS || 'Default',
        tokens: settingsPayload.tokens_per_block || defaultSettings?.TOKENS_PER_BLOCK || 'Default',
        queue: settingsPayload.max_queue_size || defaultSettings?.max_queue_size || 'Default',
      });
      
      setCurrentTaskView(tasksList.length > 0 ? tasksList[0] : 'easy');
      setCurrentAgentFocus(agentsList.length > 0 ? agentsList[0] : '');
      setCurrentTickIndex(pivoted[tasksList[0]]?.length > 0 ? 0 : -1);
      
      setAppMode('playback');
      
    } catch (err) {
      console.error(err);
      setError(err.message || 'An error occurred during configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const currentTimeline = pivotedTimelines[currentTaskView] || [];
  
  // Safe tick index bounding on task change
  useEffect(() => {
    if (appMode === 'playback' && currentTimeline.length > 0) {
      setCurrentTickIndex(0);
      setIsPlaying(false);
    }
  }, [currentTaskView]);

  // Main playback loop
  const playStateRef = useRef({ isPlaying, currentTickIndex, traceLength: currentTimeline.length });
  useEffect(() => {
    playStateRef.current = { isPlaying, currentTickIndex, traceLength: currentTimeline.length };
  }, [isPlaying, currentTickIndex, currentTimeline.length]);

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
      }, 500 / playbackSpeed); 
    }
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  const handleStep = (amount) => {
    setCurrentTickIndex(prev => {
      const nextIdx = prev + amount;
      if (nextIdx < 0) return 0;
      if (nextIdx >= currentTimeline.length) return currentTimeline.length - 1;
      return nextIdx;
    });
  };

  // Derive visible history for charts (rolling window ending at currentTickIndex)
  const history = useMemo(() => {
    if (currentTickIndex < 0 || currentTimeline.length === 0) return [];
    const endIndex = currentTickIndex + 1;
    const startIndex = Math.max(0, endIndex - MAX_HISTORY);
    return currentTimeline.slice(startIndex, endIndex);
  }, [currentTimeline, currentTickIndex]);

  const currentUnifiedTick = history.length > 0 ? history[history.length - 1] : null;
  
  // Agent specific drilldown log for current tick
  const focusLog = currentUnifiedTick && currentUnifiedTick.raw_logs && currentUnifiedTick.raw_logs[currentAgentFocus] 
    ? currentUnifiedTick.raw_logs[currentAgentFocus] 
    : null;

  const focusSession = useMemo(() => {
    if (!batchData || !batchData.results_by_task || !batchData.results_by_task[currentTaskView]) return null;
    const agentRes = batchData.results_by_task[currentTaskView][currentAgentFocus];
    if (agentRes && agentRes.session_logs && agentRes.session_logs.length > 0) {
      return agentRes.session_logs[0];
    }
    return null;
  }, [batchData, currentTaskView, currentAgentFocus]);

  // Color logic for visualizations
  const getResourceColor = (utilization) => {
    if (utilization >= 0.85) return 'var(--danger-color)'; 
    if (utilization >= 0.60) return '#f59e0b'; 
    return 'var(--accent-color)'; 
  };

  const currentScore = focusLog ? (focusLog.score || 0) : 0;
  const scoreColor = currentScore < 0 ? 'var(--danger-color)' : '#6ee7b7';
  const scoreBg = currentScore < 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';
  const currentGpu = focusLog ? (focusLog.gpu_utilization_pct || 0) : 0;
  const currentCpu = focusLog ? (focusLog.cpu_utilization_pct || 0) : 0;

  const downloadSession = (format = 'json') => {
    if (!focusSession) return;
    let content = '';
    let mimeType = '';
    let filename = '';

    if (format === 'json') {
      content = JSON.stringify(focusSession, null, 2);
      mimeType = 'application/json';
      filename = `session_${currentAgentFocus}_${currentTaskView}.json`;
    } else if (format === 'csv') {
      const headers = Object.keys(focusSession).join(',');
      const rows = Object.values(focusSession).join(',');
      content = `${headers}\n${rows}`;
      mimeType = 'text/csv';
      filename = `session_${currentAgentFocus}_${currentTaskView}.csv`;
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

  // Custom Tooltip acting as Leaderboard
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      // Sort the payload descending by value to make it a leaderboard
      const sortedPayload = [...payload].sort((a, b) => b.value - a.value);

      return (
        <div style={{ background: 'rgba(11, 15, 25, 0.95)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
          <p style={{ margin: '0 0 8px 0', color: '#9ca3af', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
            Tick {label} Leaderboard
          </p>
          {sortedPayload.map((entry, index) => (
            <div key={`item-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0' }}>
              <span style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold', width: '16px' }}>#{index + 1}</span>
              <div style={{ width: '10px', height: '10px', backgroundColor: entry.color, borderRadius: '50%' }}></div>
              <span style={{ color: entry.color, fontSize: '14px', fontWeight: 'bold', flex: 1 }}>
                {entry.name}
              </span>
              <span style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>
                {entry.value.toFixed(3)}
              </span>
            </div>
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
            <p>Configure Shared Environment Constants & Start Batch Simulation</p>
          </div>
          
          <form onSubmit={handleStartSimulation}>
            <div className="config-section">
              <h2><Settings size={18} /> Global Environment Constants</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Leave fields blank to use backend default values.</p>
              <div className="config-grid">
                <div className="form-group">
                  <label>Seed (Deterministic Traffic)</label>
                  <input type="number" className="form-control" placeholder="42" value={seed} onChange={e => setSeed(e.target.value)} />
                </div>
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

            <div className="config-section">
              <h2><Activity size={18} /> Maximum Ticks by Task Difficulty</h2>
              <div className="config-grid">
                <div className="form-group">
                  <label>Max Ticks (Easy)</label>
                  <input type="number" className="form-control" placeholder="400" value={maxTicksEasy} onChange={e => setMaxTicksEasy(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Max Ticks (Medium)</label>
                  <input type="number" className="form-control" placeholder="600" value={maxTicksMedium} onChange={e => setMaxTicksMedium(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Max Ticks (Hard)</label>
                  <input type="number" className="form-control" placeholder="1000" value={maxTicksHard} onChange={e => setMaxTicksHard(e.target.value)} />
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
                  <PlayCircle size={20} /> START BATCH SIMULATION
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

        {/* Task View Tabs */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '4px' }}>
          {batchData?.tasks?.map(task => (
            <button 
              key={task}
              className={`btn ${currentTaskView === task ? 'active' : ''}`}
              style={{ border: 'none', background: currentTaskView === task ? 'var(--accent-purple)' : 'transparent' }}
              onClick={() => setCurrentTaskView(task)}
            >
              Task: {task.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }}></div>

        <button 
          className={`btn ${isPlaying ? 'active' : ''}`} 
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={currentTimeline.length === 0}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          {isPlaying ? 'PAUSE' : 'PLAY'}
        </button>
        
        <button className="btn" onClick={() => handleStep(-10)} disabled={currentTimeline.length === 0}>
          <Rewind size={16} /> -10
        </button>
        <button className="btn" onClick={() => handleStep(1)} disabled={currentTimeline.length === 0}>
          <FastForward size={16} /> +1
        </button>
        <button className="btn" onClick={() => handleStep(10)} disabled={currentTimeline.length === 0}>
          <FastForward size={16} /> +10
        </button>

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
          <option value={10}>10x Speed</option>
          <option value={20}>20x Speed</option>
          <option value={100}>100x Speed</option>
          <option value={200}>200x Speed</option>
          <option value={500}>500x Speed</option>
        </select>

        <span style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Tick: 
          <input 
            type="number" 
            className="btn"
            style={{ width: '60px', padding: '4px', textAlign: 'center', margin: 0, height: 'auto' }}
            min={1} 
            max={currentTimeline.length} 
            value={currentTimeline.length > 0 ? currentTickIndex + 1 : 0} 
            disabled={currentTimeline.length === 0}
            onChange={(e) => {
              let val = parseInt(e.target.value, 10);
              if (isNaN(val)) return;
              if (val < 1) val = 1;
              if (val > currentTimeline.length) val = currentTimeline.length;
              setCurrentTickIndex(val - 1);
            }}
          /> 
          / {currentTimeline.length}
        </span>
      </div>

      {currentConfig && (
        <div style={{ gridColumn: 'span 12', display: 'flex', gap: '20px', padding: '12px 20px', background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--panel-border)', fontSize: '0.85rem' }}>
          <div style={{ color: 'var(--text-secondary)' }}><strong>Seed:</strong> <span style={{ color: '#fff' }}>{currentConfig.seed}</span></div>
          <div style={{ color: 'var(--text-secondary)' }}><strong>GPU Blocks:</strong> <span style={{ color: '#fff' }}>{currentConfig.gpu}</span></div>
          <div style={{ color: 'var(--text-secondary)' }}><strong>CPU Blocks:</strong> <span style={{ color: '#fff' }}>{currentConfig.cpu}</span></div>
          <div style={{ color: 'var(--text-secondary)' }}><strong>Tokens/Block:</strong> <span style={{ color: '#fff' }}>{currentConfig.tokens}</span></div>
        </div>
      )}

      {/* Multi-Agent Reward Graph */}
      <div className="panel grid-col-12">
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper purple"><Activity size={16} /></div>
            MULTI-AGENT COMPARISON (CUMULATIVE SCORE)
          </div>
        </div>
        <div style={{ width: '100%', height: '300px' }}>
          <ResponsiveContainer>
            <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="tick" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" content={<RankedLegend currentTick={currentUnifiedTick} />} />
              {batchData?.agents?.map((agent, index) => (
                <Line 
                  key={agent} 
                  type="monotone" 
                  dataKey={`${agent}_score`} 
                  name={agent.toUpperCase()} 
                  stroke={getAgentColor(agent, index)} 
                  strokeWidth={2} 
                  dot={false} 
                  isAnimationActive={false} 
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Shared Environment Graphs Moved Up */}
      <div className="panel grid-col-6">
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper purple"><Database size={16} /></div>
            SHARED TRAFFIC GENERATION
          </div>
        </div>
        <div style={{ width: '100%', height: '280px' }}>
          <ResponsiveContainer>
            <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="tick" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36}/>
              <Line type="monotone" dataKey="total_vip_req" name="VIP Requests" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="total_free_req" name="Free Requests" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel grid-col-6">
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper green"><Activity size={16} /></div>
            SHARED TOKEN PROCESSING
          </div>
        </div>
        <div style={{ width: '100%', height: '280px' }}>
          <ResponsiveContainer>
            <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="tick" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36}/>
              <Line type="monotone" dataKey="tick_prompt_tokens" name="Prompt Tokens" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="tick_gen_tokens" name="Generated Tokens" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Macro Stats Row */}
      <div className="grid-col-12" style={{ background: 'transparent', border: 'none', padding: 0, boxShadow: 'none' }}>
        <h3 style={{ fontSize: '0.9rem', color: '#fff', margin: '8px 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
          <Activity size={18} /> AGENT MACRO STATS (LIVE TICK VIEW)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`, gap: '16px' }}>
          {batchData?.agents?.map((agent, index) => {
            const agentRes = batchData.results_by_task[currentTaskView]?.[agent];
            const session = agentRes?.session_logs?.[0];
            const liveTickLog = currentUnifiedTick?.raw_logs?.[agent];
            if (!session) return null;
            
            const liveScore = liveTickLog?.score || session.final_score;
            const liveGPU = liveTickLog?.gpu_utilization_pct || 0;
            const liveCPU = liveTickLog?.cpu_utilization_pct || 0;
            const livePressure = liveTickLog?.memory_pressure_trend || 0;
            
            return (
              <div key={agent} className="panel" style={{ padding: '16px', borderTop: `4px solid ${getAgentColor(agent, index)}` }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#fff', marginBottom: '12px', textTransform: 'uppercase' }}>
                  {agent}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Live Score:</span>
                    <span style={{ color: liveScore < 0 ? 'var(--danger-color)' : '#10b981', fontWeight: 'bold' }}>{liveScore.toFixed(3)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>GPU / CPU Util:</span>
                    <span style={{ color: '#fff' }}>{(liveGPU * 100).toFixed(1)}% / {(liveCPU * 100).toFixed(1)}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Mem Pressure:</span>
                    <span style={{ color: livePressure > 0.8 ? 'var(--danger-color)' : '#f59e0b' }}>{livePressure.toFixed(3)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Total Reward:</span>
                    <span style={{ color: '#fff' }}>{session.total_reward.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                    <span style={{ color: session.crashed ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{session.crashed ? 'CRASHED' : 'COMPLETED'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Focus Selector Tabs */}
      <div style={{ gridColumn: 'span 12', display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Inspect Agent Details:</span>
        {batchData?.agents?.map((agent, index) => (
          <button 
            key={agent}
            className={`btn ${currentAgentFocus === agent ? 'active' : ''}`}
            style={{ 
              border: currentAgentFocus === agent ? `1px solid ${getAgentColor(agent, index)}` : '1px solid rgba(255,255,255,0.1)', 
              background: currentAgentFocus === agent ? 'rgba(255,255,255,0.05)' : 'transparent',
              color: currentAgentFocus === agent ? getAgentColor(agent, index) : '#fff'
            }}
            onClick={() => setCurrentAgentFocus(agent)}
          >
            {agent.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Top Row: Focus Agent Metrics */}
      <div className="panel grid-col-4">
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper green"><Activity size={16} /></div>
            AGENT FOCUS: {currentAgentFocus.toUpperCase()}
          </div>
          <span className="metric-badge" style={{ background: scoreBg, color: scoreColor, transition: 'all 0.3s' }}>
            Score: {currentScore.toFixed(2)}
          </span>
        </div>
        <div className="metric-list">
          <div className="metric-item">
            <span className="metric-badge">Memory Trend</span>
            <div className="metric-value">
              {focusLog ? (focusLog.memory_pressure_trend || 0).toFixed(3) : 0}
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-badge">Yield Preempt</span>
            <div className="metric-value">
              {focusLog ? (focusLog.yield_preempt_active || 0).toFixed(3) : 0}
            </div>
          </div>
        </div>
      </div>

      <div className="panel grid-col-4" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper green"><Cpu size={16} /></div>
            RESOURCE UTILIZATION
          </div>
        </div>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>GPU Utilization</span>
              <span style={{ fontWeight: 'bold', color: getResourceColor(currentGpu) }}>
                {(currentGpu * 100).toFixed(1)}%
              </span>
            </div>
            <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: `${currentGpu * 100}%`, height: '100%', background: getResourceColor(currentGpu), transition: 'all 0.3s ease' }}></div>
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
              <div style={{ width: `${currentCpu * 100}%`, height: '100%', background: getResourceColor(currentCpu), transition: 'all 0.3s ease' }}></div>
            </div>
          </div>
        </div>

        {/* Focus Agent Session Summary Download */}
        {focusSession && (
          <div style={{ marginTop: '20px', padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 'bold' }}>
                Download {currentAgentFocus.toUpperCase()} Logs
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="btn" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => downloadSession('json')}>JSON</button>
                <button className="btn" style={{ padding: '2px 6px', fontSize: '0.65rem' }} onClick={() => downloadSession('csv')}>CSV</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel grid-col-4" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header">
          <div className="panel-title">
            <div className="icon-wrapper"><TerminalSquare size={16} /></div>
            EVENT LOG
          </div>
        </div>
        <div className="log-container" style={{ maxHeight: '350px' }}>
          {history.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '20px', fontSize: '0.85rem' }}>
              No logs yet.
            </div>
          ) : (
            [...history].reverse().map((tickObj, index) => {
              const log = tickObj.raw_logs && tickObj.raw_logs[currentAgentFocus];
              if (!log) return null;
              return (
                <div key={`${tickObj.tick}-${index}`} className={`log-item ${index === 0 ? 'highlight' : ''}`}>
                  <span className="log-tick">[{tickObj.tick || 0}]</span>
                  <span className="log-action">ACTION: {log.action || 'Unknown'}</span>
                  <span className="log-reward" style={log.reward < 0 ? { color: 'var(--danger-color)' } : {}}>
                    {log.reward > 0 ? '+' : ''}{(log.reward || 0).toFixed(2)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}

export default App;
