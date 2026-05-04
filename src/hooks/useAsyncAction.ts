import { useTask, useNotification } from "../context/index.js";

export function useAsyncAction() {
  const { startTask, endTask } = useTask();
  const { notify } = useNotification();

  async function run<T>(
    message: string,
    fn: () => Promise<T>
  ): Promise<T | undefined> {
    const taskId = Math.random().toString(36).substring(7);
    startTask(taskId, message);

    try {
      return await fn();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      notify(errorMsg, "error");
      return undefined;
    } finally {
      endTask(taskId);
    }
  }

  return { run };
}
