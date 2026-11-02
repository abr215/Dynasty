/** Contextual match commentary for Dynasty T20. The final line is composed from the event bank and situation bank. */
export type NarrativeKind = 'dot'|'single'|'two'|'three'|'four'|'six'|'wicket'|'lbw'|'caught'|'bowled'|'stumped'|'runOut'|'wide'|'noBall'|'bye'|'legBye'|'review'|'reviewOverturned'|'reviewUpheld'|'fifty'|'century'|'hatTrick'|'maiden'|'pressure'|'collapse'|'recovery'|'partnership'|'overSummary'|'chase'|'misfield'|'droppedCatch'|'boundaryStreak'|'inningsBreak'|'result';

const BANK: Record<NarrativeKind, string[]> = {
  dot: [
    'A tight line and no room to free the arms.', 'The batter gets behind it; the bowler wins this exchange.',
    'A quiet delivery, but pressure is building at this end.', 'Good length, straight enough, and defended carefully.',
    'No scoring opportunity. The fielding side keeps its shape.', 'The ball holds its line and the shot never comes.',
    'A disciplined delivery with no reward for the batter.', 'The bowler makes the batter play without offering width.',
    'Well judged by the bowler; a useful dot in the context.', 'The batter waits, but the gap never opens.'
  ],
  single: [
    'Worked into the gap for one; sensible cricket.', 'A quick single keeps the scoreboard moving.',
    'Good awareness from the pair; they take the available run.', 'Guided into the off side and they hurry through.',
    'No risk beyond the call. They rotate strike.', 'A nudge into space and a comfortable single follows.',
    'They turn one into a run with sharp running.', 'A controlled push into the leg side brings one.',
    'The field is spread, so they take the easy single.', 'Smart running: no boundary, but no dot either.'
  ],
  two: [
    'They find the deep gap and come back for two.', 'Good placement forces the fielder to turn and chase.',
    'A well-run couple; both batters communicate early.', 'The ball stays inside the rope and two are safely taken.',
    'A wristy pick-up into space; they push hard for two.', 'The fielder gets across, but the second run is home.',
    'Excellent calling turns a single into a brace.', 'They use the big boundary and collect two.',
    'A busy couple of runs, taken with purpose.', 'The pair judge the field well and complete two.'
  ],
  three: [
    'They keep running and squeeze three out of the gap.', 'Top running between the wickets brings three.',
    'The fielder has ground to cover; they push for the third.',
    'A clever shot into the deep and a hard-earned three.', 'Both batters turn sharply and make the long third run.',
    'Excellent awareness: three runs before the ball comes back.'
  ],
  four: [
    'FOUR! Threaded through the gap; the fielder cannot cut it off.', 'FOUR! Clean contact and it races across the rope.',
    'FOUR! The timing does the work; no need to overhit it.', 'FOUR! A late face opens the space behind point.',
    'FOUR! Picked up neatly and placed beyond the inner ring.', 'FOUR! The bowler misses the mark and pays for it.',
    'FOUR! Strong hands through the line, right into the gap.', 'FOUR! The chase is on, but the ball wins the race.',
    'FOUR! A crisp stroke that beats the protection on the boundary.', 'FOUR! The batter spots the length early and punishes it.'
  ],
  six: [
    'SIX! Clean strike and the ball clears the boundary with room to spare.', 'SIX! Right in the slot; the batter makes no mistake.',
    'SIX! A powerful swing sends it into the stands.', 'SIX! The length is punished, straight and emphatic.',
    'SIX! Picked up from the pads and carried all the way.', 'SIX! That is superb timing, not just power.',
    'SIX! The bowler misses the yorker and the batter launches it.', 'SIX! Deep into the crowd; the field can only watch.',
    'SIX! A confident hit that changes the feel of the over.', 'SIX! The batter gets under it and sends it soaring.'
  ],
  wicket: [
    'WICKET! The bowler wins the contest at a crucial moment.', 'OUT! A breakthrough, and the fielding side responds immediately.',
    'WICKET! The pressure finally produces a mistake.', 'OUT! The batter has to go; the partnership is broken.',
    'WICKET! Excellent execution when the batting side wanted momentum.', 'OUT! A big moment in the innings, and the ground wakes up.',
    'WICKET! The bowler stays brave and gets the reward.', 'OUT! The shot was on, but the execution was not.',
    'WICKET! Another twist; the incoming batter has a job to do.', 'OUT! The fielding side has found a way through.'
  ],
  lbw: [
    'LOUD LBW APPEAL! The bowler is convinced and the umpire raises the finger.', 'LBW! The ball beats the bat and strikes the pad in front.',
    'A huge shout for LBW; the umpire gives it. The captain must decide.', 'TRAPPED IN FRONT! A classic line-and-length dismissal.',
    'The ball straightens into the pads. The umpire gives the batter out.'
  ],
  caught: [
    'TAKEN! The fielder holds on under pressure.', 'CAUGHT! The ball hangs in the air and the fielder completes the chance.',
    'A sharp catch in the ring; the bowler has the breakthrough.', 'CAUGHT BEHIND! A fine edge carries through to the keeper.',
    'The fielder settles, watches it all the way, and takes it cleanly.'
  ],
  bowled: [
    'BOWLED! The ball sneaks through and disturbs the stumps.', 'CASTLED! The bowler beats the defence with pace and precision.',
    'The stumps are broken; the batter is beaten all ends up.', 'BOWLED! A perfect answer to the batter looking to attack.',
    'The line is immaculate and the bails fly.'
  ],
  stumped: [
    'STUMPED! The keeper is lightning quick and the batter is short.', 'Out of the crease and punished; the bails are off in a flash.',
    'The keeper gathers cleanly and completes a sharp stumping.', 'STUMPED! Smart bowling draws the batter down the pitch.',
    'The batter misses, the keeper does the rest.'
  ],
  runOut: [
    'RUN-OUT CHANCE! The throw is in; this needs a close look.', 'A direct hit! The umpire sends it upstairs for a check.',
    'Sharp fielding creates a run-out opportunity. Third umpire time.', 'The pair hesitate and the fielding side attacks the stumps.',
    'A quick pick-up and accurate throw; the decision goes upstairs.'
  ],
  wide: [
    'Wide ball; the line slips away and the batting side gets an extra.', 'Too far outside the marker. Wide called, and the ball must be bowled again.',
    'The bowler loses the line; an extra run and no legal ball.', 'Wide! The batter leaves it alone and the umpire signals the extra.',
    'The delivery drifts beyond reach. The pressure shifts slightly.'
  ],
  noBall: [
    'NO-BALL! The front foot is over the line; an extra and a free hit follows.', 'No-ball called. The bowler has overstepped and must reset.',
    'The umpire spots the front-foot fault. One extra, and the delivery does not count.', 'NO-BALL! A costly error in execution.',
    'The stride carries beyond the crease. No-ball, and the innings continues.'
  ],
  bye: [
    'Past the bat and keeper; they scamper a bye.', 'The ball beats everyone and the batters run through for byes.',
    'No contact with bat or body; the pair collect a bye.', 'A takeable ball gets through and the batting side adds a bye.'
  ],
  legBye: [
    'Off the pads and into space; they take a leg-bye.', 'The ball brushes the pad, not the bat, and they run.',
    'Leg-byes signalled. Good awareness to steal the run.', 'It clips the body and rolls away; the pair take a leg-bye.'
  ],
  review: [
    'The captain signals for a review. The stadium waits for the evidence.', 'DRS is taken. The third umpire begins the checks.',
    'The on-field decision is under review; every frame matters.', 'The captain believes there is enough doubt to challenge the call.',
    'Review requested. Ball tracking and the available evidence will decide it.'
  ],
  reviewOverturned: [
    'NOT OUT! The review finds enough evidence to overturn the decision.', 'Decision overturned! The batter survives after the review.',
    'The screen says NOT OUT. A successful review keeps the innings alive.', 'The original decision is reversed after the checks.',
    'NOT OUT! The evidence does not support the on-field call.'
  ],
  reviewUpheld: [
    'OUT! The review supports the umpire’s original decision.', 'Decision stands. The captain loses the review and the batter must go.',
    'The third umpire sees no reason to overturn it: OUT remains.', 'Review completed; the on-field decision is upheld.',
    'OUT confirmed. The fielding side has its breakthrough.'
  ],
  fifty: [
    'FIFTY! A valuable half-century built through timing and judgement.', 'Half-century reached; the batter raises the bat to acknowledge the applause.',
    'That is fifty. A composed innings with plenty still to do.', 'FIFTY UP! The batter has anchored the innings and now eyes more.',
    'A well-earned fifty, shaped by patience and selective aggression.'
  ],
  century: [
    'CENTURY! A magnificent hundred under pressure; the crowd rises.', 'ONE HUNDRED! A special innings, built ball by ball.',
    'A century completed. The batter acknowledges the dressing room and the crowd.', 'HUNDRED UP! Timing, judgement and composure have come together.',
    'A brilliant hundred. The celebration is deserved, but the match is not done.'
  ],
  hatTrick: [
    'HAT-TRICK! Three wickets in three consecutive legal deliveries. Outstanding.', 'THREE IN A ROW! The bowler has a hat-trick and the innings is in chaos.',
    'Hat-trick completed! The bowler has delivered a rare moment of brilliance.', 'A historic sequence: three consecutive legal-ball wickets.',
    'HAT-TRICK! The field surrounds the bowler after an extraordinary spell.'
  ],
  maiden: [
    'A maiden over. Six legal balls, no runs, and pressure firmly applied.', 'A complete over of control; the batting side cannot get away.',
    'Six dot balls in the over. The bowler has squeezed the innings.', 'Maiden! The fielding side wins a small but important battle.'
  ],
  pressure: [
    'The required rate keeps climbing; a release shot is becoming important.', 'The fielding side has slowed the scoring and the pressure is visible.',
    'Two quiet deliveries can change the feel of a chase; the batter must respond.', 'The captain senses the moment and keeps the field attacking.',
    'The partnership needs a boundary to reset the tempo.', 'There is no need to panic yet, but the options are narrowing.'
  ],
  collapse: [
    'Another wicket. The innings is in danger of losing its shape.', 'The scoreboard has moved, but the wickets column is becoming the story.',
    'A cluster of wickets has shifted control to the fielding side.', 'The next partnership is vital; the batting side needs stability.',
    'The dressing room will be concerned. The innings needs a calm response.'
  ],
  recovery: [
    'A useful partnership is forming and the innings is finding its rhythm.', 'They have absorbed the pressure and are now rotating strike well.',
    'The run rate settles as the pair rebuild with sensible cricket.', 'A calm stand gives the batting side a platform for the closing overs.',
    'The fielding side needs a breakthrough; the batters look increasingly settled.'
  ],
  partnership: [
    'The partnership keeps growing; both batters are reading the conditions well.', 'That stand is now putting pressure back on the bowling side.',
    'Good communication and complementary styles are making this pair effective.', 'The partnership reaches another milestone with smart strike rotation.'
  ],
  overSummary: [
    'End of the over. The captain has a decision to make for the next phase.', 'Six legal balls completed; the field changes and the next bowler is due.',
    'Over completed. The batting side will assess whether to press or reset.', 'The over closes with the contest finely balanced.'
  ],
  chase: [
    'The target remains in reach, but the asking rate demands better value from this over.', 'One good over would shift the chase; the bowling side knows it.',
    'Every run matters now. The batters must balance risk and strike rotation.', 'The target is moving closer, but wickets in hand remain crucial.',
    'The equation is tightening. The next few deliveries could decide the game.'
  ],
  misfield: [
    'A rare misfield allows an extra run; the captain will not be pleased.', 'The fielder cannot gather cleanly and the batters make them pay.',
    'A small error in the ring lets the batting side keep the scoreboard ticking.'
  ],
  droppedCatch: [
    'A chance goes down! The bowler cannot believe it; the batter gets a lifeline.', 'Dropped! The fielder got there but could not hold on.',
    'The catch is spilled and the match script changes in an instant.'
  ],
  boundaryStreak: [
    'That is another boundary in the over; the bowler needs a change of plan.', 'Back-to-back boundaries! The batter has seized the momentum.',
    'The pressure has flipped. The fielding captain must interrupt this flow.'
  ],
  inningsBreak: [
    'Innings break. The bowling side now knows exactly what the chase requires.', 'The innings closes; the target is set and the tactical reset begins.',
    'A short interval now. Coaches and captains will review the first innings.'
  ],
  result: [
    'The contest is complete. Both scorecards will be added to the season record book.', 'Full time. The result and player performances are now locked into the tournament.',
    'That is the match. The standings and player leaderboards update from the final scorecard.'
  ]
};

