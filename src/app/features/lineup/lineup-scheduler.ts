import {LineupSlot, PositionType} from '../../models/lineup.model';
import {Player} from '../../models/player.model';

/**
 * Builds a lineup by searching over the matches in playing order instead of filling
 * the slots one by one. Filling slot by slot lets whoever fits the early sets burn
 * their quota there, which strands the rest of the squad in the closing sets and makes
 * them play back to back. Searching over matches lets the generator weigh a seat against
 * everything that comes after it.
 */

export interface ScheduleOptions {
  /** Sets past this stay empty; a squad of two or three cannot staff the whole match. */
  maxSetNumber?: number;
  random?: () => number;
}

export interface ScheduleReport {
  /** Seats no one could take without breaking a hard rule. */
  emptySeats: number;
  /** Appearances where the player also played the match immediately before. */
  backToBackAppearances: number;
  /** Seats given to a player who has not ticked that position. */
  offPositionSeats: number;
  gamesPerPlayer: Map<string, number>;
}

export interface ScheduleResult {
  slots: LineupSlot[];
  report: ScheduleReport;
}

/** What the generator weighs when it picks a seat. Lower is better. */
const COST = {
  /** Dwarfs every other term, so a seat stays empty only when the rules leave no one. */
  emptySeat: 10_000,
  backToBack: 600,
  offPosition: 150,
  dislikesDoubles: 40,
  /** Charged per step of the squared game count, which pushes games onto the least busy player. */
  load: 25,
  /** Exactly one match of rest - legal, but still worth spreading out when there is room. */
  shortRest: 10,
} as const;

const MAX_SINGLES_PER_PLAYER = 2;
const MAX_DOUBLES_PER_PLAYER = 2;
const MAX_GAMES_PER_PLAYER = MAX_SINGLES_PER_PLAYER + MAX_DOUBLES_PER_PLAYER;
const NODES_PER_ATTEMPT = 25_000;
const ATTEMPTS = 4;
const VARIANT_NODES = 25_000;
/**
 * How much worse than the best lineup a drawn lineup may be. Below the cheapest thing that
 * actually matters - a lopsided game count costs at least 50, an off position seat 150, a
 * back to back 600 - so only the spacing niceties are allowed to differ.
 */
const TIE_SLACK = 30;
/**
 * Jitter on the order the search tries seats in while drawing. Wide enough that a seat which
 * merely looks worse right here (an off position seat, one more game) gets its turn, narrow
 * enough that a seat following the previous match never jumps the queue.
 */
const PICK_SPREAD = 250;

const EMPTY = -1;

type MatchKind = 'single' | 'gw' | 'double';

interface Seat {
  setNumber: number;
  position: PositionType;
}

interface ScheduleMatch {
  kind: MatchKind;
  /** One seat for singles and goalie war, striker before goalie for doubles. */
  seats: Seat[];
}

/** The three things a drawn lineup is held to: its cost, and the two faults it may not add. */
interface DrawLimit {
  cost: number;
  backToBack: number;
  emptySeats: number;
}

interface Candidate {
  /** Player index per seat of the match, or EMPTY. */
  players: number[];
  cost: number;
  /** What the seats are tried in order of - the cost, jittered while drawing a lineup. */
  sortKey: number;
  /** Filled while the candidate is applied so the search can walk back out of it. */
  restoreLastMatch: number[];
}

export function fitsPosition(player: Player, position: PositionType): boolean {
  switch (position) {
    case 'single':
      return player.likesSingles;
    case 'gw':
      return player.playsGoalieWar;
    case 'striker':
      return player.isStriker;
    case 'goalie':
      return player.isGoalie;
  }
}

/**
 * With two or three players the quotas run out before the sets do, so the tail of the
 * match is left blank rather than filled with rule breaking assignments.
 */
export function fillableSetLimit(playerCount: number, slots: LineupSlot[]): number {
  if (playerCount === 2) return 6;
  if (playerCount === 3) return 12;
  return slots.reduce((highest, slot) => Math.max(highest, slot.setNumber), 0);
}

export function generateLineupAssignment(
  slots: LineupSlot[],
  players: Player[],
  options: ScheduleOptions = {}
): ScheduleResult {
  const random = options.random ?? Math.random;
  const maxSetNumber = options.maxSetNumber ?? fillableSetLimit(players.length, slots);
  const matches = buildMatches(slots, maxSetNumber);

  const emptied: LineupSlot[] = slots.map(slot => ({...slot, assignedPlayerId: null}));
  if (players.length === 0 || matches.length === 0) {
    return {slots: emptied, report: report(matches, [], players)};
  }

  const scheduler = new MatchScheduler(matches, players, random);
  const seating = scheduler.solve();

  const byNumberAndPosition = new Map<string, LineupSlot>();
  emptied.forEach(slot => byNumberAndPosition.set(seatKey(slot.setNumber, slot.position), slot));
  matches.forEach((match, matchIndex) => {
    match.seats.forEach((seat, seatIndex) => {
      const player = seating[matchIndex][seatIndex];
      if (player === EMPTY) return;
      const slot = byNumberAndPosition.get(seatKey(seat.setNumber, seat.position));
      if (slot) slot.assignedPlayerId = players[player].id;
    });
  });

  return {slots: emptied, report: report(matches, seating, players)};
}

