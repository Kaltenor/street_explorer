import { Pedometer } from "expo-sensors";

export type StepSubscription = {
  remove: () => void;
};

export async function isStepCounterAvailable() {
  try {
    return await Pedometer.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function requestStepCounterPermission() {
  try {
    const permission = await Pedometer.requestPermissionsAsync();
    return permission.granted;
  } catch {
    return false;
  }
}

export async function getStepCountBetween(startedAt: string, endedAt: string) {
  const isAvailable = await isStepCounterAvailable();

  if (!isAvailable) {
    return 0;
  }

  const hasPermission = await requestStepCounterPermission();

  if (!hasPermission) {
    return 0;
  }

  try {
    const result = await Pedometer.getStepCountAsync(new Date(startedAt), new Date(endedAt));
    return Math.max(0, result.steps);
  } catch {
    return 0;
  }
}

export async function watchStepCount(onStepsChanged: (steps: number) => void) {
  const isAvailable = await isStepCounterAvailable();

  if (!isAvailable) {
    return null;
  }

  const hasPermission = await requestStepCounterPermission();

  if (!hasPermission) {
    return null;
  }

  return Pedometer.watchStepCount((result) => {
    onStepsChanged(Math.max(0, result.steps));
  });
}
