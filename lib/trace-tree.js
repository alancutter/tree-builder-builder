function TraceTree(data) {
  this.data = data;
}

function clone(input) {
  var result = {};
  for (key in input)
    result[key] = input[key];
  return result;
}

TraceTree.prototype.filter = function() {
  var output = {traceEvents: []};
  var baseTime = this.data.traceEvents[0].ts;
  var pendingTiming = [];
  var pid = this.data.traceEvents[0].pid;
  var capturePoints = [output.traceEvents];
  var spans = [undefined];

  for (var i = 0; i < this.data.traceEvents.length; i++) {
    var event = clone(this.data.traceEvents[i]);
    if (event.ph == 'B' || event.ph == 'X' || event.ph == 'S') {
      var span = spans[spans.length - 1];
      while (span !== undefined && event.ts >= span) {
        capturePoints.pop();
        spans.pop();
        span = spans[spans.length - 1];
      }
      capturePoints[capturePoints.length - 1].push(event);
      if (event.ph == 'X') {
        spans.push(event.ts + event.dur);
      } else {
        spans.push(undefined);
        pendingTiming.push(event);
      }
      event.ts -= baseTime;
      event.children = [];
      capturePoints.push(event.children);
    } else if (event.ph == 'E' || event.ph == 'F') {
      while (spans[spans.length - 1] !== undefined) {
        spans.pop();
        capturePoints.pop();
      }
      otherHalf = pendingTiming.pop();
      if (otherHalf) {
        spans.pop();
        capturePoints.pop();
        otherHalf.tdur = event.tts - otherHalf.tts;
      }
    }
  }
  return output;
}

module.exports = TraceTree;

/*
{"name":"Document::updateRenderTree","tts":160519,"args":{},"pid":34835,"ts":41621046290,"cat":"blink","tid":1299,"ph":"B"},
{"tdur":672,"name":"Document::updateStyle","tts":160524,"args":{},"pid":34835,"ts":41621046306,"cat":"blink","tid":1299,"ph":"X","dur":739}
{"name":"Document::updateRenderTree","tts":161198,"args":{"elementCount":122},"pid":34835,"ts":41621047046,"cat":"blink","tid":1299,"ph":"E"}

name                       tts          dur  tdur  ts                       ph
Document::updateRenderTree 160519                  41621046290 ( 919)       B
Document::updateStyle      160524       739  672   41621046306 ( 935)       X
Document::updateRenderTree 161198 +679             41621047046 (1675) +756  E

dur = wall duration (us)
tdur = CPU duration (us)
ts = start (us from .. something)

if (159788 == 0) then 160519 == 731
if (41621045371 == 0) then 41621046290 == 919

*/

