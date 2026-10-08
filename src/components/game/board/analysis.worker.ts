// Runs 「最善手を調べる」 off the main thread: the searches take a few seconds.
import { analyze } from './analysis';
import type { AnalysisRequest, AnalysisResponse } from './analysis';

const scope = self as unknown as Worker;
scope.addEventListener('message', (event: MessageEvent<AnalysisRequest>) => {
  scope.postMessage({ id: event.data.id, analysis: analyze(event.data.game) } satisfies AnalysisResponse);
});
