import type {GameState, LiveInnings, Player, Team} from './types';

export function maxOversPerBowler(game: GameState): number {
  return game.league.format === 'T20'
    ? 4
    : game.league.format === 'ODI'
      ? 10
      : Math.max(1, Math.ceil(game.league.overs / 5));
}

export function getTeamXIPlayers(game: GameState, team: Team): Player[] {
  const selected = team.playingXI
    .map(id => game.players.find(player => player.id === id))
    .filter((player): player is Player => Boolean(player));

  if (selected.length >= 11) return selected.slice(0, 11);

  // Old saves may not have a saved Playing XI yet. Use the best roster players as a safe fallback.
  return team.playerIds
    .map(id => game.players.find(player => player.id === id))
    .filter((player): player is Player => Boolean(player))
    .sort((a, b) => (b.overall + b.form * 0.18) - (a.overall + a.form * 0.18))
    .slice(0, 11);
}

export function legalBallsBowled(inn: LiveInnings, playerId: string): number {
  return inn.events.filter(event =>
    event.bowlerId === playerId &&
    event.legal !== false &&
    event.outcome !== 'WD' &&
    event.outcome !== 'NB'
  ).length;
}

export function oversUsedByBowler(inn: LiveInnings, playerId: string): number {
  return Math.floor(legalBallsBowled(inn, playerId) / 6);
}

export function bowlerUnavailableReason(
  game: GameState,
  team: Team,
  inn: LiveInnings,
  player: Player,
  xiPlayers: Player[] = getTeamXIPlayers(game, team)
): string {
  if (!xiPlayers.some(candidate => candidate.id === player.id)) return 'Not in the confirmed XI';
  if (player.injury && player.injury.daysRemaining > 0) return `Injured · ${player.injury.daysRemaining} day(s)`;
  if (oversUsedByBowler(inn, player.id) >= maxOversPerBowler(game)) return 'Over limit reached';
  if (inn.balls > 0 && inn.balls % 6 === 0 && player.id === inn.bowlerId) return 'Cannot bowl consecutive overs';
  return '';
}

/**
 * Protects the innings from a bad bowling rotation. It simulates the remaining bowling capacity
 * after this bowler completes the next over, including the rule that the same player cannot bowl
 * consecutive overs. A lawful option is marked unsafe only when it would leave insufficient legal
 * overs/candidates to cover the remaining scheduled overs.
 */
export function wouldLeaveBowlingDeadEnd(
  game: GameState,
  team: Team,
  inn: LiveInnings,
  candidateId: string,
  xiPlayers: Player[] = getTeamXIPlayers(game, team)
): boolean {
  const candidate = xiPlayers.find(player => player.id === candidateId);
  if (!candidate || bowlerUnavailableReason(game, team, inn, candidate, xiPlayers)) return true;

  const match = game.liveMatch;
  if (!match) return false;
  const totalOversRemaining = Math.ceil(Math.max(0, match.ballsPerInnings - inn.balls) / 6);
  const futureOvers = Math.max(0, totalOversRemaining - 1);
  if (futureOvers === 0) return false;

  const maxOvers = maxOversPerBowler(game);
  const capacities = xiPlayers
    .filter(player => !player.injury || player.injury.daysRemaining <= 0)
    .map(player => {
      const oversLeft = Math.max(0, maxOvers - oversUsedByBowler(inn, player.id) - (player.id === candidateId ? 1 : 0));
      return {id: player.id, capacity: oversLeft};
    });

  // After the current over, the current bowler cannot be the very next bowler.
  const nextOptions = capacities.filter(item => item.id !== candidateId && item.capacity > 0);
  if (!nextOptions.length) return true;

  // In a future window of N overs, any bowler can appear at most ceil(N/2) times;
  // the bowler who just completed this over can appear at most floor(N/2) times.
  const totalFutureCapacity = capacities.reduce((sum, item) => {
    const maximumInSequence = item.id === candidateId
      ? Math.floor(futureOvers / 2)
      : Math.ceil(futureOvers / 2);
    return sum + Math.min(item.capacity, maximumInSequence);
  }, 0);

  return totalFutureCapacity < futureOvers;
}

