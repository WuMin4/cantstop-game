import React from 'react';
import { getX, getPadding, GameState } from './gameLogic';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: (string | undefined | null | false)[]) => twMerge(clsx(inputs));

export const Board = ({ gameState }: { gameState: GameState }) => {
  const columns = Array.from({ length: 11 }, (_, i) => i + 2);
  const activePlayer = gameState.players[gameState.activePlayerIndex];

  return (
    <div className="grid grid-cols-11 grid-rows-[repeat(13,1fr)] gap-1 p-4 bg-gray-800 rounded-lg w-full max-w-4xl mx-auto shadow-xl">
      {columns.map(col => {
        const X = getX(col);
        const pad = getPadding(col);
        const claimedBy = gameState.claimed[col];

        return Array.from({ length: X }, (_, pos) => {
          // pos 0 to X-1
          // row 0 is top, 12 is bottom.
          // Bottom cell (pos=0) is at row `13 - pad - 1`
          // Top cell (pos=X-1) is at row `pad`
          // So gridRow is `13 - pad - pos`
          const gridRow = 13 - pad - pos;

          // Find pieces at this pos
          // Check if active player's tempPos is here
          const hasTempRunner = activePlayer && gameState.turnState.movedCols.includes(col) && gameState.turnState.tempPos[col] === pos;
          const tempRunnerPlayer = hasTempRunner ? activePlayer : null;

          // Check if active player's saved pos is here but hidden by temp runner?
          // We can show a ghost of the saved pos if we want, but let's just keep it simple.
          // Wait, if temp runner is at pos 2, and saved is at pos 0, the saved should be SHOWN as a ghost at pos 0!
          // So the above `isTempActive` shouldn't hide it entirely.
          // Let's fix that.
          
          const savedTokens = gameState.players.map(p => {
            const savedPos = gameState.positions[p.id]?.[col] || 0;
            const isTempActive = p.id === activePlayer?.id && gameState.turnState.movedCols.includes(col);
            if (savedPos === pos) {
              return { player: p, isGhost: isTempActive };
            }
            return null;
          }).filter(Boolean) as {player: any, isGhost: boolean}[];

          const isTop = pos === X - 1;
          const isBottom = pos === 0;

          return (
            <div
              key={`${col}-${pos}`}
              className={cn(
                "relative bg-gray-700 border-2 rounded-md flex items-center justify-center min-h-[40px] transition-all",
                claimedBy ? "border-opacity-50" : "border-gray-600",
                claimedBy && getPlayerColorBg(claimedBy) + " bg-opacity-30",
              )}
              style={{
                gridColumn: col - 1,
                gridRow: gridRow,
              }}
            >
              {/* Column labels */}
              {isTop && (
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-white font-bold text-lg">
                  {col}
                </span>
              )}
              {isBottom && (
                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-gray-400 font-bold text-sm">
                  {col}
                </span>
              )}

              {/* Tokens */}
              <div className="flex flex-wrap gap-1 justify-center items-center absolute inset-1">
                {savedTokens.map((t, i) => {
                  const isCurrentPlayer = activePlayer && t.player.id === activePlayer.id;
                  return (
                    <div
                      key={`saved-${t.player.id}-${i}`}
                      className={cn(
                        "rounded-full shadow-sm transition-all duration-300",
                        getPlayerColorBg(t.player.color),
                        t.isGhost ? "opacity-30 w-4 h-4" : "opacity-100",
                        isCurrentPlayer && !t.isGhost ? "w-5 h-5 ring-2 ring-white ring-offset-1 ring-offset-gray-700 z-10 scale-110" : "w-4 h-4 z-0"
                      )}
                    />
                  );
                })}
                {hasTempRunner && (
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full border-[3px] border-white shadow-[0_0_15px_rgba(255,255,255,1)] animate-bounce z-20 absolute",
                      getPlayerColorBg(tempRunnerPlayer!.color)
                    )}
                  />
                )}
                {/* Winner crown/marker at the top */}
                {isTop && claimedBy && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl z-0 opacity-20">
                    👑
                  </div>
                )}
              </div>
            </div>
          );
        });
      })}
    </div>
  );
};

export const getPlayerColorBg = (color: string) => {
  switch (color) {
    case 'red': return 'bg-red-500';
    case 'blue': return 'bg-blue-500';
    case 'green': return 'bg-green-500';
    case 'yellow': return 'bg-yellow-400';
    case 'purple': return 'bg-purple-500';
    case 'pink': return 'bg-pink-500';
    default: return 'bg-gray-400';
  }
};