const SITUATION = [
  'The pitch has offered just enough assistance to keep the contest alive.',
  'The field is set for the most likely scoring option, but execution still matters.',
  'The matchup favours the bowler on paper; the batter has found a way to stay competitive.',
  'Form is showing in the timing, though the next delivery remains its own contest.',
  'The captain adjusts the field as the phase and scoreboard demand.',
  'A small moment, but one that can shape the next over.',
  'The crowd reacts as the balance of the contest shifts a fraction.',
  'Conditions have a say, but the execution makes the difference.',
  'The next phase will test decision-making as much as technical skill.',
  'The scoreboard tells one story; the pressure tells another.',
  'The bowler changes the angle and asks a different question.',
  'The batter keeps the focus on the ball rather than the equation.',
  'A tactical battle is developing between the captain and the batter.',
  'There is still time for either side to turn the game.',
  'This is why every delivery matters in a close contest.'
];

export const MATCH_SCRIPT_LIBRARY = Object.entries(BANK).flatMap(([kind, lines]) =>
  lines.flatMap((line, i) => SITUATION.map((context, j) => ({
    id: `${kind}-${i + 1}-${j + 1}`,
    kind: kind as NarrativeKind,
    line,
    context,
  })))
);
export const MATCH_SCRIPT_COUNT = MATCH_SCRIPT_LIBRARY.length;

export function commentary(kind: NarrativeKind, batter: string, bowler: string, opts?: { phase?: string; pressure?: boolean; context?: string; seq?: number }): string {
  const lines = BANK[kind] ?? BANK.dot;
  const index = Math.abs(opts?.seq ?? Math.floor(Math.random() * lines.length)) % lines.length;
  let line = lines[index].replaceAll('{batter}', batter).replaceAll('{bowler}', bowler);
  if (batter && ['dot','single','two','three','four','six','wicket','lbw','caught','bowled','stumped','runOut'].includes(kind)) {
    if (!line.includes(batter)) line = `${batter}: ${line}`;
  }
  if (opts?.context) line += ` ${opts.context}`;
  else if (opts?.pressure && ['dot','single','two','four','six','wicket','wide','noBall'].includes(kind)) line += ` ${SITUATION[(opts.seq ?? index) % SITUATION.length]}`;
  return line;
}
