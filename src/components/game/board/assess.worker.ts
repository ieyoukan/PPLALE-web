// Assesses the positions of a match off the main thread, one per task so a newer request
// (the match went on) replaces the old one without waiting for it to finish.
import { assessMatch } from './assess';
import type { AssessedPoint, AssessRequest, AssessResponse } from './assess';
import { syncAssessment } from './assessmentCache';
import type { AssessmentCache } from './assessmentCache';

export type { AssessRequest, AssessResponse } from './assess';

const scope = self as unknown as Worker;
// Positions already judged, kept while the match (its first state) stays the same.
let cache: AssessmentCache | null = null, current = 0;
scope.addEventListener('message', (event: MessageEvent<AssessRequest>) => {
  const request = event.data;
  cache = syncAssessment(cache ?? request.saved ?? null, request.initial, request.viewer, request.commands);
  const record = cache;
  const known = new Map<number, AssessedPoint>(record.points.map(point => [point.index, point]));
  current = request.id;
  // Include work finished just before a newer request arrived, whose old response may be ignored.
  scope.postMessage({ id: request.id, points: record.points.filter(point => point.index <= request.commands.length) } satisfies AssessResponse);
  const steps = assessMatch(request, known);
  const next = () => {
    if (request.id !== current) return;
    const step = steps.next();
    record.points = [...known.values()];
    scope.postMessage((step.done ? { id: request.id, done: true } : { id: request.id, point: step.value }) satisfies AssessResponse);
    if (!step.done) setTimeout(next, 0);
  };
  next();
});
