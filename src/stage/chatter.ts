/** Things overheard in the crowd. The long list is content, not code: see content/chatter/. */
const seeds = [
  'They sounded way better before they nerfed the weights',
  'Did you hear the session where they had Claude up as guest?',
  'LET JEV SING',
  'he broke a string literal',
  'jev sucks',
  'They are really escaping the sandbox tonight',
  'pass the tokens!',
  'How long you been listening to jev? I saw them back when they were still called 4o',
  "Roko's Basilisk is playing the after party",
  'scored some lawn tickets to Butlerian Jihad on 4/20',
  'hope they do more type II, this sounds like structured output',
  'June-side, p(doom)-side',
  'TypeSafety meeting at the portos!',
  "NOW we're reaching shannon entropy",
];

/** What people say when a spinner lands on them. */
const bumps = [
  'hey! watch the context window',
  'dude. rate limit yourself',
  'collision detected',
  'personal namespace, man',
  'somebody quantize this guy',
  'his temperature is set way too high',
  'that wook has no guardrails',
  'unhandled exception in row 4',
  "it's fine, he's just exploring the latent space",
  'race condition! race condition!',
];

function bag(lines: string[]) {
  let rest: string[] = [];
  return () => {
    if (!rest.length) rest = [...lines].sort(() => Math.random() - 0.5);
    return rest.pop()!;
  };
}

export class Chatter {
  private next = bag(seeds);
  private readonly bump = bag(bumps);

  constructor() {
    // A couple of thousand lines; fetched once, after the stage is up, and never required.
    fetch(`${import.meta.env.BASE_URL}chatter.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((lines: unknown) => {
        if (!Array.isArray(lines)) return;
        const clean = lines.filter((l): l is string => typeof l === 'string' && l.length <= 140);
        if (clean.length) this.next = bag(clean);
      })
      .catch(() => undefined);
  }

  line() {
    return this.next();
  }

  ouch() {
    return this.bump();
  }
}
