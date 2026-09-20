import { chapterAt, type DirectorReport } from '../shared/concept';
import { personas } from '../shared/music';

export function ConceptCard({ report, elapsed }: { report?: DirectorReport; elapsed: number }) {
  if (!report) return null;
  if (report.status === 'planning')
    return (
      <div className="concept-card" role="status">
        Shaping your sonic concept… <small>One LLM brief; Jev will play the music.</small>
      </div>
    );
  if (!report.concept) return <div className="concept-card">{report.error}</div>;
  const concept = report.concept,
    current = chapterAt(concept, elapsed);
  return (
    <details className="concept-card" open>
      <summary>
        <span>TONIGHT’S SONIC CONCEPT</span>
        <b>{current?.name ?? 'The opening'}</b>
      </summary>
      <p>{concept.concept}</p>
      <div className="concept-meta">
        {personas[concept.openingInstrument].name} suggested to open · {report.model} brief · Jev
        chooses the notes
      </div>
      <div className="chapter-map">
        {concept.chapters.map((ch) => (
          <span key={ch.atSeconds} className={current === ch ? 'current' : ''}>
            <small>
              {Math.floor(ch.atSeconds / 60)}:{String(ch.atSeconds % 60).padStart(2, '0')}
            </small>
            {ch.name}
          </span>
        ))}
      </div>
      {current && <p className="chapter-direction">{current.harmonicDirection}</p>}
      <details className="director-proof">
        <summary>Inspect the director brief and request</summary>
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </details>
  );
}
