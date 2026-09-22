export interface WorkerGroupFailure<T> {
  error: unknown;
  group: T;
  groupIndex: number;
  workerIndex: number;
}

interface RunWorkerPoolOptions<T> {
  groups: readonly T[];
  runGroup: (group: T, workerIndex: number) => Promise<void>;
  workerCount: number;
}

export const runWorkerPool = async <T>({
  groups,
  runGroup,
  workerCount,
}: RunWorkerPoolOptions<T>) => {
  const effectiveWorkerCount = Math.min(workerCount, groups.length);
  const failures: WorkerGroupFailure<T>[] = [];
  let nextGroupIndex = 0;

  const runWorker = async (workerIndex: number) => {
    while (nextGroupIndex < groups.length) {
      const groupIndex = nextGroupIndex;
      nextGroupIndex += 1;
      const group = groups[groupIndex];

      try {
        await runGroup(group, workerIndex);
      } catch (error) {
        failures.push({ error, group, groupIndex, workerIndex });
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: effectiveWorkerCount }, (_, index) => runWorker(index)));

  return failures.toSorted((left, right) => left.groupIndex - right.groupIndex);
};
