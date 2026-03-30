export const getX = (col: number) => 13 - 2 * Math.abs(7 - col);
export const getPadding = (col: number) => (13 - getX(col)) / 2;

export const INITIAL_POSITIONS = {
  2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0
};

export type Player = {
  id: string;
  name: string;
  color: string;
};

export type GameState = {
  status: 'lobby' | 'playing' | 'finished';
  round: number;
  players: Player[];
  activePlayerIndex: number;
  positions: Record<string, Record<number, number>>; // playerId -> col -> pos
  claimed: Record<number, string | null>; // col -> playerId
  turnState: {
    dice: number[] | null;
    movedCols: number[];
    tempPos: Record<number, number>;
    canRoll: boolean;
    outcomes: any[];
    isBust: boolean;
  };
  winner: string | null;
  winningRound: number | null;
};

export const rollDice = () => {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
};

export const calculateOutcomes = (
  dice: number[],
  tempPos: Record<number, number>,
  movedCols: number[],
  claimed: Record<number, string | null>,
  activePlayerId: string
) => {
  const pairings = [
    { A: dice[0] + dice[1], B: dice[2] + dice[3] },
    { A: dice[0] + dice[2], B: dice[1] + dice[3] },
    { A: dice[0] + dice[3], B: dice[1] + dice[2] },
  ];

  const outcomes: any[] = [];
  const uniqueStates = new Set<string>();

  const tryApply = (num: number, pos: Record<number, number>, cols: number[]) => {
    if (claimed[num] !== undefined && claimed[num] !== null && claimed[num] !== activePlayerId) return null;
    const maxLen = getX(num);
    if (pos[num] >= maxLen - 1) return null; // already at end

    if (cols.includes(num)) {
      return { pos: { ...pos, [num]: pos[num] + 1 }, cols };
    } else {
      if (cols.length < 3) {
        return { pos: { ...pos, [num]: pos[num] + 1 }, cols: [...cols, num] };
      }
      return null;
    }
  };

  pairings.forEach(({ A, B }) => {
    // Path 1: A then B
    let rA1 = tryApply(A, tempPos, movedCols);
    let st1 = rA1 || { pos: tempPos, cols: movedCols };
    let rB1 = tryApply(B, st1.pos, st1.cols);
    let final1 = rB1 || st1;
    let u1 = (rA1 ? 1 : 0) + (rB1 ? 1 : 0);

    // Path 2: B then A
    let rB2 = tryApply(B, tempPos, movedCols);
    let st2 = rB2 || { pos: tempPos, cols: movedCols };
    let rA2 = tryApply(A, st2.pos, st2.cols);
    let final2 = rA2 || st2;
    let u2 = (rB2 ? 1 : 0) + (rA2 ? 1 : 0);

    const addOutcome = (finalSt: any, used: number, order: number[]) => {
      const stateKey = JSON.stringify({
        pos: finalSt.pos,
        cols: [...finalSt.cols].sort(),
      });
      if (!uniqueStates.has(stateKey)) {
        uniqueStates.add(stateKey);
        outcomes.push({
          state: finalSt,
          usedCount: used,
          order,
          label: used === 0 ? "Bust" : `组合: ${order.join(' 和 ')}`,
        });
      }
    };

    const order1 = [];
    if (rA1) order1.push(A);
    if (rB1) order1.push(B);
    addOutcome(final1, u1, order1);

    const order2 = [];
    if (rB2) order2.push(B);
    if (rA2) order2.push(A);
    addOutcome(final2, u2, order2);
  });

  // Only keep non-bust outcomes, unless ALL are bust
  const nonBust = outcomes.filter(o => o.usedCount > 0);
  if (nonBust.length === 0) {
    return { isBust: true, outcomes: [outcomes[0]] }; // just return one bust outcome
  }

  // Filter out clearly suboptimal outcomes (like applying only 1 when we could apply 2 from the SAME pairing)
  // To keep it simple, we just present all unique non-bust outcomes. The player can choose freely.
  return { isBust: false, outcomes: nonBust };
};