export function getBowlingOptions(game: GameState, team: Team): Player[] {
  const xiPlayers = getTeamXIPlayers(game, team);
  const specialists = xiPlayers.filter(player => player.role.includes('Bowler'));
  const allRounders = xiPlayers.filter(player => player.role.includes('All-rounder'));
  const partTimers = xiPlayers.filter(player =>
    !specialists.some(specialist => specialist.id === player.id) &&
    !allRounders.some(allRounder => allRounder.id === player.id)
  );

  // Keep every member of the confirmed XI visible. Part-time bowlers are emergency choices,
  // but still legal options when the specialist rotation has been exhausted.
  return [...specialists, ...allRounders, ...partTimers].sort((a, b) => {
    const tier = (player: Player) => player.role.includes('Bowler') ? 2 : player.role.includes('All-rounder') ? 1 : 0;
    return tier(b) - tier(a) || b.bowlingRating - a.bowlingRating || b.form - a.form;
  });
}

export function recommendSafeBowler(
  game: GameState,
  team: Team,
  inn: LiveInnings,
  xiPlayers: Player[] = getTeamXIPlayers(game, team)
): Player | undefined {
  const options = getBowlingOptions(game, team);
  const lawful = options.filter(player => !bowlerUnavailableReason(game, team, inn, player, xiPlayers));
  const safe = lawful.filter(player => !wouldLeaveBowlingDeadEnd(game, team, inn, player.id, xiPlayers));
  const pool = safe.length ? safe : lawful;
  const phase = inn.balls < 36 ? 'Powerplay' : inn.balls < 96 ? 'Middle overs' : 'Death';
  const used = (id: string) => oversUsedByBowler(inn, id);

  return [...pool].sort((a, b) => {
    const score = (player: Player) => {
      const roleTier = player.role.includes('Bowler') ? 9 : player.role.includes('All-rounder') ? 5 : -9;
      const phaseSkill = phase === 'Death' ? player.attrs.deathBowling : phase === 'Powerplay' ? player.attrs.powerplayBowling : player.bowlingRating;
      const phasePlan = team.bowlingPlan?.[player.id] === phase ? 7 : 0;
      const rotationValue = Math.max(0, maxOversPerBowler(game) - used(player.id)) * 0.8;
      return player.bowlingRating * 0.58 + player.form * 0.16 + player.sharpness * 0.08 + phaseSkill * 0.12 + roleTier + phasePlan + rotationValue - player.fatigue * 0.06;
    };
    return score(b) - score(a);
  })[0];
}

export function bowlingSafetySummary(
  game: GameState,
  team: Team,
  inn: LiveInnings,
  xiPlayers: Player[] = getTeamXIPlayers(game, team)
): {safeCount: number; lawfulCount: number; recommendationId?: string; message: string} {
  const roster = getBowlingOptions(game, team);
  const lawful = roster.filter(player => !bowlerUnavailableReason(game, team, inn, player, xiPlayers));
  const safe = lawful.filter(player => !wouldLeaveBowlingDeadEnd(game, team, inn, player.id, xiPlayers));
  const recommendation = recommendSafeBowler(game, team, inn, xiPlayers);

  if (!lawful.length) {
    return {safeCount: 0, lawfulCount: 0, message: 'No legal bowler is available. Check injuries, over limits and the confirmed XI.'};
  }
  if (!safe.length) {
    return {safeCount: 0, lawfulCount: lawful.length, recommendationId: recommendation?.id, message: 'Bowling rotation is constrained. Choose the recommended emergency option to continue without breaking the over limit.'};
  }
  const partTime = safe.some(player => !player.role.includes('Bowler') && !player.role.includes('All-rounder'));
  return {
    safeCount: safe.length,
    lawfulCount: lawful.length,
    recommendationId: recommendation?.id,
    message: partTime
      ? 'Safety guard is active. All XI players are available as emergency part-time options if specialists reach their limit.'
      : 'Safety guard is active. Picks that could leave too few legal overs covered are blocked.'
  };
}
