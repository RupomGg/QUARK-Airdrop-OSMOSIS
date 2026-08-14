// In-process, synchronous claim/release guard. Prevents two concurrent
// requests from racing between "read a resource's status" and "write its new
// status" — the classic check-then-act gap that async/await opens up any
// time there's a network or DB call in between. A claim must be taken
// BEFORE the first `await` in a handler, so no other request's code can
// interleave between the check and the reservation (Node only context-switches
// at await points, never mid-synchronous-statement).
//
// Scope this to a single process (fine for the current in-memory dev DB and
// single-instance deployment). A multi-instance production deployment would
// need a real DB-level unique claim (e.g. a conditional UPDATE ... WHERE
// status = 'active' with an affected-rows check) instead.
const claimed = new Set<string>();

export function claim(key: string): boolean {
  if (claimed.has(key)) return false;
  claimed.add(key);
  return true;
}

export function release(key: string): void {
  claimed.delete(key);
}
