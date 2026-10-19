import { RestartableTaskRunner, SequentialTaskQueue } from "@/lib/async";

export const saveTaskQueue = new SequentialTaskQueue();
export const runAfterPendingSaves = <T>(task: () => Promise<T>) => saveTaskQueue.run(task);
export const openTransitionRunner = new RestartableTaskRunner();
export const cancelOpenSessionTransitions = () => openTransitionRunner.cancel();
