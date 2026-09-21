import { useEffect, useState } from 'react';
import { musicians, personas, type Frame } from '../shared/music';
import {
  defaultEngineerMix,
  defaultMasterControls,
  effectiveMaster,
  readMasterControls,
  type MasterControls,
} from '../shared/engineer';
import type { BandAudio } from './audio';
import {
  audienceMoods,
  defaultAudienceControls,
  defaultAudienceDirection,
  readAudienceControls,
  type AudienceControls,
} from '../shared/audience';

export function MasterDesk({
  audio,
  frame,
  referenceActive,
  canReference,
  onReference,
}: {
  audio: BandAudio;
  frame: Frame | null;
  referenceActive: boolean;
  canReference: boolean;
  onReference: () => void;
}) {
  const [crowd, setCrowd] = useState<AudienceControls>(() => {
    try {
      return readAudienceControls(JSON.parse(localStorage.getItem('jev-audience-v1') ?? 'null'));
    } catch {
      return defaultAudienceControls();
    }
  });
  useEffect(() => {
    audio.setAudienceControls(crowd);
    try {
      localStorage.setItem('jev-audience-v1', JSON.stringify(crowd));
    } catch {
      /* private browsing */
    }
  }, [audio, crowd]);
  const [controls, setControls] = useState<MasterControls>(() => {
    try {
      return readMasterControls(JSON.parse(localStorage.getItem('jev-master-v1') ?? 'null'));
    } catch {
      return defaultMasterControls();
    }
  });
  useEffect(() => {
    audio.setMasterControls(controls);
    try {
      localStorage.setItem('jev-master-v1', JSON.stringify(controls));
    } catch {
      /* private browsing */
    }
  }, [audio, controls]);
  const mix = frame?.engineerMix ?? defaultEngineerMix();
  const shown = effectiveMaster(mix, controls);
  const manual = (patch: Partial<MasterControls>) =>
    setControls({
      mode: 'manual',
      reverb: shown.reverb,
      threshold: shown.threshold,
      ratio: shown.ratio,
      audience: shown.audience ?? defaultAudienceDirection(),
      ...patch,
    });
  return (
    <section className="master-desk" aria-label="Sound engineer">
      <div className="master-heading">
        <div>
          <span className="eyebrow">PATCH · FRONT OF HOUSE</span>
          <h2>The whole room.</h2>
        </div>
        <label>
          Mix control{' '}
          <select
            aria-label="Master mix control"
            value={controls.mode}
            onChange={(e) =>
              e.target.value === 'jev' ? setControls((v) => ({ ...v, mode: 'jev' })) : manual({})
            }
          >
            <option value="jev">Jev sound engineer</option>
            <option value="manual">My manual mix</option>
          </select>
        </label>
      </div>
      <p>
        {controls.mode === 'manual'
          ? 'Your faders and master settings lead. Switch back to let Patch balance the band.'
          : mix.traceId
            ? 'Patch is balancing the band. Your channel faders remain an extra adjustment.'
            : 'Patch is waiting for reference sound. Until then, the band plays at its normal balance.'}
      </p>
      <div className="balance-readout">
        {musicians.map((role) => (
          <span key={role} style={{ color: personas[role].color }}>
            {personas[role].name}{' '}
            <b>
              {shown.trimDb[role] > 0 ? '+' : ''}
              {shown.trimDb[role]} dB
            </b>
          </span>
        ))}
      </div>
      <div className="master-knobs">
        <label>
          Room <output>{Math.round(shown.reverb * 100)}%</output>
          <input
            aria-label="Master room"
            type="range"
            min="0"
            max="0.3"
            step="0.01"
            value={shown.reverb}
            onChange={(e) => manual({ reverb: +e.target.value })}
          />
        </label>
        <label>
          Compression threshold <output>{shown.threshold} dB</output>
          <input
            aria-label="Master compression threshold"
            type="range"
            min="-30"
            max="0"
            step="1"
            value={shown.threshold}
            onChange={(e) => manual({ threshold: +e.target.value })}
          />
        </label>
        <label>
          Compression ratio <output>{shown.ratio}:1</output>
          <input
            aria-label="Master compression ratio"
            type="range"
            min="1"
            max="8"
            step="0.5"
            value={shown.ratio}
            onChange={(e) => manual({ ratio: +e.target.value })}
          />
        </label>
      </div>
      <div className="audience-desk" aria-label="Audience sound">
        <div>
          <b>
            THE AUDIENCE ·{' '}
            <a href="https://elevenlabs.io" target="_blank" rel="noreferrer">
              elevenlabs.io
            </a>
          </b>
          <small>
            {audio.audienceStatus?.label ?? 'Festival crowd recordings · ready when sound starts'}
          </small>
        </div>
        <label>
          <input
            aria-label="Audience sound enabled"
            type="checkbox"
            checked={crowd.enabled}
            onChange={(event) => setCrowd((v) => ({ ...v, enabled: event.target.checked }))}
          />{' '}
          Room sound
        </label>
        <label>
          Mood{' '}
          <select
            aria-label="Audience mood"
            value={(shown.audience ?? defaultAudienceDirection()).mood}
            onChange={(event) =>
              manual({
                audience: {
                  ...(shown.audience ?? defaultAudienceDirection()),
                  mood: event.target.value as (typeof audienceMoods)[number],
                },
              })
            }
          >
            {audienceMoods.map((mood) => (
              <option key={mood} value={mood}>
                {mood}
              </option>
            ))}
          </select>
        </label>
        <label>
          Audience level{' '}
          <output>{(shown.audience ?? defaultAudienceDirection()).levelDb} dB</output>
          <input
            aria-label="Audience level"
            type="range"
            min="-48"
            max="-12"
            step="1"
            value={(shown.audience ?? defaultAudienceDirection()).levelDb}
            onChange={(event) =>
              manual({
                audience: {
                  ...(shown.audience ?? defaultAudienceDirection()),
                  levelDb: +event.target.value,
                },
              })
            }
          />
        </label>
        <label>
          <input
            aria-label="Audience reactions enabled"
            type="checkbox"
            checked={crowd.reactions}
            onChange={(event) => setCrowd((v) => ({ ...v, reactions: event.target.checked }))}
          />{' '}
          Occasional reactions
        </label>
        <div className="audience-cues" aria-label="Audience reaction cues">
          <button
            className="board-reset"
            disabled={!crowd.enabled || !crowd.reactions || !audio.audienceStatus?.active}
            onClick={() => audio.triggerAudience('applause')}
          >
            Applause
          </button>
          <button
            className="board-reset"
            disabled={!crowd.enabled || !crowd.reactions || !audio.audienceStatus?.active}
            onClick={() => audio.triggerAudience('cheering')}
          >
            Cheers
          </button>
        </div>
      </div>
      <div className="master-footnote">
        <span>
          {referenceActive
            ? 'Reference sound: this browser'
            : 'Automatic balance listens to the reference browser.'}{' '}
          Local mute, solo and faders do not affect those measurements.
        </span>
        {canReference && !referenceActive && (
          <button className="board-reset" onClick={onReference}>
            Use this browser as reference
          </button>
        )}
      </div>
    </section>
  );
}
