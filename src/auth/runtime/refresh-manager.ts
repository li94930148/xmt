export class RefreshManager {
  private refreshInFlight: Promise<string | null> | null = null;

  run(refresh: () => Promise<string | null>): Promise<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = refresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }
}
