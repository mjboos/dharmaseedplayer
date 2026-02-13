import { initSearch, refreshResumeButtons } from "./search.js";
import * as player from "./player.js";
import * as queue from "./queue.js";

// Wire search: play and queue buttons
// onPlay(talk, startTime) — startTime=0 means from beginning, undefined means auto-resume
initSearch({
  onPlay: (talk, startTime) => player.play(talk, startTime),
  onQueue: (talk) => queue.add(talk),
  onQueueAll: (talks) => talks.forEach((t) => queue.add(t)),
});

// Wire queue: play from queue (auto-resume saved position)
queue.initQueue({
  onPlay: (talk) => player.play(talk),
});

// When switching talks, update resume buttons in search results
player.onSwitch(() => refreshResumeButtons());

// Auto-advance: when a talk ends, play next from queue
player.onEnded(() => {
  const nextTalk = queue.next();
  if (nextTalk) player.play(nextTalk);
});
