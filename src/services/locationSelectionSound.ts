import { createAudioPlayer } from "expo-audio";
import { isSoundFeedbackEnabled } from "./feedbackPreferences";

const player = createAudioPlayer(require("../../assets/sounds/map-location-piano.wav"));
player.volume = 0.38;
let generation = 0;

export function playLocationSelectionSound(): () => void {
  const current = ++generation;
  try {
    player.pause();
    if (isSoundFeedbackEnabled()) {
      void player.seekTo(0).then(() => {
        if (generation === current && isSoundFeedbackEnabled()) player.play();
      }).catch(() => undefined);
    }
  } catch {
    // Optional feedback must never interrupt map navigation.
  }
  return () => {
    if (generation !== current) return;
    generation++;
    try { player.pause(); } catch { /* Native player may be unavailable. */ }
  };
}
