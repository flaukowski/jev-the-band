import type { Snapshot } from './music';
export type ArchiveEntry = {
  id: string;
  prompt: string;
  mode: string;
  status: string;
  startedAt: number;
  from?: number;
  to?: number;
  songs: NonNullable<Snapshot['setlist']>;
};
export type ArchiveTrack = {
  key: string;
  id: string;
  prompt: string;
  at: number;
  to?: number;
  mode: string;
  recording: boolean;
};
export function archiveTracks(entries: ArchiveEntry[]): ArchiveTrack[] {
  return entries
    .flatMap((entry) => {
      const songs = entry.songs
        .filter((s) => s.appliedAt !== undefined)
        .sort((a, b) => a.appliedAt! - b.appliedAt!);
      if (!songs.length)
        return [
          {
            key: entry.id,
            id: entry.id,
            prompt: entry.prompt,
            at: entry.from ?? entry.startedAt,
            to: entry.to,
            mode: entry.mode,
            recording: entry.status !== 'ended',
          },
        ];
      return songs
        .map((song, index) => ({
          key: `${entry.id}:${song.id}`,
          id: entry.id,
          prompt: song.prompt,
          at: Math.max(song.appliedAt!, entry.from ?? -Infinity),
          to: Math.min(songs[index + 1]?.appliedAt ?? Infinity, entry.to ?? Infinity),
          mode: entry.mode,
          recording: entry.status !== 'ended' && index === songs.length - 1,
        }))
        .filter((song) => song.at < song.to);
    })
    .sort((a, b) => a.at - b.at);
}