function seatKey(setNumber: number, position: PositionType): string {
  return `${setNumber}-${position}`;
}

/**
 * Groups the slots the way the lineup is actually played: a double is one match that
 * seats two players, everything else is a match for one.
 */
function buildMatches(slots: LineupSlot[], maxSetNumber: number): ScheduleMatch[] {
  const ordered = slots
    .filter(slot => slot.setNumber <= maxSetNumber)
    .sort((a, b) => a.setNumber - b.setNumber);
  const matches: ScheduleMatch[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const slot = ordered[i];
    const next = ordered[i + 1];
    if (slot.position === 'striker' && next?.position === 'goalie') {
      matches.push({kind: 'double', seats: [seatOf(slot), seatOf(next)]});
      i++;
    } else {
      matches.push({kind: slot.position === 'gw' ? 'gw' : 'single', seats: [seatOf(slot)]});
    }
  }
  return matches;
}

function seatOf(slot: LineupSlot): Seat {
  return {setNumber: slot.setNumber, position: slot.position};
}

class MatchScheduler {
  private readonly playerCount: number;
  private readonly order: number[];

  private readonly singles: number[];
  private readonly doubles: number[];
  private readonly games: number[];
  private readonly lastMatch: number[];
  private readonly usedPairs = new Set<number>();

  private readonly seating: number[][];
  /** Seats still to hand out from each match on, so the search can bound what is left. */
  private readonly remainingSeats: number[];
  private bestSeating: number[][];
  private drawnSeating: number[][] | null = null;
  private bestCost = Number.POSITIVE_INFINITY;
  private nodes = 0;

  constructor(
    private readonly matches: ScheduleMatch[],
    private readonly players: Player[],
    private readonly random: () => number
  ) {
    this.playerCount = players.length;
    this.order = players.map((_player, index) => index);
    this.singles = new Array<number>(this.playerCount).fill(0);
    this.doubles = new Array<number>(this.playerCount).fill(0);
    this.games = new Array<number>(this.playerCount).fill(0);
    this.lastMatch = new Array<number>(this.playerCount).fill(EMPTY);
    this.seating = matches.map(match => match.seats.map(() => EMPTY));
    this.remainingSeats = new Array<number>(matches.length + 1).fill(0);
    for (let i = matches.length - 1; i >= 0; i--) {
      this.remainingSeats[i] = this.remainingSeats[i + 1] + matches[i].seats.length;
    }
    this.bestSeating = this.seating.map(seats => [...seats]);
  }

