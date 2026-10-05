// While a game is still playing out its result (reels turning, a coin in the air), the
// balance on screen must not jump ahead to the final number. A game sets `active` while
// its animation runs; account refreshes keep the points already on screen until it's done.
export const balanceHold = { active: false };