// Assesses the positions of a match off the main thread, one per task so a newer request
// (the match went on) replaces the old one without waiting for it to finish.
import { assessMatch } from './assess';
import type { AssessedPoint, AssessRequest, AssessResponse } from './assess';

export type { AssessRequest, AssessResponse } from './assess';

const scope = self as unknown as Worker;
// Positions already judged, kept while the match (its first state) stays the same.
let known = new Map<number, AssessedPoint>(), match: unknown = null, current = 0;
scope.addEventListener('message', (event: MessageEvent<AssessRequest>) => {
  const request = event.data;
  if (request.initial !== match && JSON.stringify(request.initial) !== JSON.stringify(match)) {
    known = new Map();
    match = request.initial;
  }
  current = request.id;
  const steps = assessMatch(request, known);
  const next = () => {
    if (request.id !== current) return;
    const step = steps.next();
    scope.postMessage((step.done ? { id: request.id, done: true } : { id: request.id, point: step.value }) satisfies AssessResponse);
    if (!step.done) setTimeout(next, 0);
  };
  next();
});
