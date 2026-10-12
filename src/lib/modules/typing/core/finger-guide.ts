import { baseKey } from './trainer.ts';

export type FingerId =
  | 'left-pinky' | 'left-ring' | 'left-middle' | 'left-index' | 'left-thumb'
  | 'right-pinky' | 'right-ring' | 'right-middle' | 'right-index' | 'right-thumb';

export type FingerCue = {
  physicalKey: string;
  finger: FingerId;
  shiftFinger: FingerId | null;
  reach: { x: number; y: number; rotation: number };
};

const fingerKeys: ReadonlyArray<readonly [FingerId, string]> = [
  ['left-pinky', '`1qaz'],
  ['left-ring', '2wsx'],
  ['left-middle', '3edc'],
  ['left-index', '45rtfgvb'],
  ['right-index', '67yuhjnm'],
  ['right-middle', '8ik,'],
  ['right-ring', '9ol.'],
  ['right-pinky', "0-=p[];'/\\"] 
];

const keyToFinger = new Map<string, FingerId>(
  fingerKeys.flatMap(([finger, keys]) => [...keys].map(key => [key, finger] as const))
);

const upperRow = new Set('1234567890-=qwertyuiop[]'.split(''));
const lowerRow = new Set('zxcvbnm,./'.split(''));

export function resolveFingerCue(character: string, oppositeHandShift = true): FingerCue {
  const physicalKey = baseKey(character);
  const finger: FingerId =
    physicalKey === ' ' ? 'right-thumb' : keyToFinger.get(physicalKey) ?? 'right-pinky';
  const shifted = character !== physicalKey && character !== character.toLowerCase()
    || character !== physicalKey && !/[a-z]/i.test(character);
  const shiftFinger: FingerId | null =
    shifted && oppositeHandShift
      ? finger.startsWith('left') ? 'right-pinky' : 'left-pinky'
      : null;
  return {
    physicalKey,
    finger,
    shiftFinger,
    reach: {
      x: physicalKey === ' ' ? 4 : 0,
      y: physicalKey === ' ' ? 6 : upperRow.has(physicalKey) ? -7 : lowerRow.has(physicalKey) ? 6 : 0,
      rotation: lowerRow.has(physicalKey) ? 3 : 0
    }
  };
}
