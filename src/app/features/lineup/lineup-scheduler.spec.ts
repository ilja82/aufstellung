import {describe, expect, it} from 'vitest';
import {generateLineupAssignment} from './lineup-scheduler';
import {DoubleMatchesMode, LineupSlot, PositionType} from '../../models/lineup.model';
import {Player} from '../../models/player.model';

function emptySlots(mode: DoubleMatchesMode, goalieWar: boolean): LineupSlot[] {
  const slots: LineupSlot[] = [];
  const push = (setNumber: number, position: PositionType) => slots.push({setNumber, position, assignedPlayerId: null});
  push(1, 'single');
  push(2, 'single');
  push(3, 'striker');
  push(4, 'goalie');
  if (mode === 'five') {
    push(5, 'striker');
    push(6, 'goalie');
  } else {
    push(5, 'single');
    push(6, 'single');
  }
  push(7, 'striker');
  push(8, 'goalie');
  if (goalieWar) {
    push(9, 'gw');
    push(10, 'gw');
  } else {
    push(9, 'single');
    push(10, 'single');
  }
  push(11, 'striker');
  push(12, 'goalie');
  push(13, 'single');
  push(14, 'single');
  push(15, 'striker');
  push(16, 'goalie');
  return slots;
}

function player(name: string, roles: Partial<Omit<Player, 'id' | 'name'>>): Player {
  return {
    id: name,
    name,
    isGoalie: false,
    isStriker: false,
    likesSingles: false,
    likesDoubles: false,
    playsGoalieWar: false,
    ...roles
  };
}

const allRounder = (name: string) => player(name, {
  isGoalie: true, isStriker: true, likesSingles: true, likesDoubles: true, playsGoalieWar: true
});
/** "Einzel" + "Doppel" + "Stürmer" */
const strikerSingles = (name: string) => player(name, {isStriker: true, likesSingles: true, likesDoubles: true});
/** "Doppel" + "Torwart" */
const doublesGoalie = (name: string) => player(name, {isGoalie: true, likesDoubles: true});

/** The lineup as it is played: a double is one match seating two players. */
function matches(slots: LineupSlot[]): (string | null)[][] {
  const ordered = [...slots].sort((a, b) => a.setNumber - b.setNumber);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].position === 'striker' && ordered[i + 1]?.position === 'goalie') {
      rows.push([ordered[i].assignedPlayerId, ordered[i + 1].assignedPlayerId]);
      i++;
    } else {
      rows.push([ordered[i].assignedPlayerId]);
    }
  }
  return rows;
}

function backToBack(slots: LineupSlot[]): string[] {
  const rows = matches(slots);
  const found: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const previous = new Set(rows[i - 1].filter((id): id is string => !!id));
    rows[i].forEach(id => {
      if (id && previous.has(id)) found.push(`${id} plays match ${i} and ${i + 1}`);
    });
  }
  return found;
}

function gamesPerPlayer(slots: LineupSlot[]): Map<string, number> {
  const counts = new Map<string, number>();
  slots.forEach(slot => {
    if (slot.assignedPlayerId) counts.set(slot.assignedPlayerId, (counts.get(slot.assignedPlayerId) ?? 0) + 1);
  });
  return counts;
}

