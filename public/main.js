import { initSearch, refreshResumeButtons, checkInitialHash } from "./search.js";
import * as player from "./player.js";
import * as queue from "./queue.js";

// Wire search: play and queue buttons
// onPlay(talk, startTime) — startTime=0 means from beginning, undefined means auto-resume
initSearch({
  onPlay: (talk, startTime) => player.play(talk, startTime),
  onQueue: (talk) => queue.add(talk),
  onQueueAll: (talks) => queue.addAll(talks),
});

// Wire queue: play from queue (auto-resume saved position)
queue.initQueue({
  onPlay: (talk) => player.play(talk),
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

// Open retreat from URL hash (e.g. #retreat/123) for shareable links
checkInitialHash();

// Service worker makes the app installable ("Install app" / "Add to Home screen")
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.error("Service worker registration failed:", e));
  });
}
