export const ATLAS_SWIPE_BACK_EDGE_WIDTH = 36;
export const ATLAS_SWIPE_BACK_IMMEDIATE_EDGE_WIDTH = 20;
export const ATLAS_SWIPE_BACK_ACTIVATION_DISTANCE = 3;
export const ATLAS_SWIPE_BACK_FLICK_MIN_DISTANCE = 24;

export function shouldCaptureAtlasSwipeBackStart({
  enabled,
  startX
}: {
  enabled: boolean;
  startX: number;
}) {
  return enabled && startX <= ATLAS_SWIPE_BACK_IMMEDIATE_EDGE_WIDTH;
}

export function shouldStartAtlasSwipeBack({
  deltaX,
  deltaY,
  enabled,
  startX
}: {
  deltaX: number;
  deltaY: number;
  enabled: boolean;
  startX: number;
}) {
  return enabled &&
    startX <= ATLAS_SWIPE_BACK_EDGE_WIDTH &&
    deltaX >= ATLAS_SWIPE_BACK_ACTIVATION_DISTANCE &&
    deltaX > Math.abs(deltaY) * 1.2;
}

export function shouldCompleteAtlasSwipeBack({
  deltaX,
  screenWidth,
  velocityX
}: {
  deltaX: number;
  screenWidth: number;
  velocityX: number;
}) {
  return deltaX >= Math.min(screenWidth * 0.32, 140) ||
    (deltaX >= ATLAS_SWIPE_BACK_FLICK_MIN_DISTANCE && velocityX >= 0.65);
}
