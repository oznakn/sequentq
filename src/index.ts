/* eslint-disable no-await-in-loop */

type PayloadHandler<T> = (payload: T)=> any | Promise<any>;

type CallbackHandler = (err?: Error)=> any | Promise<any>;

type DrainHandler = ()=> any;

type ErrorHandler<T> = (err: Error, payload: T)=> any;

export class SequentQ<T = any> {
    private items: { payload: T, cb?: CallbackHandler }[] = [];

    private isRunning = false;

    private drainWaiters = new Set<DrainHandler>();

    private errorHandlers = new Set<ErrorHandler<T>>();

    constructor(private readonly handler: PayloadHandler<T>, private readonly delay: number = 0) {}

    private async run() {
        if (this.isRunning) return;

        this.isRunning = true;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const data = this.items.shift();

            if (!data) {
                this.isRunning = false;

                this.drainWaiters.forEach(r => r());
                this.drainWaiters.clear(); // we can clear the drain waiters, because there are only for one time.

                break;
            } else {
                let err: Error | undefined;
                try {
                    await this.handler(data.payload);
                } catch (e) {
                    err = e as Error;

                    this.errorHandlers.forEach(h => h(err!, data.payload));
                }

                if (data.cb) {
                    try {
                        await data.cb(err);
                    } catch {} // eslint-disable-line
                }

                if (this.delay) {
                    // eslint-disable-next-line no-promise-executor-return
                    await new Promise(resolve => setTimeout(resolve, this.delay));
                }
            }
        }
    }

    public push(payload: T, cb?: CallbackHandler) {
        this.items.push({ payload, cb });

        if (!this.isRunning) {
            setImmediate(() => this.run());
        }

        return this;
    }

    public unshift(payload: T, cb?: CallbackHandler) {
      this.items.unshift({ payload, cb });

      if (!this.isRunning) {
          setImmediate(() => this.run());
      }

      return this;
  }

    public onError(handler: ErrorHandler<T>) {
        this.errorHandlers.add(handler);

        return this;
    }

    public async drain() {
        // Drain only when there are still items in queue, or items processing in queue

        if (this.items.length > 0 || this.isRunning) {
            // eslint-disable-next-line no-async-promise-executor
            await new Promise<void>(async (resolve) => {
                this.drainWaiters.add(resolve);

                // re trigger run for any case
                await this.run();
            });
        }

        return this;
    }
}
