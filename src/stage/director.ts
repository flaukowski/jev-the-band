/** A slow camera move that lasts the whole shot. */
export interface Move {
  /** Total angle to travel around the subject, in radians; the sign is the direction. */
  arc: number;
  /** Distance to the subject at the end of the shot as a multiple of the start: <1 pushes in. */
  zoom: number;
  /** Seconds the move is spread over. */
  over: number;
}
export interface Cut {
  shot: string;
  move: Move;
}

const between = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);

/**
 * The vision mixer. It never leaves a camera parked: every shot is held for 30 to 90 seconds and
 * then cut, with the room playing or not, and every shot carries a slow push, pull or orbit.
 * A new solo is cut to at once. A long solo is covered like a real one, with short cutaways to
 * the rest of the room and a return to the player.
 */
export class Director {
  shot = '';
  private until = 0;
  private solo = '';
  private readonly recent: string[] = [];

  constructor(
    private readonly pool: readonly string[],
    /** 0..1 per shot: how much room the camera has to travel before it hits scenery. */
    private readonly freedom: (shot: string) => number,
    private readonly rng: () => number = Math.random,
  ) {}

  /** Forget the current shot, so the next update cuts. */
  reset() {
    this.shot = '';
    this.solo = '';
  }

  /**
   * `now` is seconds of wall clock. `boundary` is true on the frame a new phrase begins: a due
   * cut waits for one, but not for more than six seconds, and not at all in a silent room.
   */
  update(
    now: number,
    soloist: string | undefined,
    boundary: boolean,
    playing: boolean,
  ): Cut | null {
    const newSolo = !!soloist && soloist !== this.solo;
    this.solo = soloist ?? '';
    // Already on the player who just stepped forward: that is the shot. Let it run.
    if (newSolo && this.shot === soloist) return null;
    const due = now >= this.until && (boundary || !playing || now >= this.until + 6);
    if (this.shot && !newSolo && !due) return null;
    let shot: string;
    if (soloist && this.shot !== soloist) shot = soloist;
    else {
      const open = this.pool.filter(
        (s) => s !== this.shot && s !== soloist && !this.recent.includes(s),
      );
      shot = open[Math.floor(this.rng() * open.length)] ?? this.pool[0];
    }
    // Away from a soloist only briefly; everything else gets a proper hold.
    const hold =
      soloist && shot !== soloist ? between(this.rng, 10, 18) : between(this.rng, 30, 90);
    this.shot = shot;
    this.until = now + hold;
    this.recent.push(shot);
    if (this.recent.length > 4) this.recent.shift();
    return { shot, move: this.move(this.freedom(shot), hold) };
  }

  private move(freedom: number, hold: number): Move {
    const style = Math.floor(this.rng() * 5);
    const side = this.rng() < 0.5 ? -1 : 1;
    const arc = style === 0 || style === 1 ? 0 : side * between(this.rng, 0.35, 1) * 0.7 * freedom;
    const depth = style === 2 ? 0 : between(this.rng, 0.4, 1) * 0.26 * freedom;
    // Even numbered styles close in, odd ones open out; style 2 is a pure orbit.
    const zoom = style % 2 === 0 ? 1 - depth : 1 / (1 - depth);
    // The move outlasts the hold a little, so a cut that waits for the bar never lands on a stop.
    return { arc, zoom, over: hold + 6 };
  }
}
