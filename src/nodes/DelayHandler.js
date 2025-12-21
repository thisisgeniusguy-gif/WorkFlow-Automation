class DelayHandler {
    constructor(delaySeconds) {
        this.delaySeconds = delaySeconds;
    }

    async execute() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    success: true,
                    message: `Delayed execution by ${this.delaySeconds} seconds`,
                    delayedAt: new Date().toISOString(),
                });
            }, this.delaySeconds * 1000);
        });
    }
}

export default DelayHandler;