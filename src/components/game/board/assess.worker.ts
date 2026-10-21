// Assesses the positions of a match off the main thread, one per task so a newer request
// (the match went on) replaces the old one without waiting for it to finish.
import { assessMatch, assessPositions } from './assess';
import type { AssessedPoint, AssessRequest, AssessResponse, PositionsRequest } from './assess';
import { syncAssessment } from './assessmentCache';
import type { AssessmentCache } from './assessmentCache';

export type { AssessRequest, AssessResponse, PositionsRequest } from './assess';

const scope = self as unknown as Worker;
scope.postMessage({ type: 'pplale-ready' });
// Positions already judged, kept while the match (its first state) stays the same.
let cache: AssessmentCache | null = null, current = 0;
/** Runs `steps` one point per task while `id` is the newest request. */
function stream(id: number, steps: Generator<AssessedPoint>, after?: () => void) {
  const next = () => {
    if (id !== current) return;
    const step = steps.next();
    after?.();
    scope.postMessage((step.done ? { id, done: true } : { id, point: step.value }) satisfies AssessResponse);
    if (!step.done) setTimeout(next, 0);
  };
  next();
}
scope.addEventListener('message', (event: MessageEvent<AssessRequest | PositionsRequest>) => {
  if ('positions' in event.data) {
    // A replay's positions: judged as they stand, not part of the match being played.
    const { id, positions, viewer, known = [] } = event.data;
    current = id;
    return stream(id, assessPositions({ positions, viewer }, new Map(known.map(point => [point.index, point]))));
  }
  const request = event.data;
  cache = syncAssessment(cache ?? request.saved ?? null, request.initial, request.viewer, request.commands);
  const record = cache;
  const known = new Map<number, AssessedPoint>(record.points.map(point => [point.index, point]));
  current = request.id;
  // Include work finished just before a newer request arrived, whose old response may be ignored.
  scope.postMessage({ id: request.id, points: record.points.filter(point => point.index <= request.commands.length) } satisfies AssessResponse);
  stream(request.id, assessMatch(request, known), () => { record.points = [...known.values()]; });
});
