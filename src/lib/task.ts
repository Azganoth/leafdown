export const runTaskAsPromise = <T>(task: () => T | PromiseLike<T>) => {
  try {
    return Promise.resolve(task());
  } catch (error) {
    return Promise.reject(error);
  }
};
