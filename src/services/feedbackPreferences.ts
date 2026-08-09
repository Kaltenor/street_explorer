export type FeedbackPreferences = {
  hapticsEnabled: boolean;
  soundEnabled: boolean;
};

const feedbackPreferences: FeedbackPreferences = {
  hapticsEnabled: true,
  soundEnabled: true
};

export function setFeedbackPreferences(next: FeedbackPreferences) {
  feedbackPreferences.hapticsEnabled = next.hapticsEnabled;
  feedbackPreferences.soundEnabled = next.soundEnabled;
}

export function setHapticFeedbackEnabled(enabled: boolean) {
  feedbackPreferences.hapticsEnabled = enabled;
}

export function setSoundFeedbackEnabled(enabled: boolean) {
  feedbackPreferences.soundEnabled = enabled;
}

export function isHapticFeedbackEnabled() {
  return feedbackPreferences.hapticsEnabled;
}

export function isSoundFeedbackEnabled() {
  return feedbackPreferences.soundEnabled;
}

async function playHaptic(
  operation: (haptics: typeof import("expo-haptics")) => Promise<void>
) {
  if (!isHapticFeedbackEnabled()) return;

  try {
    const haptics = await import("expo-haptics");

    if (!isHapticFeedbackEnabled()) return;
    await operation(haptics);
  } catch {
    // Feedback is optional in older or restricted development clients.
  }
}

export function playImpactHaptic() {
  return playHaptic((haptics) =>
    haptics.impactAsync(haptics.ImpactFeedbackStyle.Medium)
  );
}

export function playSelectionHaptic() {
  return playHaptic((haptics) => haptics.selectionAsync());
}

export function playSuccessHaptic() {
  return playHaptic((haptics) =>
    haptics.notificationAsync(haptics.NotificationFeedbackType.Success)
  );
}