/** The rules the manual editor enforces through LineupService.isMoveEligible. */
function ruleViolations(slots: LineupSlot[]): string[] {
  const problems: string[] = [];
  const ordered = [...slots].sort((a, b) => a.setNumber - b.setNumber);

  const counts = new Map<string, { singles: number, doubles: number }>();
  ordered.forEach(slot => {
    if (!slot.assignedPlayerId) return;
    const count = counts.get(slot.assignedPlayerId) ?? {singles: 0, doubles: 0};
    if (slot.position === 'single' || slot.position === 'gw') count.singles++;
    else count.doubles++;
    counts.set(slot.assignedPlayerId, count);
  });
  counts.forEach((count, id) => {
    if (count.singles > 2) problems.push(`${id} plays ${count.singles} singles`);
    if (count.doubles > 2) problems.push(`${id} plays ${count.doubles} doubles`);
  });

  const pairs = new Set<string>();
  for (let i = 0; i < ordered.length - 1; i++) {
    if (ordered[i].position !== 'striker' || ordered[i + 1].position !== 'goalie') continue;
    const striker = ordered[i].assignedPlayerId;
    const goalie = ordered[i + 1].assignedPlayerId;
    if (!striker || !goalie) continue;
    if (striker === goalie) problems.push(`${striker} plays a double alone`);
    const key = [striker, goalie].sort((a, b) => a.localeCompare(b)).join('_');
    if (pairs.has(key)) problems.push(`${key} plays two doubles together`);
    pairs.add(key);
  }
  return problems;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('generateLineupAssignment', () => {
  it('keeps a mixed squad off back-to-back matches (2x Einzel/Doppel/Stürmer, 2x Doppel/Torwart)', () => {
    const players = [
      strikerSingles('Anna'), strikerSingles('Ben'),
      doublesGoalie('Cem'), doublesGoalie('Dana')
    ];

    for (let seed = 1; seed <= 25; seed++) {
      const {slots, report} = generateLineupAssignment(emptySlots('four', false), players, {random: seeded(seed)});
      expect(ruleViolations(slots), `seed ${seed}`).toEqual([]);
      expect(backToBack(slots), `seed ${seed}`).toEqual([]);
      expect(report.emptySeats, `seed ${seed}`).toBe(0);
      expect([...gamesPerPlayer(slots).values()].sort(), `seed ${seed}`).toEqual([4, 4, 4, 4]);
    }
  });

  it('still seats the strikers and goalies on their own positions in that mixed squad', () => {
    const players = [
      strikerSingles('Anna'), strikerSingles('Ben'),
      doublesGoalie('Cem'), doublesGoalie('Dana')
    ];
    const {slots, report} = generateLineupAssignment(emptySlots('four', false), players, {random: seeded(4)});

    const strikers = slots.filter(slot => slot.position === 'striker').map(slot => slot.assignedPlayerId);
    const goalies = slots.filter(slot => slot.position === 'goalie').map(slot => slot.assignedPlayerId);
    expect(strikers.every(id => id === 'Anna' || id === 'Ben')).toBe(true);
    expect(goalies.every(id => id === 'Cem' || id === 'Dana')).toBe(true);
    // Only four of the eight singles can go to a player who ticked "Einzel", so the rest
    // are the unavoidable misfits - the doubles stay untouched.
    expect(report.offPositionSeats).toBe(4);
  });

  it('keeps a squad of three off back-to-back matches', () => {
    const players = [allRounder('A'), allRounder('B'), allRounder('C')];
    for (let seed = 1; seed <= 10; seed++) {
      const {slots} = generateLineupAssignment(emptySlots('four', false), players, {random: seeded(seed)});
      expect(ruleViolations(slots), `seed ${seed}`).toEqual([]);
      expect(backToBack(slots), `seed ${seed}`).toEqual([]);
      expect([...gamesPerPlayer(slots).values()].sort(), `seed ${seed}`).toEqual([4, 4, 4]);
    }
  });

  it('fills a full squad without repeats or back-to-back matches', () => {
    const modes: DoubleMatchesMode[] = ['four', 'five'];
    for (const mode of modes) {
      for (const goalieWar of [false, true]) {
        for (let squad = 5; squad <= 8; squad++) {
          const players = Array.from({length: squad}, (_value, index) => allRounder(`P${index + 1}`));
          const {slots, report} = generateLineupAssignment(emptySlots(mode, goalieWar), players, {random: seeded(squad)});
          const label = `${mode}/${goalieWar ? 'gw' : 'no gw'}/${squad}`;
          expect(ruleViolations(slots), label).toEqual([]);
          expect(backToBack(slots), label).toEqual([]);
          expect(report.emptySeats, label).toBe(0);
        }
      }
    }
  });

  it('spreads the games across the squad', () => {
    const players = Array.from({length: 6}, (_value, index) => allRounder(`P${index + 1}`));
    const {slots} = generateLineupAssignment(emptySlots('four', false), players, {random: seeded(7)});
    const counts = [...gamesPerPlayer(slots).values()].sort();
    // 16 slots over 6 players: nobody carries more than one game above anybody else.
    expect(counts).toEqual([2, 2, 3, 3, 3, 3]);
  });

  it('honours the ticked positions when the squad allows it', () => {
    const players = [
      player('Striker1', {isStriker: true, likesDoubles: true, likesSingles: true}),
      player('Striker2', {isStriker: true, likesDoubles: true, likesSingles: true}),
      player('Goalie1', {isGoalie: true, likesDoubles: true, likesSingles: true}),
      player('Goalie2', {isGoalie: true, likesDoubles: true, likesSingles: true}),
      player('Allrounder', {isGoalie: true, isStriker: true, likesDoubles: true, likesSingles: true})
    ];
    const {slots, report} = generateLineupAssignment(emptySlots('four', false), players, {random: seeded(3)});
    expect(report.offPositionSeats).toBe(0);
    expect(backToBack(slots)).toEqual([]);
    expect(ruleViolations(slots)).toEqual([]);
  });

  it('prefers goalie war players for the goalie war sets', () => {
    const players = [
      allRounder('GW1'), allRounder('GW2'),
      player('Field1', {isStriker: true, isGoalie: true, likesSingles: true, likesDoubles: true}),
      player('Field2', {isStriker: true, isGoalie: true, likesSingles: true, likesDoubles: true}),
      player('Field3', {isStriker: true, isGoalie: true, likesSingles: true, likesDoubles: true})
    ];
    const {slots} = generateLineupAssignment(emptySlots('four', true), players, {random: seeded(11)});
    const goalieWarPlayers = slots.filter(slot => slot.position === 'gw').map(slot => slot.assignedPlayerId);
    expect(goalieWarPlayers.sort()).toEqual(['GW1', 'GW2']);
  });

  it('leaves the unstaffable tail empty for a squad of two or three', () => {
    const two = [allRounder('A'), allRounder('B')];
    const {slots} = generateLineupAssignment(emptySlots('four', false), two, {random: seeded(5)});
    expect(ruleViolations(slots)).toEqual([]);
    expect(slots.filter(slot => slot.setNumber <= 6).every(slot => !!slot.assignedPlayerId)).toBe(true);
    expect(slots.filter(slot => slot.setNumber > 6).every(slot => !slot.assignedPlayerId)).toBe(true);

    const three = [allRounder('A'), allRounder('B'), allRounder('C')];
    const result = generateLineupAssignment(emptySlots('four', false), three, {random: seeded(5)});
    expect(ruleViolations(result.slots)).toEqual([]);
    expect(result.slots.filter(slot => slot.setNumber <= 12).every(slot => !!slot.assignedPlayerId)).toBe(true);
    expect(result.slots.filter(slot => slot.setNumber > 12).every(slot => !slot.assignedPlayerId)).toBe(true);
  });

  it('never breaks a hard rule, whatever the squad looks like', () => {
    const random = seeded(99);
    for (let run = 0; run < 40; run++) {
      const squad = 4 + Math.floor(random() * 5);
      const players = Array.from({length: squad}, (_value, index) => player(`P${index + 1}`, {
        isGoalie: random() < 0.6,
        isStriker: random() < 0.6,
        likesSingles: random() < 0.6,
        likesDoubles: random() < 0.7,
        playsGoalieWar: random() < 0.4
      }));
      const mode: DoubleMatchesMode = random() < 0.5 ? 'four' : 'five';
      const {slots} = generateLineupAssignment(emptySlots(mode, random() < 0.5), players, {random});
      expect(ruleViolations(slots), `run ${run} with ${squad} players`).toEqual([]);
    }
  });

  it('draws a different lineup nearly every time for a full squad', () => {
    const players = Array.from({length: 6}, (_value, index) => allRounder(`P${index + 1}`));
    const lineups = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const {slots} = generateLineupAssignment(emptySlots('five', false), players, {random: seeded(seed * 7919)});
      expect(ruleViolations(slots), `seed ${seed}`).toEqual([]);
      expect(backToBack(slots), `seed ${seed}`).toEqual([]);
      lineups.add(slots.map(slot => slot.assignedPlayerId).join(','));
    }
    expect(lineups.size).toBeGreaterThanOrEqual(18);
  });

  it('spreads the Einzel sets over the whole match instead of front-loading them', () => {
    const players = [
      strikerSingles('Anna'), strikerSingles('Ben'),
      doublesGoalie('Cem'), doublesGoalie('Dana')
    ];
    const lineups = new Set<string>();
    const earlyPatterns = new Set<string>();
    let runsWithLateEinzelPlayerEarly = 0;

    for (let seed = 1; seed <= 20; seed++) {
      const {slots, report} = generateLineupAssignment(emptySlots('four', false), players, {random: seeded(seed * 7919)});
      // Every draw is still a lineup worth having.
      expect(ruleViolations(slots), `seed ${seed}`).toEqual([]);
      expect(backToBack(slots), `seed ${seed}`).toEqual([]);
      expect(report.emptySeats, `seed ${seed}`).toBe(0);
      expect(report.offPositionSeats, `seed ${seed}`).toBe(4);

      lineups.add(slots.map(slot => slot.assignedPlayerId).join(','));
      const early = slots
        .filter(slot => slot.position === 'single' && slot.setNumber <= 6)
        .sort((a, b) => a.setNumber - b.setNumber)
        .map(slot => slot.assignedPlayerId);
      earlyPatterns.add(early.join(','));
      if (early.some(id => id === 'Cem' || id === 'Dana')) runsWithLateEinzelPlayerEarly++;
    }

    expect(lineups.size).toBeGreaterThanOrEqual(6);
    expect(earlyPatterns.size).toBeGreaterThanOrEqual(4);
    // The complaint was that Anna and Ben took the first Einzel sets and Cem and Dana the
    // closing ones, every single time. The Einzel load now reaches into both halves.
    expect(runsWithLateEinzelPlayerEarly).toBeGreaterThanOrEqual(15);
  });

  it('stays fast enough for a button press', () => {
    const players = Array.from({length: 6}, (_value, index) => allRounder(`P${index + 1}`));
    const started = performance.now();
    for (let run = 0; run < 10; run++) {
      generateLineupAssignment(emptySlots('five', true), players, {random: seeded(run)});
    }
    const perRun = (performance.now() - started) / 10;
    expect(perRun).toBeLessThan(150);
  });
});
