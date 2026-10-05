// Dragon Sic Bo: three dice, one shared table. The rules live here so the server and
// the tests use the same numbers. src/lib/sicbo.js is the page's copy and must match.
export const SICBO_NAME = 'Blacklist Dragon Sic Bo';

// What each spot pays "to 1" (a winning 10 on a 33-to-1 spot gets 330 plus the 10 back).
//   small / big  total 4-10 / 11-17. Any triple loses.
//   odd / even   the total is odd / even. Any triple loses.
//   triple       all three dice the same.
//   t4 ... t17   the exact total.
//   n1 ... n6    that number shows on one, two or three dice (see SINGLE_PAYS).
export const SICBO_PAYS: Record<string, number> = {
  small: 1, big: 1, odd: 1, even: 1, triple: 33,
  t4: 67, t5: 33, t6: 20, t7: 13, t8: 9, t9: 7, t10: 6, t11: 6, t12: 7, t13: 9, t14: 13, t15: 20, t16: 33, t17: 67
};
export const SINGLE_PAYS = [0, 1, 2, 12]; // by how many dice show the number
export const SICBO_SPOTS = [...Object.keys(SICBO_PAYS), 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'];

export const validSicboBet = (x) => !!x && SICBO_SPOTS.includes(String(x.type));
export const validDice = (d) => Array.isArray(d) && d.length === 3 && d.every((n) => Number.isInteger(n) && n >= 1 && n <= 6);
export const diceTotal = (d: number[]) => d[0] + d[1] + d[2];
export const isTriple = (d: number[]) => d[0] === d[1] && d[1] === d[2];

// What one point on `type` comes back as, the point itself included. 0 = lost.
export function sicboReturn(type: string, d: number[]): number {
  const total = diceTotal(d), triple = isTriple(d);
  if (type === 'small') return !triple && total >= 4 && total <= 10 ? 2 : 0;
  if (type === 'big') return !triple && total >= 11 && total <= 17 ? 2 : 0;
  if (type === 'odd') return !triple && total % 2 === 1 ? 2 : 0;
  if (type === 'even') return !triple && total % 2 === 0 ? 2 : 0;
  if (type === 'triple') return triple ? SICBO_PAYS.triple + 1 : 0;
  if (type[0] === 't') return Number(type.slice(1)) === total ? SICBO_PAYS[type] + 1 : 0;
  if (type[0] === 'n') { const hits = d.filter((x) => x === Number(type.slice(1))).length; return hits ? SINGLE_PAYS[hits] + 1 : 0; }
  return 0;
}

export function sicboPayout(bets, d: number[]): number {
  let payout = 0;
  for (const x of bets || []) if (validSicboBet(x)) payout += Math.floor(Number(x.amount) || 0) * sicboReturn(String(x.type), d);
  return payout;
}

export const describeRoll = (d: number[]) => {
  const total = diceTotal(d);
  return `${d.join(' · ')} = ${total}${isTriple(d) ? ', a triple' : total >= 11 ? ', Big' : ', Small'}`;
};