  /**
   * Works out how good a lineup can get, then draws one at random from everything that is
   * that good. Without the draw the search would hand back the same lineup every time: it
   * keeps the first best it finds and cuts off every equally good one behind it, so the
   * squad would fall into the same slots on every press of the button.
   */
  solve(): number[][] {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      shuffle(this.order, this.random);
      this.nodes = 0;
      this.search(0, 0);
      // A lineup that seats everyone with nobody twice in a row is what we came for;
      // the remaining attempts only exist to shake a squad out of a bad first draw.
      const best = report(this.matches, this.bestSeating, this.players);
      if (best.emptySeats === 0 && best.backToBackAppearances === 0) break;
    }
    return this.draw() ?? this.bestSeating;
  }

  /**
   * Dives through the lineups that are within a whisker of the best one, trying the seats in
   * a jittered order, and takes the first one it reaches. Anything that can no longer come
   * out that good is cut off, so whatever it lands on is a lineup worth having.
   */
  private draw(): number[][] | null {
    if (!Number.isFinite(this.bestCost)) return null;
    const best = report(this.matches, this.bestSeating, this.players);
    shuffle(this.order, this.random);
    this.nodes = 0;
    this.drawnSeating = null;
    this.drawSearch(0, {
      cost: this.bestCost + TIE_SLACK,
      backToBack: best.backToBackAppearances,
      emptySeats: best.emptySeats
    }, {cost: 0, backToBack: 0, emptySeats: 0});
    return this.drawnSeating;
  }

  /**
   * The cost is a sum, so two lineups can cost the same and still be made of different faults.
   * Counting the two faults nobody wants traded away separately keeps the draw from buying
   * back a set that follows the previous one with seats it puts right elsewhere.
   */
  private drawSearch(matchIndex: number, limit: DrawLimit, soFar: DrawLimit): boolean {
    if (soFar.cost + this.loadBound(matchIndex) > limit.cost) return false;
    if (soFar.backToBack > limit.backToBack || soFar.emptySeats > limit.emptySeats) return false;
    if (matchIndex === this.matches.length) {
      this.drawnSeating = this.seating.map(seats => [...seats]);
      return true;
    }
    if (this.nodes++ >= VARIANT_NODES) return false;

    for (const candidate of this.candidates(matchIndex, PICK_SPREAD)) {
      const faults = this.candidateFaults(matchIndex, candidate);
      this.apply(matchIndex, candidate);
      const drawn = this.drawSearch(matchIndex + 1, limit, {
        cost: soFar.cost + candidate.cost,
        backToBack: soFar.backToBack + faults.backToBack,
        emptySeats: soFar.emptySeats + faults.emptySeats
      });
      this.undo(matchIndex, candidate);
      if (drawn) return true;
      if (this.nodes >= VARIANT_NODES) return false;
    }
    return false;
  }

  /** Must run before the candidate is applied, while lastMatch still points at the past. */
  private candidateFaults(matchIndex: number, candidate: Candidate): { backToBack: number, emptySeats: number } {
    let backToBack = 0;
    let emptySeats = 0;
    for (const player of candidate.players) {
      if (player === EMPTY) emptySeats++;
      else if (this.lastMatch[player] !== EMPTY && this.lastMatch[player] === matchIndex - 1) backToBack++;
    }
    return {backToBack, emptySeats};
  }

  /**
   * Depth first over the matches with the running cost as the bound: the first branch is
   * the greedy lineup, and everything that is already worse than the best complete lineup
   * is cut off. The node budget keeps a hopeless squad from stalling the button press.
   */
  private search(matchIndex: number, cost: number): void {
    if (cost + this.loadBound(matchIndex) >= this.bestCost) return;
    if (matchIndex === this.matches.length) {
      this.bestCost = cost;
      this.bestSeating = this.seating.map(seats => [...seats]);
      return;
    }
    if (this.nodes++ >= NODES_PER_ATTEMPT) return;

    for (const candidate of this.candidates(matchIndex, 0)) {
      this.apply(matchIndex, candidate);
      this.search(matchIndex + 1, cost + candidate.cost);
      this.undo(matchIndex, candidate);
      if (this.nodes >= NODES_PER_ATTEMPT) return;
    }
  }

  /** `spread` jitters the order the seats are tried in, which is what varies the draw. */
  private candidates(matchIndex: number, spread: number): Candidate[] {
    return this.matches[matchIndex].kind === 'double'
      ? this.doubleCandidates(matchIndex, spread)
      : this.soloCandidates(matchIndex, spread);
  }

  private soloCandidates(matchIndex: number, spread: number): Candidate[] {
    const {position} = this.matches[matchIndex].seats[0];
    const candidates: Candidate[] = [];
    for (const player of this.order) {
      if (this.singles[player] >= MAX_SINGLES_PER_PLAYER) continue;
      candidates.push(this.candidate([player], this.seatCost(player, position, matchIndex), spread));
    }
    candidates.sort(bySortKey);
    candidates.push(this.candidate([EMPTY], COST.emptySeat, 0));
    return candidates;
  }

  private doubleCandidates(matchIndex: number, spread: number): Candidate[] {
    const candidates: Candidate[] = [];
    for (const striker of this.order) {
      if (this.doubles[striker] >= MAX_DOUBLES_PER_PLAYER) continue;
      for (const goalie of this.order) {
        if (goalie === striker) continue;
        if (this.doubles[goalie] >= MAX_DOUBLES_PER_PLAYER) continue;
        if (this.usedPairs.has(pairKey(striker, goalie))) continue;
        candidates.push(this.candidate(
          [striker, goalie],
          this.seatCost(striker, 'striker', matchIndex) + this.seatCost(goalie, 'goalie', matchIndex),
          spread
        ));
      }
    }
    if (candidates.length === 0) {
      // No legal pair left, so half a double still beats two blank seats.
      for (const player of this.order) {
        if (this.doubles[player] >= MAX_DOUBLES_PER_PLAYER) continue;
        candidates.push(this.candidate([player, EMPTY], this.seatCost(player, 'striker', matchIndex) + COST.emptySeat, spread));
        candidates.push(this.candidate([EMPTY, player], this.seatCost(player, 'goalie', matchIndex) + COST.emptySeat, spread));
      }
    }
    candidates.sort(bySortKey);
    candidates.push(this.candidate([EMPTY, EMPTY], 2 * COST.emptySeat, 0));
    return candidates;
  }

  private candidate(players: number[], cost: number, spread: number): Candidate {
    return {
      players,
      cost,
      sortKey: spread > 0 ? cost + this.random() * spread : cost,
      restoreLastMatch: players.map(() => EMPTY)
    };
  }

  /**
   * Cheapest the remaining seats could ever be: hand them to the players with the fewest
   * games and ignore every other rule. Everything else the search charges for is positive,
   * so this stays a floor - it just lets a lineup that cannot catch up be dropped early.
   */
  private loadBound(matchIndex: number): number {
    const byGames = [0, 0, 0, 0, 0];
    for (let player = 0; player < this.playerCount; player++) {
      byGames[Math.min(this.games[player], MAX_GAMES_PER_PLAYER)]++;
    }
    let seats = this.remainingSeats[matchIndex];
    let bound = 0;
    for (let games = 0; games < MAX_GAMES_PER_PLAYER && seats > 0; games++) {
      const taken = Math.min(byGames[games], seats);
      bound += taken * COST.load * (2 * games + 1);
      byGames[games + 1] += taken;
      seats -= taken;
    }
    return bound;
  }

  private seatCost(player: number, position: PositionType, matchIndex: number): number {
    let cost = COST.load * (2 * this.games[player] + 1);
    if (!fitsPosition(this.players[player], position)) cost += COST.offPosition;
    if (isDoublePosition(position) && !this.players[player].likesDoubles) cost += COST.dislikesDoubles;
    const previous = this.lastMatch[player];
    if (previous !== EMPTY) {
      const rest = matchIndex - previous;
      if (rest === 1) cost += COST.backToBack;
      else if (rest === 2) cost += COST.shortRest;
    }
    return cost;
  }

  private apply(matchIndex: number, candidate: Candidate): void {
    const match = this.matches[matchIndex];
    candidate.players.forEach((player, seatIndex) => {
      this.seating[matchIndex][seatIndex] = player;
      if (player === EMPTY) {
        candidate.restoreLastMatch[seatIndex] = EMPTY;
        return;
      }
      candidate.restoreLastMatch[seatIndex] = this.lastMatch[player];
      if (match.kind === 'double') this.doubles[player]++;
      else this.singles[player]++;
      this.games[player]++;
      this.lastMatch[player] = matchIndex;
    });
    if (this.isFullDouble(match, candidate)) {
      this.usedPairs.add(pairKey(candidate.players[0], candidate.players[1]));
    }
  }

  private undo(matchIndex: number, candidate: Candidate): void {
    const match = this.matches[matchIndex];
    if (this.isFullDouble(match, candidate)) {
      this.usedPairs.delete(pairKey(candidate.players[0], candidate.players[1]));
    }
    candidate.players.forEach((player, seatIndex) => {
      this.seating[matchIndex][seatIndex] = EMPTY;
      if (player === EMPTY) return;
      this.lastMatch[player] = candidate.restoreLastMatch[seatIndex];
      this.games[player]--;
      if (match.kind === 'double') this.doubles[player]--;
      else this.singles[player]--;
    });
  }

  private isFullDouble(match: ScheduleMatch, candidate: Candidate): boolean {
    return match.kind === 'double' && candidate.players[0] !== EMPTY && candidate.players[1] !== EMPTY;
  }
}

