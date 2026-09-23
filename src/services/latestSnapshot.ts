export async function publishLatestSnapshot<T>(
  generation: { current: number },
  load: () => Promise<T>,
  publish: (value: T) => void
) {
  const startedAtGeneration = ++generation.current;
  const value = await load();
  if (startedAtGeneration === generation.current) publish(value);
}
