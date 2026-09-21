/** The media clock owns archive playback and stage time, including buffering and seeks. */
export class ArchiveStream {
  readonly media = new Audio();
  from = 0;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private bins = new Uint8Array(1024);
  constructor() {
    this.media.preload = 'metadata';
    this.media.crossOrigin = 'anonymous';
  }
  async play(url: string, from: number, position: number, volume: number) {
    this.stop();
    this.from = from;
    this.media.src = url;
    this.media.volume = volume;
    this.media.currentTime = Math.max(0, (position - from) / 1000);
    if (!this.context) {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.context
        .createMediaElementSource(this.media)
        .connect(this.analyser)
        .connect(this.context.destination);
    }
    await this.context.resume();
    await this.media.play();
  }
  position() {
    return this.from + this.media.currentTime * 1000;
  }
  spectrum() {
    this.analyser?.getByteFrequencyData(this.bins);
    return this.analyser ? this.bins : null;
  }
  stop() {
    this.media.pause();
    this.media.removeAttribute('src');
    this.media.load();
  }
  dispose() {
    this.stop();
    void this.context?.close();
  }
}
