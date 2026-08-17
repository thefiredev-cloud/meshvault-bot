export class BotMutationGate {
  private readonly tails = new Map<string, Promise<void>>();

  async run<Result>(botId: string, mutation: () => Promise<Result>): Promise<Result> {
    const prior = this.tails.get(botId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prior.then(() => turn);
    this.tails.set(botId, tail);
    await prior;
    try {
      return await mutation();
    } finally {
      release();
      if (this.tails.get(botId) === tail) this.tails.delete(botId);
    }
  }
}
