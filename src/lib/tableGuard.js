import { useEffect, useRef } from "react";

// While a member is seated at a table (Blackjack, Lucky 9, Pusoy Dos, poker), moving to
// another page or game first asks whether they want to leave the table.
// A table registers itself here; LeaveTableGuard (in the page shell) does the asking.
let current = null;   // { message(): string, canLeave(): boolean, leave(): Promise }
let listener = null;  // set by LeaveTableGuard: (go) => void

export const tableGuard = {
  get: () => current,
  listen(fn) { listener = fn; return () => { if (listener === fn) listener = null; }; },
  // Run `go` now, or ask first if the member is seated somewhere.
  ask(go) {
    if (current && listener) listener(go);
    else go();
  }
};

// Called by a table component. `active` is whether the member is seated right now.
export function useTableGuard(active, guard) {
  const ref = useRef(guard);
  ref.current = guard;
  useEffect(() => {
    if (!active) return undefined;
    const mine = {
      message: () => ref.current.message(),
      canLeave: () => (ref.current.canLeave ? ref.current.canLeave() : true),
      leave: () => ref.current.leave()
    };
    current = mine;
    return () => { if (current === mine) current = null; };
  }, [active]);
}