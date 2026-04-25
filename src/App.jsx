import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, FastForward, Rewind, Activity, Cpu, Database, TerminalSquare, AlertTriangle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './index.css';

const API_URL = 'https://suryanshchattree-neural-paged-attention-env.hf.space/api/simulate';
const MAX_HISTORY = 150; // Rolling buffer size to prevent chart freezing

function App() {
  // Config state
  const [selectedAgent, setSelectedAgent] = useState('lru');
  const [selectedTask, setSelectedTask] = useState('hard');
  
  // Playback state
  const [simulationTrace, setSimulationTrace] = useState([]);
  const [sessionData, setSessionData] = useState(null);
  const [currentTickIndex, setCurrentTickIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Keep ref sync with state for the interval
  const playStateRef = useRef({ isPlaying, currentTickIndex, traceLength: simulationTrace.length });
  useEffect(() => {
    playStateRef.current = { isPlaying, currentTickIndex, traceLength: simulationTrace.length };
  }, [isPlaying, currentTickIndex, simulationTrace.length]);

  const fetchSimulation = async () => {
    setIsLoading(true);
    setIsPlaying(false);
    setError(null);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: selectedAgent, task: selectedTask })
      });
      
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      
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
      
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to fetch simulation data.');
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

  return (
    <div className="dashboard-container">
      
      {/* Controls Panel */}
      <div className="controls">
        <select className="btn" value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
          <option value="lru">LRU Agent</option>
          <option value="random">Random Agent</option>
          <option value="fifo">FIFO Agent</option>
        </select>
        
        <select className="btn" value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
          <option value="easy">Easy Task</option>
          <option value="medium">Medium Task</option>
          <option value="hard">Hard Task</option>
        </select>
        
        <button 
          className="btn" 
          onClick={fetchSimulation}
          disabled={isLoading}
          style={{ background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)' }}
        >
          {isLoading ? 'FETCHING...' : 'RUN SIMULATION'}
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
        
        <span style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {simulationTrace.length > 0 ? `Tick: ${currentTickIndex + 1} / ${simulationTrace.length}` : ''}
        </span>

        {error && <span style={{ color: 'var(--danger-color)', fontSize: '0.8rem', marginLeft: '12px' }}>{error}</span>}
      </div>

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
            TRAFFIC GENERATION (QUEUE PRESSURE)
          </div>
        </div>
        <div style={{ width: '100%', height: '350px' }}>
          <ResponsiveContainer>
            <LineChart data={history} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="tick" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="vip_queue_pressure" name="VIP Pressure" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="free_queue_pressure" name="Free Pressure" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
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
