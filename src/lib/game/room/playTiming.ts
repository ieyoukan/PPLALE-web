import { duration, parseServerTiming, roundedMs } from '@pplale/game-core/performance';
import type { PlayKind, PlayOutcome, PlayReport, PlaySample, ServerTiming } from '@pplale/game-core/performance';

type Trace = { kind:PlayKind; input:number; sent:number; revision:number; background:boolean; ack?:number; server?:ServerTiming; reportable?:boolean; timer:ReturnType<typeof setTimeout> };
/** One connection's monotonic clock. IDs/revisions stay here and never enter saved metrics. */
export function playTiming(record: (sample:PlaySample) => void, report: (report:PlayReport) => void, now = () => performance.now()) {
  const pending = new Map<number, Trace>();
  const received = new Map<number, number>(), painted = new Map<number, number>();
  const hidden = () => typeof document !== 'undefined' && document.hidden;
  const prune = (map:Map<number,number>) => { if (map.size > 64) map.delete(map.keys().next().value!); };
  function finish(n:number, outcome:PlayOutcome) {
    const trace = pending.get(n); if (!trace) return;
    pending.delete(n); clearTimeout(trace.timer);
    const view = received.get(trace.revision), paint = painted.get(trace.revision);
    const sample:PlaySample = {kind:trace.kind, at:Math.floor(Date.now()/60000)*60000, outcome, background:trace.background || hidden(), inputToSend:roundedMs(trace.sent-trace.input),
      ...(trace.ack !== undefined && {roundTrip:roundedMs(trace.ack-trace.sent)}),
      ...(view !== undefined && view >= trace.sent && {sendToView:roundedMs(view-trace.sent)}),
      ...(view !== undefined && paint !== undefined && paint >= view && {viewToPaint:roundedMs(paint-view), inputToPaint:roundedMs(paint-trace.input)}),
      ...(trace.server && {server:trace.server})};
    try { record(sample); } catch { /* Observability is never part of the game transaction. */ }
    if (outcome === 'ok' && trace.reportable && sample.roundTrip !== undefined && sample.sendToView !== undefined && sample.viewToPaint !== undefined && sample.inputToPaint !== undefined) {
      try { report({n, background:sample.background, inputToSend:sample.inputToSend!, roundTrip:sample.roundTrip, sendToView:sample.sendToView, viewToPaint:sample.viewToPaint, inputToPaint:sample.inputToPaint}); } catch { /* Best effort. */ }
    }
  }
  function complete(n:number) {
    const trace = pending.get(n);
    if (trace?.ack !== undefined && painted.has(trace.revision) && received.has(trace.revision)) finish(n,'ok');
  }
  const visibility = () => { if (hidden()) pending.forEach(trace => { trace.background = true; }); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
  return {
    begin(n:number, kind:PlayKind, revision:number, inputAt?:number) {
      const sent = now(), input = inputAt !== undefined && duration(sent-inputAt) ? inputAt : sent;
      if (pending.size >= 64) finish(pending.keys().next().value!, 'unpresented');
      const timer = setTimeout(() => finish(n,'unpresented'),120_000);
      pending.set(n,{kind,input,sent,revision,background:hidden(),timer});
    },
    received(revision:number) {
      if (!received.has(revision)) received.set(revision,now()); prune(received);
      pending.forEach((_,n) => complete(n));
    },
    presented(revision:number) {
      const at = now();
      // A hidden hand-reaction view may be held until a later visible revision.
      for (const [seen,time] of received) if (seen <= revision && at >= time && !painted.has(seen)) painted.set(seen,at);
      prune(painted); pending.forEach((_,n) => complete(n));
    },
    acknowledged(n:number, result:{revision?:number;timing?:unknown;error?:string}) {
      const trace = pending.get(n); if (!trace) return;
      trace.ack = now(); trace.background ||= hidden();
      trace.server = parseServerTiming(result.timing);
      if (Number.isSafeInteger(result.revision) && result.revision! >= trace.revision) trace.revision = result.revision!;
      trace.reportable = !!trace.server && result.revision !== undefined;
      if (result.error) finish(n,'rejected'); else complete(n);
    },
    failed(n:number, outcome:'timeout'|'disconnected') { finish(n,outcome); },
    disconnect() { for (const n of [...pending.keys()]) finish(n,'disconnected'); received.clear(); painted.clear(); },
    close() { this.disconnect(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange',visibility); },
  };
}