function bySortKey(a: Candidate, b: Candidate): number {
  return a.sortKey - b.sortKey;
}

function isDoublePosition(position: PositionType): boolean {
  return position === 'striker' || position === 'goalie';
}

/** Order free, so the two seatings of a pair count as the one pair the rules forbid twice. */
function pairKey(a: number, b: number): number {
  return a < b ? a * 1000 + b : b * 1000 + a;
}

function shuffle(values: number[], random: () => number): void {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
}

function report(matches: ScheduleMatch[], seating: number[][], players: Player[]): ScheduleReport {
  const gamesPerPlayer = new Map<string, number>();
  players.forEach(player => gamesPerPlayer.set(player.id, 0));

  let emptySeats = 0;
  let backToBackAppearances = 0;
  let offPositionSeats = 0;
  const lastMatch = new Array<number>(players.length).fill(EMPTY);

  matches.forEach((match, matchIndex) => {
    match.seats.forEach((seat, seatIndex) => {
      const player = seating[matchIndex]?.[seatIndex] ?? EMPTY;
      if (player === EMPTY) {
        emptySeats++;
        return;
      }
      if (!fitsPosition(players[player], seat.position)) offPositionSeats++;
      if (lastMatch[player] !== EMPTY && lastMatch[player] === matchIndex - 1) backToBackAppearances++;
      lastMatch[player] = matchIndex;
      const id = players[player].id;
      gamesPerPlayer.set(id, (gamesPerPlayer.get(id) ?? 0) + 1);
    });
  });

  return {emptySeats, backToBackAppearances, offPositionSeats, gamesPerPlayer};
}
