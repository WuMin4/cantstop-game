import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import { GameState, rollDice, calculateOutcomes, INITIAL_POSITIONS, Player } from './gameLogic';
import { Board } from './Board';
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Crown, CheckCircle, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

const generateRoomCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const INITIAL_STATE: GameState = {
  status: 'lobby',
  round: 1,
  players: [],
  activePlayerIndex: 0,
  positions: {},
  claimed: {},
  turnState: {
    dice: null,
    movedCols: [],
    tempPos: { ...INITIAL_POSITIONS },
    canRoll: true,
    outcomes: [],
    isBust: false,
  },
  winner: null,
  winningRound: null,
};

const COLORS = ['red', 'blue', 'green', 'yellow'];

function App() {
  const [mode, setMode] = useState<'menu' | 'lobby' | 'playing'>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [connections, setConnections] = useState<any[]>([]);
  const [hostConnection, setHostConnection] = useState<any>(null);
  const [showTutorial, setShowTutorial] = useState(false);
  
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const myPlayerRef = useRef<Player | null>(null);

  // Fix bug: Ensure Host transitions to playing mode when game starts
  useEffect(() => {
    if (gameState.status === 'playing' && mode !== 'playing') {
      setMode('playing');
    }
  }, [gameState.status, mode]);

  // Sync state to clients if Host
  useEffect(() => {
    if (isHost && connections.length > 0) {
      connections.forEach(conn => conn.send({ type: 'STATE_UPDATE', state: gameState }));
    }
  }, [gameState, isHost, connections]);

  const handleSinglePlayer = () => {
    setIsHost(true);
    setRoomCode('SINGLE');
    const hostPlayer: Player = { id: 'single', name: '玩家1', color: COLORS[0] };
    myPlayerRef.current = hostPlayer;
    setGameState({
      ...INITIAL_STATE,
      status: 'playing',
      players: [hostPlayer],
      positions: { 'single': { ...INITIAL_POSITIONS } }
    });
  };

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    setRoomCode(code);
    setIsHost(true);

    const newPeer = new Peer(`cantstop-room-${code}`);
    newPeer.on('open', (id) => {
      console.log('Host Peer ID:', id);
      setMode('lobby');
      
      const hostPlayer: Player = { id: newPeer.id, name: '玩家1', color: COLORS[0] };
      myPlayerRef.current = hostPlayer;
      
      setGameState(prev => ({
        ...prev,
        players: [hostPlayer],
        positions: { [hostPlayer.id]: { ...INITIAL_POSITIONS } }
      }));
    });

    newPeer.on('connection', (conn) => {
      conn.on('data', (data: any) => {
        if (data.type === 'JOIN') {
          setGameState(prev => {
            if (prev.players.length >= 4) {
              conn.send({ type: 'ERROR', message: '房间已满' });
              return prev;
            }
            const newPlayer: Player = {
              id: conn.peer,
              name: `玩家${prev.players.length + 1}`,
              color: COLORS[prev.players.length]
            };
            const nextState = {
              ...prev,
              players: [...prev.players, newPlayer],
              positions: { ...prev.positions, [newPlayer.id]: { ...INITIAL_POSITIONS } }
            };
            conn.send({ type: 'JOIN_SUCCESS', player: newPlayer, state: nextState });
            setConnections(c => [...c, conn]);
            return nextState;
          });
        } else if (data.type === 'ACTION') {
          handleAction(data.action, conn.peer);
        }
      });
      
      conn.on('close', () => {
        setConnections(c => c.filter(x => x.peer !== conn.peer));
      });
    });

    setPeer(newPeer);
  };

  const handleJoinRoom = () => {
    if (!roomCode) return alert("请输入6位房间号");
    setIsHost(false);

    const newPeer = new Peer();
    newPeer.on('open', () => {
      const conn = newPeer.connect(`cantstop-room-${roomCode}`);
      conn.on('open', () => {
        conn.send({ type: 'JOIN' });
        setHostConnection(conn);
        setMode('lobby');
      });

      conn.on('data', (data: any) => {
        if (data.type === 'JOIN_SUCCESS') {
          myPlayerRef.current = data.player;
          setGameState(data.state);
        } else if (data.type === 'STATE_UPDATE') {
          setGameState(data.state);
        } else if (data.type === 'ERROR') {
          alert(data.message);
          setMode('menu');
        }
      });
    });

    setPeer(newPeer);
  };

  const sendAction = (action: any) => {
    if (isHost) {
      handleAction(action, myPlayerRef.current!.id);
    } else if (hostConnection) {
      hostConnection.send({ type: 'ACTION', action });
    }
  };

  // The Host executes all game logic
  const handleAction = (action: any, playerId: string) => {
    setGameState(prev => {
      if (prev.status !== 'playing' && action.type !== 'START_GAME') return prev;
      
      const activePlayer = prev.players[prev.activePlayerIndex];
      if (action.type !== 'START_GAME' && playerId !== activePlayer.id) return prev;

      switch (action.type) {
        case 'START_GAME':
          return {
            ...prev,
            status: 'playing',
            turnState: {
              ...prev.turnState,
              tempPos: { ...prev.positions[prev.players[0].id] },
            }
          };

        case 'ROLL_DICE':
          const dice = rollDice();
          const outcomeData = calculateOutcomes(dice, prev.turnState.tempPos, prev.turnState.movedCols, prev.claimed, activePlayer.id);
          return {
            ...prev,
            turnState: {
              ...prev.turnState,
              dice,
              canRoll: false,
              outcomes: outcomeData.outcomes,
              isBust: outcomeData.isBust,
            }
          };

        case 'SELECT_OUTCOME':
          const { state: outcomeState } = action;
          return {
            ...prev,
            turnState: {
              ...prev.turnState,
              tempPos: outcomeState.pos,
              movedCols: Array.from(outcomeState.cols),
              canRoll: true,
              dice: null,
              outcomes: [],
              isBust: false,
            }
          };

        case 'BUST':
        case 'END_TURN':
          let newPositions = { ...prev.positions };
          let newClaimed = { ...prev.claimed };
          let winner = prev.winner;
          let winningRound = prev.winningRound;

          if (action.type === 'END_TURN') {
            // Save progress
            newPositions[activePlayer.id] = { ...prev.turnState.tempPos };
            
            // Check for claims
            let claimedCount = 0;
            // First count existing claims
            Object.values(newClaimed).forEach(id => {
               if (id === activePlayer.id) claimedCount++;
            });

            prev.turnState.movedCols.forEach(col => {
              const maxLen = 13 - 2 * Math.abs(7 - col);
              if (newPositions[activePlayer.id][col] >= maxLen - 1) {
                 if (!newClaimed[col]) {
                   newClaimed[col] = activePlayer.id;
                   claimedCount++;
                 }
              }
            });

            if (claimedCount >= 3 && !winner) {
              winner = activePlayer.id;
              winningRound = prev.round;
            }
          }

          const nextIndex = (prev.activePlayerIndex + 1) % prev.players.length;
          const nextRound = nextIndex === 0 ? prev.round + 1 : prev.round;
          const nextPlayerId = prev.players[nextIndex].id;

          return {
            ...prev,
            round: nextRound,
            activePlayerIndex: nextIndex,
            positions: newPositions,
            claimed: newClaimed,
            winner,
            winningRound,
            status: winner ? 'finished' : 'playing',
            turnState: {
              dice: null,
              movedCols: [],
              tempPos: { ...(newPositions[nextPlayerId] || INITIAL_POSITIONS) },
              canRoll: true,
              outcomes: [],
              isBust: false,
            }
          };

        default:
          return prev;
      }
    });
  };

  const TutorialModal = () => (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 p-6 rounded-xl max-w-lg w-full shadow-2xl border border-gray-700">
        <h2 className="text-2xl font-bold mb-4 text-yellow-400">游戏规则：欲罢不能</h2>
        <ul className="list-disc list-inside text-gray-300 space-y-3 text-sm leading-relaxed">
          <li>场上11列代表数字2-12。轮到你时，掷4个骰子。</li>
          <li>骰子两两组合相加，你会得到2个数字。</li>
          <li>选择一种组合，移动对应列的棋子（每回合最多只能激活3列）。</li>
          <li>如果你无法移动任何棋子，你就 <strong>Bust（爆牌）</strong>了，本回合的所有进度都会丢失，并结束回合。</li>
          <li>你可以随时选择 <strong>“结束回合 (保存进度)”</strong>，这样当前回合前进的步数会被永久保存。</li>
          <li>当棋子到达某列最顶端，你就 <strong>占领</strong> 了该列！其他玩家在该列的进度会被清空。</li>
          <li className="text-yellow-400 font-bold text-base mt-2">率先占领三列的玩家将获得最终胜利！</li>
        </ul>
        <button onClick={() => setShowTutorial(false)} className="mt-8 w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold transition shadow-lg">
          我明白了
        </button>
      </div>
    </div>
  );

  // Renders
  if (mode === 'menu') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative">
        {showTutorial && <TutorialModal />}
        
        <button onClick={() => setShowTutorial(true)} className="absolute top-4 right-4 bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg font-semibold transition">
          玩法教程
        </button>

        <h1 className="text-5xl font-extrabold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-yellow-500">
          欲罢不能
        </h1>
        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md flex flex-col gap-6">
          <div>
            <label className="block text-sm text-gray-400 mb-2">房间号 (加入必填)</label>
            <input 
              value={roomCode} 
              onChange={e => setRoomCode(e.target.value)}
              className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition tracking-widest text-center"
              placeholder="6位数字"
              maxLength={6}
            />
          </div>
          
          <div className="flex flex-col gap-4 mt-2">
            <button 
              onClick={handleSinglePlayer}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 py-3 rounded-lg font-bold shadow-lg transform hover:scale-105 transition"
            >
              单人游戏 (测试)
            </button>
            <div className="flex gap-4">
              <button 
                onClick={handleCreateRoom}
                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 py-3 rounded-lg font-bold shadow-lg transform hover:scale-105 transition"
              >
                创建房间
              </button>
              <button 
                onClick={handleJoinRoom}
                className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 py-3 rounded-lg font-bold shadow-lg transform hover:scale-105 transition"
              >
                加入房间
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'lobby') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
          <h2 className="text-3xl font-bold mb-2">等待开始</h2>
          <p className="text-gray-400 mb-6">
            房间号: <span className="text-2xl font-mono text-yellow-400 tracking-widest bg-gray-900 px-4 py-1 rounded ml-2">{roomCode}</span>
          </p>

          <div className="bg-gray-700 rounded-lg p-4 mb-8 text-left">
            <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3 border-b border-gray-600 pb-2">已加入玩家 ({gameState.players.length}/4)</h3>
            <ul className="space-y-3">
              {gameState.players.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 bg-gray-800 p-2 rounded">
                  <div className={cn("w-4 h-4 rounded-full", p.color === 'red' ? 'bg-red-500' : p.color === 'blue' ? 'bg-blue-500' : p.color === 'green' ? 'bg-green-500' : 'bg-yellow-400')} />
                  <span className="font-medium">{p.name}</span>
                  {i === 0 && <span className="ml-auto text-xs bg-yellow-600 text-white px-2 py-1 rounded">房主</span>}
                </li>
              ))}
            </ul>
          </div>

          {isHost ? (
            <button 
              onClick={() => sendAction({ type: 'START_GAME' })}
              disabled={gameState.players.length < 1}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-3 rounded-lg font-bold transition"
            >
              开始游戏
            </button>
          ) : (
            <p className="text-gray-400 animate-pulse">等待房主开始游戏...</p>
          )}
        </div>
      </div>
    );
  }

  const activePlayer = gameState.players[gameState.activePlayerIndex];
  const isMyTurn = activePlayer?.id === myPlayerRef.current?.id;

  const renderDice = (value: number, idx: number) => {
    const diceIcons = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
    const Icon = diceIcons[value - 1] || Dice1;
    return <Icon key={idx} className="w-12 h-12 text-white bg-gray-800 rounded-xl" />;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8 flex flex-col">
      {showTutorial && <TutorialModal />}
      <header className="flex justify-between items-center mb-6 bg-gray-800 p-4 rounded-xl shadow-lg relative">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-yellow-500">欲罢不能</h1>
            <p className="text-sm text-gray-400">房间: {roomCode}</p>
          </div>
          <button onClick={() => setShowTutorial(true)} className="ml-4 text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition">
            规则教程
          </button>
        </div>
        <div className="text-center absolute left-1/2 -translate-x-1/2">
          <p className="text-xs text-gray-400 uppercase tracking-wider">当前回合</p>
          <p className="text-3xl font-mono text-blue-400">{gameState.round}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-bold">{myPlayerRef.current?.name}</p>
            <p className="text-xs text-gray-400">你</p>
          </div>
          <div className={cn("w-10 h-10 rounded-full border-2 border-white", myPlayerRef.current?.color === 'red' ? 'bg-red-500' : myPlayerRef.current?.color === 'blue' ? 'bg-blue-500' : myPlayerRef.current?.color === 'green' ? 'bg-green-500' : 'bg-yellow-400')} />
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-8 flex-1">
        {/* Left: Board */}
        <div className="flex-1 flex flex-col justify-center">
          <Board gameState={gameState} />
        </div>

        {/* Right: Controls & Status */}
        <div className="w-full lg:w-96 flex flex-col gap-6">
          
          {gameState.status === 'finished' ? (
            <div className="bg-yellow-600 text-white p-6 rounded-xl shadow-2xl text-center border-4 border-yellow-400">
              <Crown className="w-16 h-16 mx-auto mb-4 text-yellow-200" />
              <h2 className="text-2xl font-bold mb-2">游戏结束!</h2>
              <p className="text-lg mb-2">
                胜利者: <span className="font-bold text-yellow-100">{gameState.players.find(p => p.id === gameState.winner)?.name}</span>
              </p>
              <p className="text-sm">在第 <span className="font-bold">{gameState.winningRound}</span> 回合取得胜利!</p>
            </div>
          ) : (
            <div className={`p-6 rounded-xl shadow-lg border-2 transition-all ${isMyTurn ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-800 border-gray-700'}`}>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                {isMyTurn ? <span className="animate-pulse w-3 h-3 bg-green-500 rounded-full"></span> : null}
                {isMyTurn ? '你的回合!' : `等待 ${activePlayer?.name} 行动...`}
              </h2>

              {isMyTurn && (
                <div className="space-y-6">
                  {/* Dice Area */}
                  {gameState.turnState.dice && (
                    <div className="bg-gray-800 p-4 rounded-lg flex justify-center gap-4 shadow-inner">
                      {gameState.turnState.dice.map((d, i) => renderDice(d, i))}
                    </div>
                  )}

                  {/* Actions */}
                  {gameState.turnState.canRoll ? (
                    <div className="space-y-3">
                      <button
                        onClick={() => sendAction({ type: 'ROLL_DICE' })}
                        className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-lg shadow-lg transform hover:scale-105 transition flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-5 h-5" /> 投掷骰子
                      </button>
                      
                      {gameState.turnState.movedCols.length > 0 && (
                        <button
                          onClick={() => sendAction({ type: 'END_TURN' })}
                          className="w-full bg-green-600 hover:bg-green-500 py-4 rounded-xl font-bold text-lg shadow-lg transform hover:scale-105 transition flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-5 h-5" /> 结束回合 (保存进度)
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-400 text-center mb-2">选择一种组合进行操作:</p>
                      
                      {gameState.turnState.isBust ? (
                        <button
                          onClick={() => sendAction({ type: 'BUST' })}
                          className="w-full bg-red-600 hover:bg-red-500 py-4 rounded-xl font-bold text-lg shadow-lg animate-bounce"
                        >
                          Bust! (爆牌, 进度丢失)
                        </button>
                      ) : (
                        gameState.turnState.outcomes.map((outcome, idx) => (
                          <button
                            key={idx}
                            onClick={() => sendAction({ type: 'SELECT_OUTCOME', state: outcome.state })}
                            className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-blue-400 py-3 rounded-lg font-medium transition"
                          >
                            {outcome.label}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* Turn Status */}
                  <div className="text-sm text-gray-400 bg-gray-900/50 p-3 rounded">
                    <p>已激活列 ({gameState.turnState.movedCols.length}/3): {gameState.turnState.movedCols.join(', ') || '无'}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Players List */}
          <div className="bg-gray-800 p-4 rounded-xl shadow-lg flex-1">
            <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4 border-b border-gray-700 pb-2">玩家列表</h3>
            <ul className="space-y-3">
              {gameState.players.map(p => {
                const isTurn = p.id === activePlayer?.id;
                // Count claimed columns
                const claimedCols = Object.entries(gameState.claimed).filter(([_, id]) => id === p.id).map(([c]) => c);
                
                return (
                  <li key={p.id} className={cn("p-3 rounded-lg flex flex-col gap-2 transition-all", isTurn ? "bg-gray-700 border border-gray-600" : "")}>
                    <div className="flex items-center gap-3">
                      <div className={cn("w-4 h-4 rounded-full shadow-sm", p.color === 'red' ? 'bg-red-500' : p.color === 'blue' ? 'bg-blue-500' : p.color === 'green' ? 'bg-green-500' : 'bg-yellow-400')} />
                      <span className={cn("font-medium", isTurn ? "text-white" : "text-gray-400")}>{p.name} {p.id === myPlayerRef.current?.id && "(你)"}</span>
                      {claimedCols.length >= 3 && <Crown className="w-4 h-4 text-yellow-400 ml-auto" />}
                    </div>
                    {claimedCols.length > 0 && (
                      <div className="text-xs flex gap-1 items-center">
                        <span className="text-gray-500">已占领:</span>
                        {claimedCols.map(c => (
                          <span key={c} className={cn("px-1.5 rounded font-mono", p.color === 'red' ? 'bg-red-500/20 text-red-400' : p.color === 'blue' ? 'bg-blue-500/20 text-blue-400' : p.color === 'green' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-400/20 text-yellow-400')}>{c}</span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
