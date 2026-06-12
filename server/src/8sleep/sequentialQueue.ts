export class SequentialQueue {
  private executing = Promise.resolve();

  private execInternal(f: () => Promise<void>) {
    const current = this.executing;
    // eslint-disable-next-line no-async-promise-executor
    const newPromise = new Promise<void>(async (resolve) => {
      await current;
      await f();
      resolve();
    });

    this.executing = newPromise;
    return newPromise;
  }

  public exec<T>(f: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.execInternal(async () => {
        try {
          resolve(await f());
        } catch (err) {
          reject(err);
        }
      });
    });
  }
}
