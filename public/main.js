import { initSearch, refreshResumeButtons, checkInitialHash, openRetreat } from "./search.js";
import * as player from "./player.js";
import * as queue from "./queue.js";

// Wire search: play and queue buttons
// onPlay(talk, startTime) — startTime=0 means from beginning, undefined means auto-resume
initSearch({
  onPlay: (talk, startTime) => player.play(talk, startTime),
  onQueue: (talk) => queue.add(talk),
  onQueueAll: (talks) => queue.addAll(talks),
});

// Wire queue: play from queue (auto-resume saved position), or open a talk's retreat
queue.initQueue({
  onPlay: (talk) => player.play(talk),
  onOpenRetreat: (talk) => {
    openRetreat(talk.retreatId, talk.retreatTitle);
    window.scrollTo(0, 0);
  },
});

// When switching talks, update resume buttons in search results
player.onSwitch(() => refreshResumeButtons());

// Auto-advance: when a talk ends, play the one after it in the active playlist.
// Finished talks stay in the playlist.
player.onEnded(() => {
  const finished = player.getCurrentTalk();
  const nextTalk = finished && queue.nextAfter(finished.id);
  if (nextTalk) player.play(nextTalk);
});

// Open a retreat or talk from the URL hash (#retreat/123, #talk/456) for shareable links
checkInitialHash();
