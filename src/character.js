// character.js - Onsay, the character. A ball with a face, drawn as one small inline SVG and
// animated by numbers rather than by keyframes, so he can hold any pose between any two named ones.
//
// WHY NOT A 3D LIBRARY. He does not need a renderer, he needs one projection. Every feature on his
// face is a point on a sphere, and turning him is that sphere rotating: each point is rotated in
// three dimensions and projected flat, so his eyes crowd together and squash toward the edge on
// their own, exactly as a face painted on a ball does. That is thirty lines of trigonometry rather
// than 600KB of scene graph, and it runs on a decade old laptop.
//
// WHAT MAKES HIM FEEL ALIVE. Every part of his face is a number with a spring behind it. Nothing
// snaps, everything settles, and two expressions can be half mixed while a gesture plays over the
// top. His eyes have real lids that shutter down, which is what a blink actually is and what makes
// a squint, a doubt and a heavy sleepy eye all reachable from the same control.
//
// COST. One shared frame loop for every character on the page, and it stops completely when they
// are all off screen, when the tab is hidden, or when nothing is moving. No dependency.
//
//  1. FACE                   the geometry, in one place, so a pose is data and not code
//  2. EXPRESSIONS            named poses. Every one is a partial set of channel targets
//  3. GESTURES               one off movements, written as a function of their own progress
//  4. MOODS                  what he does when nothing is happening
//  5. REACTIONS              a product event, mapped to an expression and a gesture
//  6. project / mouthArc     the sphere, and the mouth drawn as part of a circle
//  7. Spring, ticker         one channel, and the single shared frame loop
//  8. createOnsay(el, opts)  build one, and everything you can tell him to do
//  9. onsayMarkup(opts)      the same SVG as a static string, for a page with no script
//     MATERIALS             named surfaces. Glass, chrome, gold, and the numbers under each

////////// 1. FACE //////////

/* The whole character in one object. Everything is in viewBox units on a 100 wide box centred at
   0, so changing his proportions is changing numbers here and nothing else moves. */
const FACE = {
  r: 46,            // the body
  eyeX: 15.5,       // how far the eyes sit from the middle, at rest
  eyeY: -8,
  eyeR: 8.4,        // an open eye, at rest
  mouthY: 12,
  mouthW: 21,       // half width, at rest
  mouthT: 7.4,      // stroke thickness of the smile
  mouthSag: 13,     // how deep the smile bulges at full curve. The sagitta of its arc
  /* How far the ball actually turns when he looks somewhere, in radians. This is a rotation now
     and not a slide, so these are angles and the foreshortening falls out of the projection. */
  lookYaw: 0.5,
  lookPitch: 0.34,
  tiltMax: 7,       // how far he leans, in degrees, toward what he is watching
  backX: 11,        // half the span of the X on his back, which only shows while he is turned round
  backStop: 3.4,    // half the side of the square that stops a task, stroked thick enough to read as solid
}

/* Every animated value he has. Each one is a number, so any two poses can be mixed, and a gesture
   can lean on one without disturbing the rest.

   The lids are the interesting ones. An eye is not a shape that gets shorter, it is a shape with a
   shutter over it, and giving the upper and lower lid a number each is what makes a blink, a
   squint, a wink, a doubtful narrowing and a heavy sleepy eye all the same control at different
   values rather than five drawings. */
const CHANNELS = {
  lookX: 0, lookY: 0,           // -1 to 1, where he is looking. Becomes yaw and pitch
  spin: 0,                      // radians of extra yaw, on top of looking
  lidL: 0, lidR: 0,             // the upper lid. 0 open, 1 shut
  lowerL: 0, lowerR: 0,         // the lower lid, which is what makes a narrowed eye read as doubt
  eyeScaleL: 1, eyeScaleR: 1,   // wide eyed above 1
  eyeArcL: 0, eyeArcR: 0,       // 0 a round eye, 1 a happy upturned arc
  mouthCurve: 0.85,             // -1 a frown, 0 a line, 1 a full smile
  mouthWidth: 1,
  mouthOpen: 0,                 // 0 a drawn smile, 1 an open mouth
  /* Colour is three more numbers, not a special case. Each tint is how far that part has moved
     from its own base colour toward whatever colour was last named for it, so a gesture can pulse
     one, a spring can ease one, and an expression can hold one, using exactly the machinery every
     other channel already uses. */
  tintBody: 0, tintEyes: 0, tintMouth: 0,
  glow: 1,                      // multiplies the glow, so it can breathe or flash
  /* Whether he has a face at all. At zero he is a plain circle in his own colour, which is what a
     handoff needs: he can fade his face out in one place and fade it in somewhere else, and read as
     one character who moved rather than two who happen to look alike. */
  faceShow: 1,
  /* Turned round, 0 facing you and 1 showing his back. It is yaw, the same as looking, and it is
     what the launcher does while its panel is open: his face goes round behind him and the X on his
     back comes round to the front, so the button that opened the panel is plainly the one that
     closes it. The X is only there while he is turned this way, never on a playful spin. */
  about: 0,

  tilt: 0,                      // degrees
  scale: 1,
  squash: 0,                    // positive wide and short, negative tall and thin
  x: 0, y: 0,                   // where he has moved to, in viewBox units
}

// Springs, per channel. Stiff and well damped for the face so expressions land, looser for the
// body so movement carries a little weight.
const SPRINGS = {
  default: { k: 190, d: 26 },
  lookX: { k: 90, d: 17 }, lookY: { k: 90, d: 17 },
  // Fast enough that a blink actually reaches shut inside its hold. At the old stiffness the
  // lid only got two thirds of the way down before being told to reopen, which read as a twitch.
  lidL: { k: 950, d: 56 }, lidR: { k: 950, d: 56 },
  // Colour moves slower than a face does. A tint that snaps reads as a bug, one that takes half a
  // second reads as a mood arriving.
  tintBody: { k: 62, d: 16 }, tintEyes: { k: 62, d: 16 }, tintMouth: { k: 62, d: 16 },
  faceShow: { k: 150, d: 22 },
  // A little under critically damped, so the turn carries past and settles back like a body turning.
  about: { k: 120, d: 17 },
  glow: { k: 90, d: 18 },
  /* Quick enough that one viseme lands before the next one is asked for. At the default stiffness
     the shapes averaged into a single blur and he looked like he was chewing rather than talking. */
  mouthOpen: { k: 520, d: 40 }, mouthWidth: { k: 430, d: 37 }, mouthCurve: { k: 360, d: 34 },
  lowerL: { k: 300, d: 30 }, lowerR: { k: 300, d: 30 },
  scale: { k: 260, d: 22 }, squash: { k: 240, d: 19 },
  x: { k: 150, d: 20 }, y: { k: 150, d: 20 }, tilt: { k: 150, d: 20 },
}

/* What is left over when a gesture ends somewhere other than where it started. Softer and slower
   than anything else, because this is the spring somebody actually watches: it is the walk back
   from wherever a roll, or an interrupted hop, left him. */
const SETTLE = { k: 58, d: 14 }

/* Channels where a whole turn is the same as no turn at all. Without this, a spin ending on two pi
   would settle two pi back to zero, which is him solemnly unspinning everything he just did. A full
   turn wraps to nothing and a part turn settles the short way round, so he eases back to where he
   was rather than replaying the journey in reverse. */
const CYCLIC = { spin: Math.PI * 2, tilt: 360 }
const wrap = (key, value) => {
  const period = CYCLIC[key]
  if (!period) return value
  const half = period / 2
  return ((((value + half) % period) + period) % period) - half
}

////////// 2. EXPRESSIONS //////////

/* A pose is a partial set of targets. Anything it leaves out keeps whatever value it already had,
   which is what lets him look somewhere and change expression at the same time without the two
   fighting over the same channels. */
export const EXPRESSIONS = {
  happy: { lidL: 0, lidR: 0, lowerL: 0, lowerR: 0, eyeScaleL: 1, eyeScaleR: 1, eyeArcL: 0, eyeArcR: 0, mouthCurve: 0.95, mouthWidth: 1, mouthOpen: 0 },
  grin: { lidL: 0, lidR: 0, lowerL: 0, lowerR: 0, eyeArcL: 1, eyeArcR: 1, mouthCurve: 1, mouthWidth: 1.1, mouthOpen: 0.22 },
  neutral: { lidL: 0, lidR: 0, lowerL: 0, lowerR: 0, eyeScaleL: 1, eyeScaleR: 1, eyeArcL: 0, eyeArcR: 0, mouthCurve: 0.18, mouthWidth: 0.8, mouthOpen: 0 },
  wink: { lidL: 0, lidR: 1, lowerL: 0, lowerR: 0, eyeArcL: 0, eyeArcR: 0, mouthCurve: 0.95, mouthWidth: 1, mouthOpen: 0 },
  surprised: { lidL: 0, lidR: 0, lowerL: 0, lowerR: 0, eyeScaleL: 1.28, eyeScaleR: 1.28, eyeArcL: 0, eyeArcR: 0, mouthCurve: 0, mouthWidth: 0.62, mouthOpen: 1 },
  thinking: { lidL: 0.3, lidR: 0.3, lowerL: 0.16, lowerR: 0.16, eyeArcL: 0, eyeArcR: 0, mouthCurve: -0.12, mouthWidth: 0.55, mouthOpen: 0, lookX: -0.85, lookY: -0.5 },
  /* The lower lid is doing the work here. Narrowed from below reads as doubt, the same eye narrowed
     from above reads as tiredness, and that difference is the whole reason lids are two numbers. */
  suspicious: { lidL: 0.44, lidR: 0.18, lowerL: 0.32, lowerR: 0.32, eyeScaleL: 1, eyeScaleR: 1, eyeArcL: 0, eyeArcR: 0, mouthCurve: -0.25, mouthWidth: 0.52, mouthOpen: 0, lookX: -0.4 },
  sad: { lidL: 0.34, lidR: 0.34, lowerL: 0, lowerR: 0, eyeArcL: 0, eyeArcR: 0, mouthCurve: -0.8, mouthWidth: 0.8, mouthOpen: 0, lookY: 0.32 },
  // Unfocused rather than tired: lids barely down, eyes a touch wide, mouth open and uneven.
  dizzy: { lidL: 0.16, lidR: 0.2, lowerL: 0.12, lowerR: 0.08, eyeArcL: 0, eyeArcR: 0, eyeScaleL: 1.12, eyeScaleR: 1.12, mouthCurve: -0.15, mouthWidth: 0.72, mouthOpen: 0.55 },
  sleepy: { lidL: 0.76, lidR: 0.76, lowerL: 0.06, lowerR: 0.06, eyeArcL: 0, eyeArcR: 0, mouthCurve: 0.25, mouthWidth: 0.5, mouthOpen: 0.05, lookY: 0.22 },
  focused: { lidL: 0.26, lidR: 0.26, lowerL: 0.24, lowerR: 0.24, eyeArcL: 0, eyeArcR: 0, mouthCurve: 0.1, mouthWidth: 0.62, mouthOpen: 0 },
  cheeky: { lidL: 0, lidR: 0.32, lowerL: 0, lowerR: 0.26, eyeArcL: 1, eyeArcR: 0, mouthCurve: 0.8, mouthWidth: 0.9, mouthOpen: 0.12 },
}

////////// 3. GESTURES //////////

/* A gesture is a function of its own progress, 0 to 1, that writes offsets on top of whatever the
   expression is doing. Written this way rather than as keyframes because they compose: he can hop
   while blinking while looking at your cursor, and none of the three knows about the others.

   A gesture that finishes somewhere other than zero does not snap back. Whatever it was holding is
   handed to the settle springs, which walk it home. See release() below. */
/* Every oscillation below is multiplied by one of these.

   A sine starts at full speed. Written plainly, `sin(p * 2pi)` means the first frame of a gesture
   is already the fastest frame of it, so he goes from perfectly still to moving at full tilt
   between one frame and the next. That is the stop and go: not the movement, the way it is entered
   and left. Multiplying the amplitude by a curve that is zero with zero slope at each end is what
   makes him leave stillness and arrive back in it.

   rise is for a gesture that already decays to nothing on its own, where only the start jolts.
   settle is for one that would jolt at both ends. */
const sstep = (p) => p * p * (3 - 2 * p)
const rise = (p, t = 0.22) => (p < t ? sstep(p / t) : 1)
const settle = (p, a = 0.24, b = 0.28) => rise(p, a) * (p > 1 - b ? sstep((1 - p) / b) : 1)

const G = {
  /* Breathing is deliberately NOT here. It is the one movement that never stops, so running it
     through the frame loop would mean the loop never stops either, and a page of characters would
     burn 60fps forever to move a ball two pixels. It is a CSS animation instead, which the browser
     runs without waking any JavaScript. See BREATH below. */
  bob: { ms: 2600, at: (p) => ({ y: Math.sin(p * Math.PI * 2) * 1.9 * settle(p), squash: Math.sin(p * Math.PI * 2) * 0.035 * settle(p) }) },

  hop: {
    ms: 620,
    at: (p) => {
      // Squash before the jump, stretch through it, squash on landing. The timing is what sells it.
      const lift = Math.sin(Math.min(1, p * 1.15) * Math.PI)
      const anticip = p < 0.18 ? Math.sin((p / 0.18) * Math.PI) : 0
      const land = p > 0.86 ? Math.sin(((p - 0.86) / 0.14) * Math.PI) : 0
      return { y: -lift * 15, squash: anticip * 0.3 + land * 0.34 - lift * 0.16 }
    },
  },

  // A full turn of the ball. The projection does the rest: his face crowds, foreshortens and slides
  // round the edge without a single frame of that being written here.
  spin: { ms: 950, at: (p) => ({ spin: ease(p) * Math.PI * 2 }) },
  spinBack: { ms: 950, at: (p) => ({ spin: -ease(p) * Math.PI * 2 }) },

  // Rolling travels, so he reads as a ball on a floor rather than a coin on a spindle. It ends a
  // long way from home on purpose, and the settle springs walk him back.
  roll: { ms: 1100, at: (p) => ({ x: ease(p) * 34, tilt: -ease(p) * 360, spin: ease(p) * Math.PI * 2 }) },

  shake: { ms: 520, at: (p) => ({ x: Math.sin(p * Math.PI * 6) * (1 - p) * 6.5 * rise(p, 0.14), tilt: Math.sin(p * Math.PI * 6) * (1 - p) * 5 * rise(p, 0.14) }) },
  nod: { ms: 620, at: (p) => ({ lookY: Math.sin(p * Math.PI * 4) * (1 - p) * 0.55 * rise(p, 0.18), y: Math.sin(p * Math.PI * 4) * (1 - p) * 3 * rise(p, 0.18) }) },
  wobble: { ms: 900, at: (p) => ({ tilt: Math.sin(p * Math.PI * 4) * (1 - p) * 13 * rise(p, 0.2) }) },
  pop: { ms: 420, at: (p) => ({ scale: Math.sin(p * Math.PI) * 0.16, squash: -Math.sin(p * Math.PI) * 0.12 }) },
  /* Put down. Flattens as he lands and stretches back up past round before settling, which is the
     weight of him arriving. Two sines multiplied rather than one, because the product leaves and
     returns to rest with no slope at either end, so there is no jolt to paper over. */
  land: {
    ms: 560,
    at: (p) => {
      const b = Math.sin(p * Math.PI * 2) * Math.sin(p * Math.PI)
      return { squash: b * 0.32, y: Math.max(0, b) * 2.2 }
    },
  },
  glance: { ms: 1800, at: (p) => ({ lookX: Math.sin(p * Math.PI * 2) * 0.8 * settle(p), lookY: Math.sin(p * Math.PI) * -0.25 * settle(p) }) },
  // A look over one shoulder and back, which only reads correctly because the turn is a real one.
  peek: { ms: 1500, at: (p) => ({ spin: Math.sin(p * Math.PI) * 1.2 * settle(p, 0.3, 0.3) }) },

  /* A blink is a gesture, not a special case, and that is the fix for it misbehaving. It used to
     save the lid targets, drive them shut and put them back on a timer, which broke in two ways
     nobody would guess from reading it: two blinks overlapping meant the second one saved a shut
     eye and restored him to shut, and changing expression mid blink was undone a moment later by a
     restore holding the old value.

     As an offset there is nothing to save and nothing to put back. It adds to whatever the
     expression is already doing, so a sleepy character with heavy lids blinks from where his lids
     already are, and it lands back on the pose by arithmetic rather than by memory.

     Closing is faster than opening, which is what a real blink does and what stops it reading as a
     wince.

     How far it travels is measured when it starts and carried on the gesture, because a blink is
     the eye closing, not the lid moving a fixed distance. Adding a flat amount meant a narrowed eye
     hit shut a third of the way in and sat there for the rest of the blink, and a squinting face
     that blinks every few seconds spends most of its time flickering between two nearly identical
     shut eyes. That is the spamming: not more blinks, worse ones. */
  blink: {
    ms: 260,
    at: (p, g) => {
      const k = p < 0.34 ? p / 0.34 : 1 - (p - 0.34) / 0.66
      const e = k * k * (3 - 2 * k)
      const reach = (g && g.reach) || { l: 1.02, r: 1.02 }
      const drop = (g && g.drop) || { l: 0, r: 0 }
      /* The lower lid lets go as the upper one comes down. A squint holds the bottom lid up, and
         leaving it there means the two edges meet a third of the way in and the eye is simply shut
         for the rest of the blink. Dropping it is also what a face does: you do not blink by
         closing an eye that is already half closed, you blink with the whole eye. */
      return {
        lidL: e * reach.l, lidR: e * reach.r,
        lowerL: -e * drop.l, lowerR: -e * drop.r,
      }
    },
  },

  /* THE THREE HE DOES BACK. Played when he notices what you are doing with the cursor, never on a
     timer, which is the whole point of them: they are the difference between a character who is
     animated and one who is paying attention. See PLAY below. */

  // Circled. His eyes roll the way your cursor went and his body cannot decide which way is up.
  dizzy: {
    ms: 1700,
    at: (p) => {
      const fade = 1 - p
      return {
        spin: Math.sin(p * Math.PI * 4) * 0.5 * settle(p, 0.15, 0.35),
        tilt: Math.sin(p * Math.PI * 3) * 11 * fade * rise(p, 0.12),
        // The eyes go round rather than side to side, which is the part that reads as dizzy.
        lookX: Math.cos(p * Math.PI * 6) * 0.6 * fade,
        lookY: Math.sin(p * Math.PI * 6) * 0.45 * fade,
        y: Math.sin(p * Math.PI * 2) * 2.4 * settle(p),
      }
    },
  },

  /* Waved at from above. Crouch, leap, one whole turn backwards, land heavy. The rotation is a real
     one so his face carries round and comes back, which is why this is worth doing at all. */
  backflip: {
    ms: 980,
    at: (p) => {
      const lift = Math.sin(Math.min(1, p * 1.08) * Math.PI)
      const crouch = p < 0.16 ? Math.sin((p / 0.16) * Math.PI) : 0
      const land = p > 0.88 ? Math.sin(((p - 0.88) / 0.12) * Math.PI) : 0
      return {
        y: -lift * 34 + crouch * 4,
        tilt: -ease(p) * 360,
        squash: crouch * 0.26 + land * 0.3 - lift * 0.14,
      }
    },
  },

  // Tickled. Small, fast, and it runs out of breath rather than stopping.
  giggle: {
    ms: 1100,
    at: (p) => {
      const fade = 1 - p * 0.7
      const bounce = Math.abs(Math.sin(p * Math.PI * 5))
      return {
        /* settle on all three, not rise. The fade only takes the amplitude down to a third, so at
           the end the oscillation is still travelling at full speed and being cut off there is a
           stop dead. rise fixes the entry only, which is what it is for. */
        y: -bounce * 4.6 * fade * settle(p, 0.1, 0.22),
        tilt: Math.sin(p * Math.PI * 7) * 5 * fade * settle(p, 0.1, 0.22),
        squash: bounce * 0.1 * fade * settle(p, 0.1, 0.22),
      }
    },
  },

  /* Colour is a channel like any other, so these are gestures rather than a separate system. They
     move the tint rather than naming a colour, which means the same flash reads as anger, as an
     error, or as a celebration depending only on what colour was set before it ran. */
  flash: { ms: 620, at: (p) => ({ tintBody: Math.sin(p * Math.PI), glow: Math.sin(p * Math.PI) * 1.4 }) },
  throb: { ms: 1600, at: (p) => ({ tintBody: (1 - Math.cos(p * Math.PI * 4)) / 2, glow: (1 - Math.cos(p * Math.PI * 4)) / 2 }) },
  // A slow fade up and down, for something that is working rather than something that went wrong.
  breathe: { ms: 2200, at: (p) => ({ glow: Math.sin(p * Math.PI * 2) * 0.8 }) },
}
export const GESTURES = Object.keys(G)
/* The table itself, so the easing at each end of every gesture can be measured in a test. It is
   read only data and exporting it is what lets "does this snap into motion" be a check rather than
   something somebody has to notice. */
export const gestureTable = G

const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)

/* What a trail of recent pointer points looks like, relative to him.

   Pure, and exported, so the thresholds can be tested against a path drawn in a test rather than
   by waving a mouse at a screen and hoping. trail is [{x, y, t}] in client coordinates, cx and cy
   are his centre, R is his radius.

   Only the run of points since the cursor was last well away from him is judged. Crossing the
   screen to reach him is not play, and every test below is a share of the points, so an approach
   left in the trail quietly spoiled all of them.

   The three are told apart by shape rather than by speed, which is what stops a fast movement
   being read as the wrong one:

     dizzy    the angle around him keeps winding the same way, at a roughly steady distance
     tickled  the horizontal direction keeps reversing, close in, over a short distance
     flip     the vertical direction keeps reversing, inside his column, over a long one

   Order matters. Circling is the most specific, so it is asked first, and tickling is asked before
   flipping because a small fast scrub close in also reverses vertically. */
export const readPlay = (whole, cx, cy, R) => {
  if (!whole || whole.length < 8) return null

  /* Only the part spent near him counts. Crossing the screen to reach him is not play, and while
     it was still in the trail it was in every fraction below: near and column are shares of the
     points, so a long approach pushed both under their thresholds and the shape he was actually
     being shown never read as anything. Walk back from now to the last time the cursor was well
     away from him, and judge what has happened since. */
  let from = 0
  for (let i = whole.length - 1; i >= 0; i--) {
    if (Math.hypot(whole[i].x - cx, whole[i].y - cy) > R * 5) { from = i + 1; break }
  }
  const trail = from ? whole.slice(from) : whole
  if (trail.length < 8) return null

  let wind = 0, prevAng = null
  let flipX = 0, flipY = 0, lastVX = 0, lastVY = 0
  let near = 0, column = 0, onTop = 0, wide = 0
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

  for (let i = 0; i < trail.length; i++) {
    const dx = trail[i].x - cx
    const dy = trail[i].y - cy
    const r = Math.hypot(dx, dy) / R
    if (r < 1.6) near++
    if (Math.abs(dx) < R * 1.4) column++
    if (r < 0.5) onTop++
    if (r > 4.5) wide++
    if (trail[i].x < minX) minX = trail[i].x
    if (trail[i].x > maxX) maxX = trail[i].x
    if (trail[i].y < minY) minY = trail[i].y
    if (trail[i].y > maxY) maxY = trail[i].y

    // How far round him the cursor has wound, unwrapped so a lap does not read as a jump back.
    const ang = Math.atan2(dy, dx)
    if (prevAng !== null) {
      let d = ang - prevAng
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      wind += d
    }
    prevAng = ang

    if (i > 0) {
      const vx = trail[i].x - trail[i - 1].x
      const vy = trail[i].y - trail[i - 1].y
      // A reversal only counts if it is a real one. Hand tremor is not a tickle.
      if (Math.abs(vx) > 2) {
        if (lastVX && Math.sign(vx) !== Math.sign(lastVX)) flipX++
        lastVX = vx
      }
      if (Math.abs(vy) > 2) {
        if (lastVY && Math.sign(vy) !== Math.sign(lastVY)) flipY++
        lastVY = vy
      }
    }
  }

  const spanX = maxX - minX
  const spanY = maxY - minY
  const n = trail.length

  /* Winding is what tells circling apart from the other two, so it gates all three rather than
     only naming the first. Going round him also reverses vertically twice a turn, so a circle was
     satisfying the flip rule at about the same moment it satisfied its own, and whichever was
     asked first won. Order is not a substitute for the shapes being exclusive. */
  const circling = Math.abs(wind)
  /* Shares rather than a minimum and a maximum. Either end of the approach is one point wide, and
     one point that clipped his middle or was still on its way in used to disqualify the whole lap.
     With a window long enough for somebody to actually play in, one such point is always there.
     A circle drawn nowhere near him is thrown out by the trim above, not by this. */
  if (circling > Math.PI * 2.2 && onTop < n * 0.12 && wide < n * 0.12) return 'dizzy'
  // Both of these are movements along a line. A line does not wind.
  if (circling < Math.PI * 1.2) {
    if (flipX >= 4 && near > n * 0.65 && spanX > 8 && spanX < R * 2.2) return 'tickled'
    if (flipY >= 3 && column > n * 0.7 && spanY > R * 1.1) return 'flip'
  }
  return null
}

/* HOW MUCH OF THE PAST HE LOOKS AT, and how densely.

   Exported because the relationship between these numbers is the thing that has now broken twice,
   and it is not visible in any one of them:

     trail   how far back he looks. It has to be long enough to hold what a person actually does.
             Somebody circling a launcher takes a second or more per lap, so a window under that
             could only ever be satisfied by somebody moving unusually fast
     sample  how often a point is kept. Mice report anywhere from 125Hz to 1000Hz, and without
             this the trail was eight times denser on one desk than another, which is why the same
             movement read differently on different hardware
     points  a safety bound, and it must never be the thing that decides the window. points times
             sample has to cover trail, or the cap silently shortens how far back he can see. That
             is what happened twice: first at 40 points, then at 200
     cool    long enough that one continuous circle plays once rather than on every frame of itself
     rectFor how long his measured rectangle is reused, so a thousand pointer events in a second do
             not become a thousand layout reads */
export const PLAY = { trail: 2000, sample: 12, points: 400, cool: 2800, rectFor: 400 }

/* Where the lid line sits and how strongly it shows.

   Pure and exported because both of its rules were wrong and neither is visible in a diff. The
   line has to travel the same way the lid it belongs to is travelling, and it has to fade against
   the happy arc rather than being switched on by a threshold in the middle of it. */
export const lidLine = (rEye, lid, arc) => {
  const shutting = Math.max(0, (lid - 0.72) / 0.28)
  return {
    y: -rEye * 0.34 * (1 - shutting),
    opacity: Math.min(1, shutting) * Math.max(0, Math.min(1, (0.62 - arc) / 0.24)),
  }
}

////////// 4. MOODS //////////

/* What he does when nobody has asked him to do anything. A mood is an expression to rest in, how
   often he blinks, and what he does with the time in between. This is the difference between a
   character and a picture. */
export const MOODS = {
  calm: { expression: 'happy', breath: 1, blink: [2600, 6500], wander: [7000, 15000], wanderWith: ['glance', 'wobble'] },
  alert: { expression: 'neutral', breath: 1.25, blink: [1800, 4200], wander: [4000, 9000], wanderWith: ['glance', 'nod', 'pop'] },
  happy: { expression: 'grin', breath: 1.4, blink: [2200, 5200], wander: [3500, 8000], wanderWith: ['hop', 'wobble', 'spin'] },
  working: { expression: 'focused', breath: 0.9, blink: [2200, 5000], wander: [5000, 11000], wanderWith: ['glance', 'peek'] },
  sleepy: { expression: 'sleepy', breath: 0.55, blink: [4200, 9000], wander: [12000, 22000], wanderWith: ['wobble'] },
  still: { expression: 'neutral', breath: 0, blink: [3000, 7000], wander: null },
}

////////// 5. REACTIONS //////////

/* The product's events in his language. Calling react('sent') rather than express('grin') plus
   gesture('hop') means the personality lives in one table, and changing how he greets somebody is
   one line here instead of a hunt through the screens that greet them. */
export const REACTIONS = {
  greet: { expression: 'grin', gesture: 'hop' },
  sent: { expression: 'grin', gesture: 'hop', then: 'calm' },
  saved: { expression: 'happy', gesture: 'pop', then: 'calm' },
  thinking: { expression: 'thinking', mood: 'working' },
  answered: { expression: 'happy', gesture: 'nod', then: 'calm' },
  /* then matters most on the ones that narrow his eyes. Without it he is left squinting for the
     rest of the visit, and every blink after that is a nearly shut eye closing the last of the way,
     which reads as a twitch rather than a blink. A reaction is a moment, so it has to end. */
  doubt: { expression: 'suspicious', gesture: 'peek', then: 'calm' },
  stuck: { expression: 'sad', gesture: 'shake', then: 'alert' },
  /* The colour belongs to the reaction and not to the gesture, so one flash reads as an error here
     and as a warning on the line below, with nothing different happening in the movement. */
  error: { expression: 'surprised', tint: '#DC2626', gesture: 'flash', then: 'alert' },
  warn: { expression: 'suspicious', tint: '#F97316', gesture: 'flash', then: 'alert' },
  busy: { expression: 'focused', color: { body: '#3B82F6' }, gesture: 'breathe', mood: 'working', keepColor: true },
  no: { expression: 'neutral', gesture: 'shake' },
  yes: { expression: 'happy', gesture: 'nod' },
  celebrate: { expression: 'grin', gesture: 'spin', then: 'happy' },
  tease: { expression: 'cheeky', gesture: 'wobble' },
  // The three he plays himself, when he notices what your cursor is doing.
  dizzy: { expression: 'dizzy', gesture: 'dizzy', then: 'calm' },
  flip: { expression: 'surprised', gesture: 'backflip', then: 'happy' },
  tickled: { expression: 'grin', gesture: 'giggle', then: 'happy' },
  idle: { expression: 'sleepy', mood: 'sleepy' },
  wake: { expression: 'surprised', gesture: 'pop', then: 'calm' },
  // Picked up and put down. Whoa as he leaves the ground, a thump and a smile when he is set down.
  grabbed: { expression: 'surprised', gesture: 'pop' },
  dropped: { expression: 'happy', gesture: 'land', then: 'calm' },
}

////////// 6. THE SPHERE, AND THE MOUTH //////////

/* Where a point painted on his face ends up once the ball has turned.

   His face at rest is already an orthographic view of a sphere, so a feature at (px, py) is the
   surface point (px/r, py/r, z) with z making it a unit vector. Turn that vector by yaw and pitch,
   throw away the depth, and that is the whole of it.

   z comes back too, because it is two things at once: whether the point is still facing us, and
   how much a small shape sitting on the surface there is foreshortened. */
const project = (px, py, yaw, pitch) => {
  const R = FACE.r
  const x0 = px / R
  const y0 = py / R
  const z0 = Math.sqrt(Math.max(0.0001, 1 - x0 * x0 - y0 * y0))

  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const x1 = x0 * cy + z0 * sy
  const z1 = z0 * cy - x0 * sy

  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const y2 = y0 * cp - z1 * sp
  const z2 = z1 * cp + y0 * sp

  return { x: x1 * R, y: y2 * R, z: z2 }
}

/* A shape sitting on the surface is squashed toward the edge, and only in the direction it is
   leaning away. Rotate into that direction, scale by the depth, rotate back. This is what makes an
   eye out on his cheek read as being on a ball rather than as a smaller ellipse. */
const surfaceTransform = (p) => {
  const a = (Math.atan2(p.y, p.x) * 180) / Math.PI
  return `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${a.toFixed(1)}) scale(${Math.max(0.02, p.z).toFixed(3)} 1) rotate(${(-a).toFixed(1)})`
}

/* The mouth, as part of a circle. A quadratic bezier is a parabola and it shows: the ends flare
   outward where a real smile holds one constant curve. This walks the actual arc.

   w is half the chord and sag is how deep it bulges. The circle through those two endpoints has
   radius (w squared plus sag squared) over twice the sag, which is the sagitta formula, and the
   rest is walking from one end of that circle to the other. */
const mouthArc = (w, sag, my, steps, thickness) => {
  const outer = []
  const inner = []
  const s = Math.abs(sag)
  const flip = sag >= 0 ? 1 : -1
  const flat = s < 0.4
  const r = flat ? 0 : (w * w + s * s) / (2 * s)
  const yc = flat ? 0 : -(r - s)            // the circle's centre, relative to the chord
  const from = flat ? 0 : Math.atan2(-yc, -w)
  const to = flat ? 0 : Math.atan2(-yc, w)

  for (let i = 0; i <= steps; i++) {
    const f = i / steps
    const half = thickness(f * 2 - 1) / 2
    let px, py, nx, ny
    if (flat) {
      px = -w + 2 * w * f
      py = 0
      nx = 0
      ny = 1
    } else {
      const th = from + (to - from) * f
      px = r * Math.cos(th)
      py = yc + r * Math.sin(th)
      nx = Math.cos(th)                     // straight out from the circle's centre
      ny = Math.sin(th)
    }
    outer.push([px + nx * half, my + flip * (py + ny * half)])
    inner.push([px - nx * half, my + flip * (py - ny * half)])
  }
  return { outer, inner }
}

// A smooth run through a list of points: a quadratic through each midpoint, which is plenty for a
// curve this dense and costs one number per point. `move` starts a new subpath, otherwise it joins
// whatever came before, which is how the two sides of the mouth close into one shape.
const smooth = (pts, move = true) => {
  if (pts.length < 2) return ''
  let d = move ? `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}` : ` L ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    d += ` Q ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`
  }
  const end = pts[pts.length - 1]
  return `${d} L ${end[0].toFixed(2)} ${end[1].toFixed(2)}`
}

/* How thick the mouth is along its length. Closed, it is the stroke width from corner to corner,
   which draws the smile. Opening it swells the middle and leaves the corners alone, so it becomes
   one shape that opens rather than a line with a second blob floating above it. */
const mouthThickness = (openness) => (t) => FACE.mouthT + openness * 17 * (1 - t * t)

////////// COLOUR //////////

/* Turning any CSS colour into three numbers, by asking the browser. This is what makes a tint
   animatable: a keyword, a hex, a custom property and currentColor all come back as rgb, and rgb
   is something a spring can walk through.

   Resolved against the element he lives in, so a CSS variable or currentColor picks up whatever is
   in scope there rather than whatever is in scope at the document root. */
const rgbOf = (value, within) => {
  if (!value || value === 'transparent' || value === 'none') return null
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden'
  probe.style.color = value
  within.appendChild(probe)
  const read = getComputedStyle(probe).color
  probe.remove()
  const n = read.match(/[\d.]+/g)
  return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : null
}

// Straight line through rgb. Not the most perceptually even path between two colours, and the one
// nobody is surprised by, which matters more for something a person is going to art direct.
const mixRgb = (a, b, t) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)} ${Math.round(a[1] + (b[1] - a[1]) * t)} ${Math.round(a[2] + (b[2] - a[2]) * t)})`

////////// SPEECH //////////

/* Mouth shapes for speech. Opening and closing on a hinge is what a placeholder looks like: a
   mouth that only gets taller says the same thing for every sound in the language. These are the
   classic animation visemes, the small set of shapes that actually read as distinct, cut down to
   the three numbers his mouth has.

   width is what does most of the work and is the thing a vertical stretch cannot do. An "oo" is
   narrow and round, an "ee" is wide and flat, and those two look nothing alike even at the same
   height. curve keeps a little of his smile in it so talking does not wipe his expression off.

   pause is extra milliseconds after that character, which is what gives a sentence its rhythm. */
const VISEMES = {
  rest: { open: 0, width: 0.88, curve: 0.5, pause: 0 },
  // Lips together. Holding it a beat longer is what makes a closure read as a closure.
  MBP: { open: 0, width: 0.76, curve: 0.12, pause: 34 },
  FV: { open: 0.16, width: 0.72, curve: 0.16, pause: 12 },
  TH: { open: 0.32, width: 0.8, curve: 0.2, pause: 10 },
  L: { open: 0.38, width: 0.86, curve: 0.28, pause: 0 },
  // Rounded and pushed forward: oo, w, q, and the short u.
  WQ: { open: 0.34, width: 0.42, curve: 0.1, pause: 0 },
  OH: { open: 0.66, width: 0.54, curve: 0.14, pause: 4 },
  EE: { open: 0.38, width: 1.16, curve: 0.42, pause: 0 },
  AH: { open: 0.82, width: 0.96, curve: 0.22, pause: 6 },
  EH: { open: 0.52, width: 1.04, curve: 0.32, pause: 0 },
  // The everyday consonants. Barely open, fairly wide, and they pass quickly.
  SDT: { open: 0.2, width: 0.94, curve: 0.26, pause: 0 },
  // ch, sh, j: pursed and narrow.
  CH: { open: 0.28, width: 0.62, curve: 0.1, pause: 8 },
  space: { open: 0.05, width: 0.88, curve: 0.42, pause: 26 },
  comma: { open: 0.04, width: 0.86, curve: 0.45, pause: 140 },
  stop: { open: 0, width: 0.86, curve: 0.5, pause: 280 },
}

const SINGLE = {
  a: 'AH', e: 'EH', i: 'EE', o: 'OH', u: 'WQ', y: 'EE',
  m: 'MBP', b: 'MBP', p: 'MBP',
  f: 'FV', v: 'FV',
  w: 'WQ', q: 'WQ',
  l: 'L', r: 'L',
  j: 'CH',
}

/* Which shape a character takes, given the ones either side of it. The neighbours matter because
   English spells single sounds with two letters: "th", "sh", "ch", "oo" and "ee" are each one shape
   held across both letters, and without the lookahead his mouth would flap twice through a sound a
   person makes once. Every character is still emitted, only the shape is shared. */
const visemeFor = (prev, chr, next) => {
  const c = String(chr).toLowerCase()
  const ahead = c + String(next || '').toLowerCase()
  const behind = String(prev || '').toLowerCase() + c

  if (ahead === 'th' || behind === 'th') return VISEMES.TH
  if (ahead === 'ch' || behind === 'ch' || ahead === 'sh' || behind === 'sh') return VISEMES.CH
  if (ahead === 'oo' || behind === 'oo' || ahead === 'ou' || behind === 'ou') return VISEMES.WQ
  if (ahead === 'ee' || behind === 'ee' || ahead === 'ea' || behind === 'ea') return VISEMES.EE

  if ('.!?'.includes(c)) return VISEMES.stop
  if (',;:'.includes(c)) return VISEMES.comma
  if (c === ' ' || c === '\n' || c === '\t') return VISEMES.space
  if (SINGLE[c]) return VISEMES[SINGLE[c]]
  if (/[a-z0-9]/.test(c)) return VISEMES.SDT
  return VISEMES.rest
}

////////// BREATHING AND SHEEN //////////

/* One stylesheet for every character ever created on the page. Breathing is the only movement that
   runs the whole time he is on screen, so it is the one that must not cost a frame: CSS animates it
   without waking JavaScript at all, which is what lets the loop stop when he is standing there.

   Each character gets a random delay, so a row of them breathes like a crowd rather than a chorus
   line, and that costs nothing at all. */
const BREATH = `
@keyframes onsay-breathe {
  0%, 100% { transform: translateY(0) scaleY(1); }
  50%      { transform: translateY(-1.6px) scaleY(1.018); }
}
@keyframes onsay-pearl { to { transform: rotate(360deg); } }
.onsay .os-breathe { transform-box: fill-box; transform-origin: center; will-change: transform; }
.onsay[data-breath] .os-breathe { animation: onsay-breathe var(--onsay-breath, 3.4s) ease-in-out infinite; }
.onsay .os-pearl { transform-box: fill-box; transform-origin: center; }
.onsay[data-pearl="drift"] .os-pearl { animation: onsay-pearl var(--onsay-pearl, 14s) linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .onsay .os-breathe, .onsay .os-pearl { animation: none !important; }
}
`
let styled = false
const injectStyle = () => {
  if (styled || typeof document === 'undefined') return
  styled = true
  const tag = document.createElement('style')
  tag.id = 'onsay-character'
  tag.textContent = BREATH
  document.head.appendChild(tag)
}

////////// 7. ONE CHANNEL, AND THE LOOP //////////

/* A spring rather than a tween, because a tween needs to know how long it has and a spring does
   not. Retargeting mid flight just works, which is what makes him feel responsive when somebody
   moves the cursor across him. */
class Spring {
  constructor(value, cfg) {
    this.v = value
    this.target = value
    this.vel = 0
    this.k = cfg.k
    this.d = cfg.d
  }
  step(dt) {
    // Capped so a background tab resuming does not launch him off the screen.
    const h = Math.min(dt, 0.032)
    this.vel += (-this.k * (this.v - this.target) - this.d * this.vel) * h
    this.v += this.vel * h
    return Math.abs(this.vel) > 0.0008 || Math.abs(this.v - this.target) > 0.0008
  }
  set(v) { this.v = this.target = v; this.vel = 0 }
}

/* One loop for every character on the page. It starts when the first one needs a frame and stops
   dead when none of them do, so an idle page costs nothing at all. */
const live = new Set()
let raf = 0
let last = 0

const frame = (now) => {
  const dt = last ? (now - last) / 1000 : 0.016
  last = now
  let busy = false
  for (const c of live) if (c._frame(now, dt)) busy = true
  raf = busy ? requestAnimationFrame(frame) : ((last = 0), 0)
}
const wake = () => {
  if (!raf) raf = requestAnimationFrame(frame)
}

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

let uid = 0

////////// MATERIALS //////////

/* A material is one word for the whole set of surface numbers, because nobody knows they want
   gloss 0.6 and rim 0.9. They know they want glass. The sliders stay underneath and still mean
   what they meant: picking a material writes its numbers, so there is no mode to be in and no
   argument about which one wins.

   Every material is written as only what it changes and is read back through BARE, so switching
   from glass to chrome cannot leave a stray alpha behind. Partial here, complete on the way out.

     depth  how far he shades toward his edge, which is the one that makes him a ball
     gloss  the highlight, matte through satin to wet
     sheen  iridescence, the pearl
     rim    light catching his far edge
     metal  a banded reflection, the sky over a horizon over the ground. This is the one that
            reads as metal rather than as shiny plastic, because a reflection has edges
     tint   what that reflection is made of. White is chrome, warm is gold. One colour is the
            difference between every metal, which is why there is no gradient per metal
     alpha  how solid he is
     drift  turn the iridescence slowly */
const BARE = { depth: 0, gloss: 0, sheen: 0, rim: 0, metal: 0, tint: '#ffffff', alpha: 1, drift: false }

export const SURFACE_KEYS = Object.keys(BARE)

export const MATERIALS = {
  flat: {},
  matte: { depth: 0.55, gloss: 0.12 },
  soft: { depth: 0.4, gloss: 0.32 },
  glossy: { depth: 0.5, gloss: 0.7, rim: 0.18 },
  liquid: { depth: 0.58, gloss: 1, rim: 0.34 },
  glass: { depth: 0.18, gloss: 0.62, rim: 0.92, sheen: 0.12, alpha: 0.58 },
  frosted: { depth: 0.3, gloss: 0.2, rim: 0.42, alpha: 0.8 },
  pearl: { depth: 0.42, gloss: 0.34, sheen: 0.6, rim: 0.16, drift: true },
  chrome: { depth: 0.24, gloss: 0.5, rim: 0.28, metal: 1 },
  gold: { depth: 0.3, gloss: 0.42, rim: 0.3, metal: 0.94, tint: '#ffe3a0' },
  copper: { depth: 0.32, gloss: 0.4, rim: 0.3, metal: 0.9, tint: '#ffc39a' },
  // His own colour with a metal band over it, which is what anodised aluminium actually is and
  // the only metal that still looks like the customer's brand.
  anodised: { depth: 0.5, gloss: 0.26, rim: 0.2, metal: 0.5 },
}

/* A complete surface, or null for a name we do not have. Null rather than the default, so a
   caller can tell "no material asked for" apart from "flat". */
export const materialOf = (name) => (MATERIALS[name] ? { ...BARE, ...MATERIALS[name] } : null)

////////// 8. ONE CHARACTER //////////

/* createOnsay(target, options)

   target   an element, or a CSS selector. He fills it.
   options
     size        px, or 'fill' to take the size of the element he is in. Default 96
     variant     how he is drawn. Default solid
                   solid    a filled ball with his face painted on it
                   cut      his face knocked out of the ball, so he is one colour on any background
                            and behaves like any other icon. Defaults to currentColor
                   outline  a ring with his face drawn in the same stroke, body transparent
     color       his body. Defaults to the brand accent. 'transparent' works
     face        both his eyes and his mouth in one go. Default white
     eyes        just the eyes, when they should differ from the mouth
     mouth       just the mouth
     outline     a ring around him: true for his own colour, or a colour, on any variant
     outlineWidth  default 3
     glow        true for a glow in his own colour, a colour string, or { color, size }
     shadow      true for a soft drop shadow, or { y, blur, color }
     material    the whole surface in one word: flat, matte, soft, glossy, liquid, glass, frosted,
                 pearl, chrome, gold, copper, anodised. Default soft. Any number below overrides
                 the material, so { material: 'gold', gloss: 1 } is a wet gold
     depth       0 to 1. How much he shades toward his edge. The one that makes him a ball
     gloss       0 to 1. The highlight, matte through satin to wet
     sheen       0 to 1. Iridescence. A pearl
     rim         0 to 1. Light catching his far edge
     metal       0 to 1. A banded reflection. The one that reads as metal and not as shiny plastic
     tint        what that reflection is made of. White is chrome, warm is gold
     alpha       0 to 1. How solid he is
     drift       true to have the iridescence turn slowly
     pearl       the old boolean. Still works, and equals sheen 0.55
     expression  the pose he starts in. Default happy
     mood        what he does when nothing is happening. Default calm
     watch       'cursor', an element, or false. Whether he turns to follow something
     lean        whether his whole body leans toward what he is watching. Default true
     idle        false to switch off breathing, blinking and wandering entirely
     playful     false to stop him noticing what your cursor is doing. Needs watch to be on
     onPlay      called with 'dizzy', 'flip' or 'tickled' when he notices one
     label       accessible name. Pass '' to hide him from screen readers, which is right when he
                 is decoration next to text that already says the same thing */
export function createOnsay(target, options = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  if (!el) throw new Error('createOnsay: no element to render into')

  const o = {
    size: 96,
    variant: 'solid',
    /* Note what this is NOT: it does not mention --onsay-color. paint() writes the chosen colour
       into that property, so naming it here would be a variable defined as itself, which is invalid
       and paints him solid black. It reads the brand token instead, so a page can still restyle him
       by setting --color-accent. */
    color: options.variant && options.variant !== 'solid'
      ? 'currentColor'
      : 'var(--color-accent, #5865F2)',
    face: '#ffffff',
    eyes: null,
    mouth: null,
    outline: false,
    outlineWidth: 3,
    glow: false,
    shadow: false,
    /* His surface. soft is a little roundness and a soft highlight, because he is a ball and a
       flat disc with a face on it was never what he was. material: 'flat' is the old mark.

       The material lands between the defaults and the options on purpose: a word sets the whole
       surface, and any number passed beside it still wins. */
    ...(materialOf(options.material) || materialOf('soft')),
    pearl: false,
    expression: 'happy',
    mood: 'calm',
    watch: false,
    lean: true,
    idle: true,
    playful: true,
    label: 'Onsay',
    ...options,
  }

  injectStyle()
  const id = `onsay${++uid}`
  const ch = {}
  for (const [key, value] of Object.entries(CHANNELS)) {
    ch[key] = new Spring(value, SPRINGS[key] || SPRINGS.default)
  }
  // Where a finished gesture left him, walking back to nothing. One per channel, made on demand.
  const residual = {}

  // eyes and mouth fall back to face, so the common case stays one option and the uncommon one is
  // still reachable without a second way of saying the same thing.
  o.eyes = o.eyes || o.face
  o.mouth = o.mouth || o.face

  el.innerHTML = svgFor(id, o)
  const svg = el.firstElementChild
  paint(svg, o)

  /* His colours, as numbers, so a tint has something to travel from. Resolved once against the
     element he is in, which is what lets a base of currentColor or a CSS variable still be the
     starting point of an animated shift. */
  const base = {
    body: rgbOf(o.color, el),
    eyes: rgbOf(o.eyes, el),
    mouth: rgbOf(o.mouth, el),
  }
  const toward = { body: null, eyes: null, mouth: null }   // where each tint is heading
  // A random phase, so a row of them is a crowd and not a chorus line.
  svg.querySelector('.os-breathe').style.animationDelay = `${(-Math.random() * 3.4).toFixed(2)}s`

  const $ = (cls) => svg.querySelector(`.${cls}`)
  const nodes = {
    body: $('os-body'),
    material: $('os-material'),
    face: $('os-face'),
    holdL: $('os-hold-l'), holdR: $('os-hold-r'),
    eyeL: $('os-eye-l'), eyeR: $('os-eye-r'),
    slitL: $('os-slit-l'), slitR: $('os-slit-r'),
    lidL: $('os-lid-l'), lidR: $('os-lid-r'),
    arcL: $('os-arc-l'), arcR: $('os-arc-r'),
    mouth: $('os-mouth'),
    back: $('os-back'),
  }

  const state = {
    gestures: [],
    speech: null,        // the sentence he is part way through
    era: 0,              // bumped on every reschedule, so an old timer chain knows to stop
    blinkTimer: 0,
    trail: [],        // recent pointer points, for noticing what you are doing with the cursor
    played: -1e9,     // when he last played one back, so a long circle fires once and not per frame
    back: 'x',        // what his back shows while he is turned: the X that closes, or the square that stops
    me: null,         // his rectangle, measured by where() and reused for a fraction of a second
    meAt: -1e9,
    wanderTimer: 0,
    mood: MOODS[o.mood] ? o.mood : 'calm',
    watching: null,
    point: null,
    visible: true,
    paused: false,
    reduce: reduced(),
    carried: false,   // being dragged somewhere by the page he is on, see carry()
    dead: false,
  }
  const prev = {}

  ////////// looking //////////

  ////////// what your cursor is doing //////////

  /* Three things he notices, read out of the same pointer stream that already makes him look at
     you. Nothing here polls, and nothing here measures the page: it works against the rectangle
     aim() has to fetch anyway, so noticing costs one array push per pointer event.

     They are told apart by shape rather than by speed, which is what stops one being mistaken for
     another when somebody moves quickly:

       circling him          the angle around him keeps winding the same way, at a steady distance
       up and down over him  the vertical direction keeps reversing, inside his column, big travel
       back and forth on him the horizontal direction keeps reversing, close in, small travel

     A couple of seconds of trail, a cooldown after each one, and he forgets everything when he
     plays. The cooldown is not politeness, it is what stops one long circle firing dizzy on every
     frame of itself. The numbers are in PLAY, up with readPlay, because how far back he looks is
     part of what the shapes mean and not a detail of this function. */
  /* Kept at a fixed rate rather than one point per event. A mouse decides how often it speaks, and
     letting that decide the trail meant a gaming mouse filled the cap in a fraction of the window
     and had its own past thrown away, while the shape it was drawing stayed the same. Sampling
     also makes the reversal test mean one thing everywhere: the step between two kept points is a
     real movement rather than whatever a mouse managed in one millisecond. */
  const remember = (x, y, now) => {
    const t = state.trail
    const last = t[t.length - 1]
    if (last && now - last.t < PLAY.sample) return
    t.push({ x, y, t: now })
    while (t.length && now - t[0].t > PLAY.trail) t.shift()
    if (t.length > PLAY.points) t.splice(0, t.length - PLAY.points)
  }

  /* His rectangle, measured here rather than borrowed from aim(). Noticing used to depend on the
     frame loop having run, which is backwards: the loop sleeps when he is still, and standing
     still is exactly the state he is in when somebody starts playing with him. Cached for a
     fraction of a second so a thousand pointer events do not become a thousand layout reads. */
  const where = (now) => {
    if (!state.me || now - state.meAt > PLAY.rectFor) {
      state.me = svg.getBoundingClientRect()
      state.meAt = now
    }
    return state.me
  }

  const notice = (now) => {
    // Carried, the cursor is the hand holding him, and a drag reads as circling or tickling him.
    if (!o.playful || state.carried || now - state.played < PLAY.cool) return
    const me = where(now)
    if (!me.width) return
    const played = readPlay(
      state.trail,
      me.left + me.width / 2,
      me.top + me.height / 2,
      Math.max(20, me.width / 2),
    )
    if (!played) return
    state.played = now
    state.trail.length = 0
    /* Announced as well as performed. A product might want to know he was tickled, and a test
       needs to see it happen without reading his face. */
    if (typeof o.onPlay === 'function') o.onPlay(played)
    api.react(played)
  }

  const onPointer = (e) => {
    state.point = { x: e.clientX, y: e.clientY }
    if (o.playful) {
      const now = performance.now()
      remember(e.clientX, e.clientY, now)
      notice(now)
    }
    wake()
  }
  const onLeave = () => { state.point = null; state.trail.length = 0; wake() }

  const aim = () => {
    if (!state.watching || state.carried) return
    /* An expression that states where to look wins over watching. Thinking means looking away and
       up, and it would be nonsense for him to hold eye contact while doing it. */
    if ('lookX' in expressionTargets) return
    let p = state.point
    if (state.watching !== 'cursor') {
      const r = state.watching.getBoundingClientRect()
      p = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    if (!p) {
      ch.lookX.target = 0
      ch.lookY.target = 0
      return
    }
    const me = svg.getBoundingClientRect()
    const dx = p.x - (me.left + me.width / 2)
    const dy = p.y - (me.top + me.height / 2)
    // Normalised by roughly a face width, then flattened, so somebody across the room gets the same
    // glance as somebody just outside him rather than his eyes pinning to the edge.
    const soft = (v) => Math.max(-1, Math.min(1, v / Math.max(140, me.width * 2.2)))
    ch.lookX.target = soft(dx)
    ch.lookY.target = soft(dy)
  }

  ////////// the frame //////////

  let expressionTargets = { ...(EXPRESSIONS[o.expression] || EXPRESSIONS.happy) }
  for (const [k, v] of Object.entries(expressionTargets)) ch[k]?.set(v)

  /* Sets the pose into the springs. Called when the expression changes and at no other time, so a
     blink, a wink or a gesture can borrow a channel without the pose taking it straight back. */
  const applyExpression = () => {
    for (const [k, v] of Object.entries(expressionTargets)) if (ch[k]) ch[k].target = v
  }
  applyExpression()

  /* A gesture is ending. Whatever it was still holding becomes a residual, which springs back to
     zero over the next second. Without this a roll would put him 34 units to the right and then
     teleport him home on the frame it finished, and an interrupted hop would drop him mid air. */
  const release = (g, at) => {
    const held = g.def.at(at, g)
    for (const [k, raw] of Object.entries(held)) {
      const v = wrap(k, raw)
      if (Math.abs(v) < 0.001) continue
      if (!residual[k]) residual[k] = new Spring(0, SETTLE)
      residual[k].v += v
      residual[k].target = 0
    }
  }

  const c = {
    _frame(now, dt) {
      if (state.dead || state.paused || !state.visible) return false
      let busy = false
      aim()

      const add = {}
      for (let i = state.gestures.length - 1; i >= 0; i--) {
        const g = state.gestures[i]
        const p = (now - g.start) / g.def.ms
        if (p >= 1) {
          state.gestures.splice(i, 1)
          release(g, 1)
          g.done?.()
          continue
        }
        // The gesture goes with its own progress, so one can carry a measurement it took when it
        // started. The blink is the one that needs it, and nothing else has to know.
        const at = g.def.at(p, g)
        for (const [k, v] of Object.entries(at)) add[k] = (add[k] || 0) + v
        busy = true
      }
      for (const key in residual) {
        if (residual[key].step(dt)) busy = true
        add[key] = (add[key] || 0) + residual[key].v
      }
      for (const key in ch) if (ch[key].step(dt)) busy = true

      draw(add)
      return busy
    },
  }

  ////////// drawing //////////

  const set = (node, attr, value) => {
    if (!node) return
    const key = node.__k || (node.__k = `n${++uid}`)
    const at = key + attr
    // Rounded before comparing, because a spring settling produces a new number every frame that is
    // not a new pixel. This is most of why he is cheap.
    const v = typeof value === 'number' ? Math.round(value * 100) / 100 : value
    if (prev[at] === v) return
    prev[at] = v
    node.setAttribute(attr, v)
  }

  /* Writes a colour only while it is actually shifted. At rest the original string stays on the
     element untouched, which is what keeps currentColor and CSS variables working: the moment we
     write an rgb value we have frozen whatever they would have resolved to. */
  const tinted = {}
  const paintTint = (part, prop, amount) => {
    const shifted = amount > 0.004 && base[part] && toward[part]
    const value = shifted ? mixRgb(base[part], toward[part], Math.min(1, amount)) : ''
    if (tinted[part] === value) return
    tinted[part] = value
    if (value) svg.style.setProperty(prop, value)
    else svg.style.setProperty(prop, o[part === 'body' ? 'color' : part])
  }

  const draw = (add) => {
    const v = (k) => ch[k].v + (add[k] || 0)

    paintTint('body', '--onsay-color', v('tintBody'))
    paintTint('eyes', '--onsay-eyes', v('tintEyes'))
    paintTint('mouth', '--onsay-mouth', v('tintMouth'))

    // The glow rides the same numbers, so tinting him red gives a red glow with nothing else asked.
    const glow = v('glow')
    if (o.glow && Math.abs(glow - (tinted.glow ?? 1)) > 0.01) {
      tinted.glow = glow
      svg.style.filter = filterFor(o, glow)
    }

    const scale = Math.max(0.05, v('scale'))
    const sq = v('squash')
    // How far he is turned round, 0 to 1. Looking and leaning fade out as he turns away from you.
    const about = Math.max(0, Math.min(1, v('about')))
    const lookX = v('lookX') * (1 - about)
    const lean = o.lean ? lookX * FACE.tiltMax : 0
    const spun = v('tilt') + lean
    set(nodes.body, 'transform',
      `translate(${v('x').toFixed(2)} ${v('y').toFixed(2)}) rotate(${spun.toFixed(2)}) ` +
      `scale(${(scale * (1 + sq * 0.5)).toFixed(3)} ${(scale * (1 - sq * 0.5)).toFixed(3)})`)

    /* THE LIGHT DOES NOT LEAN WITH HIM. His shading lives inside the body group so that it moves
       and scales with him, which is right: the highlight belongs to his surface and his surface is
       what is moving. Rotation is the one part that is not his to carry. A window is in the wall,
       so when he tips his head the reflection in him should stay where the window is, and a
       highlight that rolls with the ball reads as a sticker rather than as light.

       So it is turned back by exactly what the body turned by. Rotation and a uniform scale
       commute, which is why cancelling it here leaves the layers the right size, and under a
       squash the small shear that is left is the surface being squashed, which is also right. */
    set(nodes.material, 'transform', spun ? `rotate(${(-spun).toFixed(2)})` : '')

    /* Looking and turning are the same thing now. Both are the ball rotating.

       lookY is positive downward, matching screen coordinates, and pitch is negated because a
       positive rotation about the horizontal axis brings the top of the ball toward the viewer,
       which moves his face UP. Without the sign he looked down when the cursor went up. */
    // The turn is read from the spring unclamped, so it swings a little past and settles.
    const yaw = lookX * FACE.lookYaw + v('spin') + v('about') * Math.PI
    const pitch = -v('lookY') * (1 - about) * FACE.lookPitch

    /* The mark on his back: the X that closes the panel, or the square that stops a task he is doing.
       It sits on the far side of the ball, so it is drawn with the same projection as his face, turned
       half a revolution further round: as he turns away it comes round the edge squashed, straightens
       as it faces you, and leaves the way it came. It is only drawn while he is turned by about, so it
       is part of what the button does and not a mark he wears. */
    const behind = yaw + Math.PI
    const showBack = nodes.back && about > 0.02 && project(0, 0, behind, pitch).z > 0.05
    set(nodes.back, 'opacity', showBack ? Math.min(1, about * 1.5) : 0)
    if (showBack) {
      const stop = state.back === 'stop'
      const s = stop ? FACE.backStop : FACE.backX
      const at = (px, py) => {
        const p = project(px, py, behind, pitch)
        return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`
      }
      set(nodes.back, 'd', stop
        ? `M ${at(-s, -s)} L ${at(s, -s)} L ${at(s, s)} L ${at(-s, s)} Z`
        : `M ${at(-s, -s)} L ${at(s, s)} M ${at(s, -s)} L ${at(-s, s)}`)
    }

    // A face fading out leaves a plain circle. One number, so it springs like everything else.
    const hasFace = Math.max(0, Math.min(1, v('faceShow')))
    set(nodes.face, 'opacity', hasFace)
    if (hasFace < 0.01) return

    ////////// the eyes //////////

    for (const side of ['L', 'R']) {
      const at = project(side === 'L' ? -FACE.eyeX : FACE.eyeX, FACE.eyeY, yaw, pitch)
      const hold = side === 'L' ? nodes.holdL : nodes.holdR
      const eye = side === 'L' ? nodes.eyeL : nodes.eyeR
      const slit = side === 'L' ? nodes.slitL : nodes.slitR
      const window_ = side === 'L' ? nodes.lidL : nodes.lidR
      const arcNode = side === 'L' ? nodes.arcL : nodes.arcR

      const facing = at.z > 0.03
      set(hold, 'opacity', facing ? 1 : 0)
      if (!facing) continue
      set(hold, 'transform', surfaceTransform(at))

      const arc = Math.max(0, Math.min(1, v(`eyeArc${side}`)))
      const rEye = FACE.eyeR * Math.max(0.2, v(`eyeScale${side}`))
      const lid = Math.max(0, Math.min(1, v(`lid${side}`)))
      const lower = Math.max(0, Math.min(1, v(`lower${side}`)))

      set(eye, 'rx', rEye)
      set(eye, 'ry', rEye)
      set(eye, 'opacity', 1 - arc)

      /* The shutter. The eye stays a whole shape and the lids are a window over it, because that is
         what a blink is: the eye is covered, not shrunk. The top edge coming down and the bottom
         edge coming up are two numbers, so a wink, a squint, a heavy sleepy eye and a doubtful
         narrowing are all this one rectangle at different values. */
      const top = -rEye + lid * 2 * rEye
      const bottom = rEye - lower * 2 * rEye
      set(window_, 'x', -rEye * 1.6)
      set(window_, 'width', rEye * 3.2)
      set(window_, 'y', top)
      set(window_, 'height', Math.max(0, bottom - top))

      /* The lid line, and it only earns its place at the end of the close. A half lidded eye is
         already a flat topped shape and says everything on its own, so drawing a line across it
         there just fattens the lid into a blob. It fades in over the last quarter of the travel and
         slides to the middle as it arrives, because a shut eye reads as a line where the eye was,
         not as one down at the socket floor. At fully shut the eye is clipped away and this line is
         all that is left, which is exactly what a closed eye looks like. */
      const shutting = Math.max(0, (lid - 0.72) / 0.28)
      const line = lidLine(rEye, lid, arc)
      set(slit, 'opacity', line.opacity)
      if (shutting > 0) {
        /* The line comes DOWN into place, the same way the lid it belongs to is travelling.
           It used to be `top * (1 - shutting)`, which slid it upward to the centre while the
           shutter swept downward past it. Two edges of one eyelid moving in opposite directions
           for the last quarter of every blink is the thing that looks wrong close up, and it is
           wrong on every blink rather than occasionally. */
        const lineY = line.y
        const halfW = rEye * 0.84
        set(slit, 'd', `M ${(-halfW).toFixed(2)} ${lineY.toFixed(2)} L ${halfW.toFixed(2)} ${lineY.toFixed(2)}`)
      }

      // The happy eye: an upturned arc, drawn only when it is wanted.
      set(arcNode, 'opacity', arc)
      if (arc > 0.01) {
        const w = rEye * 1.15
        set(arcNode, 'd', `M ${-w} 2.6 Q 0 -7.4 ${w} 2.6`)
      }
    }

    ////////// the mouth //////////

    const w = FACE.mouthW * Math.max(0.15, v('mouthWidth'))
    const curve = v('mouthCurve')
    const openness = Math.max(0, Math.min(1, v('mouthOpen')))

    /* One filled shape, always. Part of a circle walked and projected point by point, so it holds
       one curve across his face and wraps correctly when he turns, with the two sides of its
       thickness closed into a single outline.

       This replaced a stroked smile plus a separate ellipse for the opening, which is where the
       second mouth line on his grin came from: the ellipse floated just above the smile instead of
       being the same mouth opening. Now the smile IS the shape, and opening it swells the middle. */
    const band = mouthArc(w, curve * FACE.mouthSag, FACE.mouthY, 16, mouthThickness(openness))
    const out = []
    const back = []
    for (let i = 0; i < band.outer.length; i++) {
      const a = project(band.outer[i][0], band.outer[i][1], yaw, pitch)
      const b = project(band.inner[i][0], band.inner[i][1], yaw, pitch)
      if (a.z > 0.03 && b.z > 0.03) {
        out.push([a.x, a.y])
        back.push([b.x, b.y])
      } else if (out.length) break         // it has gone round the side, stop drawing
    }
    const showing = out.length > 1
    set(nodes.mouth, 'opacity', showing ? 1 : 0)
    if (showing) set(nodes.mouth, 'd', `${smooth(out)}${smooth(back.reverse(), false)} Z`)
  }

  ////////// what you can tell him to do //////////

  const rand = ([lo, hi]) => lo + Math.random() * (hi - lo)

  /* Blinking and fidgeting run on timers rather than inside the frame loop, and this is the whole
     reason the loop is allowed to stop. Checking a clock every frame means running every frame to
     check the clock, which is the trap: he would breathe for free and then burn 60fps forever
     asking himself whether it was time to blink yet. */
  const schedule = () => {
    clearTimeout(state.blinkTimer)
    clearTimeout(state.wanderTimer)
    /* Every reschedule invalidates the last one. clearTimeout alone is not enough: mood() calls
       this, react() calls mood() twice, and a chain that had already fired and queued its next tick
       would carry on beside the new one. Two chains is two blinks at once, which is what the
       spamming was. */
    const mine = ++state.era
    if (state.dead || !o.idle || state.reduce) return
    const mood = MOODS[state.mood]

    if (mood.blink) {
      state.blinkTimer = setTimeout(function tick() {
        if (state.dead || mine !== state.era) return
        // Not on top of a blink already in flight, and not while a wink is deliberately holding an
        // eye shut. Being sleepy is no longer a reason not to blink: heavy lids still blink.
        const winking = ch.lidL.target > 0.95 || ch.lidR.target > 0.95
        if (!state.paused && state.visible && !winking) blink()
        state.blinkTimer = setTimeout(tick, rand(mood.blink))
      }, rand(mood.blink))
    }

    if (mood.wander) {
      state.wanderTimer = setTimeout(function tick() {
        if (state.dead || mine !== state.era) return
        if (!state.paused && state.visible && !state.gestures.length) {
          play(mood.wanderWith[(Math.random() * mood.wanderWith.length) | 0])
        }
        state.wanderTimer = setTimeout(tick, rand(mood.wander))
      }, rand(mood.wander))
    }
  }

  // Is one of these already running. Blinking on top of a blink is the thing that used to jam his
  // eyes shut, and it is also just wasted work.
  const playing = (name) => state.gestures.some((g) => g.def === G[name])

  const blink = () => {
    if (playing('blink')) return Promise.resolve()
    /* What is left to close, per eye, measured now. A little past shut so it definitely arrives,
       and never below nothing, so an eye already held shut by a wink stays where it is instead of
       being pushed further. */
    const left = (target) => Math.max(0, 1.02 - target)
    return play('blink', null, {
      reach: { l: left(ch.lidL.target), r: left(ch.lidR.target) },
      drop: { l: ch.lowerL.target, r: ch.lowerR.target },
    })
  }

  /* He says something. Nothing is played out loud: the point is the timing. Characters arrive one
     at a time, his mouth moves on each one, and the caller gets each character as it lands, which
     is what lets a typing effect on screen be genuinely in sync with his face rather than two
     animations that happen to run for about the same length.

     onText(soFar, chr, index) fires per character. The returned handle settles when he finishes,
     carries a cancel(), and is async iterable, so all three of these work:

       await onsay.speak('Nearly there', { onText: setLine })
       for await (const soFar of onsay.speak('Nearly there')) setLine(soFar)
       const said = onsay.speak('...'); said.cancel() */
  const speak = (text, opts = {}) => {
    const chars = [...String(text ?? '')]
    const step = 1000 / (opts.cps || 34)          // characters a second
    let stop = null
    let cancelled = false
    const queue = []
    let waiting = null

    if (state.speech) state.speech.cancel()

    // Back to whatever the expression wanted, rather than to a hardcoded shut mouth.
    const rest = () => {
      ch.mouthOpen.target = expressionTargets.mouthOpen ?? 0
      ch.mouthWidth.target = expressionTargets.mouthWidth ?? 1
      ch.mouthCurve.target = expressionTargets.mouthCurve ?? 0.85
      wake()
    }

    const done = new Promise((resolve) => {
      let i = 0
      const tick = () => {
        // A plain variable rather than a field on the handle, because the first tick runs while the
        // promise is still being constructed and the handle does not exist yet.
        if (state.dead || cancelled) return
        if (i >= chars.length) {
          rest()
          state.speech = null
          if (waiting) { const w = waiting; waiting = null; w({ value: undefined, done: true }) }
          resolve(chars.join(''))
          return
        }
        const chr = chars[i]
        const shape = visemeFor(chars[i - 1], chr, chars[i + 1])

        /* Three channels, not one. A little variation on the opening so his mouth is not a
           metronome, and the resting curve is blended back in so a character who is smiling still
           looks like he is smiling while he talks rather than losing his face for a sentence. */
        const restCurve = expressionTargets.mouthCurve ?? 0.85
        ch.mouthOpen.target = shape.open * (0.85 + Math.random() * 0.3)
        ch.mouthWidth.target = shape.width
        ch.mouthCurve.target = restCurve * 0.4 + shape.curve * 0.6
        wake()
        i += 1
        const soFar = chars.slice(0, i).join('')
        opts.onText?.(soFar, chr, i - 1)
        if (waiting) { const w = waiting; waiting = null; w({ value: soFar, done: false }) }
        else queue.push(soFar)
        stop = setTimeout(tick, step + shape.pause)
      }
      tick()
    })

    const handle = {
      get cancelled() { return cancelled },
      then: done.then.bind(done),
      catch: done.catch.bind(done),
      finally: done.finally.bind(done),
      cancel() {
        cancelled = true
        clearTimeout(stop)
        if (state.speech === handle) state.speech = null
        rest()
        if (waiting) { const w = waiting; waiting = null; w({ value: undefined, done: true }) }
      },
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            queue.length
              ? Promise.resolve({ value: queue.shift(), done: false })
              : cancelled || state.speech !== handle
                ? Promise.resolve({ value: undefined, done: true })
                : new Promise((r) => { waiting = r }),
        }
      },
    }
    state.speech = handle
    return handle
  }

  // extra is anything the gesture wants to remember from the moment it started, read back in its
  // own at(). Only the blink uses it, and only to know how far the eye has left to close.
  function play(name, done, extra) {
    const def = G[name]
    if (!def) return Promise.resolve()
    if (state.reduce) {
      // Reduced motion still gets the end of the story, just not the journey.
      done?.()
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      state.gestures.push({ def, start: performance.now(), ...extra, done: () => { done?.(); resolve() } })
      wake()
    })
  }

  const api = {
    /* Change his face. Anything the pose does not mention keeps its current value, so
       express('wink') while he is looking at your cursor leaves him looking at your cursor. */
    express(name) {
      const pose = EXPRESSIONS[name]
      if (!pose) return api
      expressionTargets = { ...pose }
      applyExpression()
      wake()
      return api
    },

    // A one off movement. Returns a promise that settles when it finishes.
    gesture(name) { return play(name) },

    /* An event in the product's words. This is the one to reach for: it keeps his personality in
       one table rather than spread across the screens that use him. */
    react(event) {
      const r = REACTIONS[event]
      if (!r) return Promise.resolve()
      if (r.expression) api.express(r.expression)
      // tint names a colour for a gesture to pulse. color wears it until something takes it off.
      if (r.tint) api.color({ body: r.tint }, { hold: false })
      if (r.color) api.color(r.color)
      if (r.mood) api.mood(r.mood)
      const done = r.gesture ? play(r.gesture) : Promise.resolve()
      return done.then(() => {
        if (r.then) api.mood(r.then)
        // A reaction that wore a colour gives it back, unless it asked to keep it.
        if (r.color && !r.keepColor) api.color({ body: null, eyes: null, mouth: null })
      })
    },

    // What he does with himself when nothing is happening.
    mood(name) {
      if (!MOODS[name]) return api
      state.mood = name
      api.express(MOODS[name].expression)
      schedule()
      // Handing the breath rate to CSS rather than to the frame loop. A slower mood breathes slower.
      const breath = o.idle ? MOODS[name].breath : 0
      if (breath > 0) {
        svg.setAttribute('data-breath', '')
        svg.style.setProperty('--onsay-breath', `${(3.4 / breath).toFixed(2)}s`)
      } else svg.removeAttribute('data-breath')
      return api
    },

    /* Turn to follow something. 'cursor' is the obvious one, an element makes him look at a button
       you would like somebody to press, and false makes him face front again. */
    watch(what) {
      if (state.watching === 'cursor' && what !== 'cursor') {
        window.removeEventListener('pointermove', onPointer)
        window.removeEventListener('pointerleave', onLeave)
      }
      state.watching = what || null
      if (what === 'cursor') {
        window.addEventListener('pointermove', onPointer, { passive: true })
        window.addEventListener('pointerleave', onLeave, { passive: true })
      }
      if (!what) {
        ch.lookX.target = 0
        ch.lookY.target = 0
      }
      wake()
      return api
    },

    // Turn toward a point in the window, once.
    look(x, y) {
      state.watching = null
      state.point = { x, y }
      const me = svg.getBoundingClientRect()
      const soft = (v) => Math.max(-1, Math.min(1, v / Math.max(140, me.width * 2.2)))
      ch.lookX.target = soft(x - (me.left + me.width / 2))
      ch.lookY.target = soft(y - (me.top + me.height / 2))
      wake()
      return api
    },

    blink,
    speak,

    /* Show or hide his face, leaving the circle. This is what lets him hand himself over: the one
       on the button loses his face as the one in the panel gains his, and it reads as him moving
       rather than as two of him. */
    face(show = true) {
      ch.faceShow.target = show ? 1 : 0
      wake()
      return api
    },

    /* Turn round, or back. The launcher turns while its panel is open, so his back, with an X on it,
       is the thing to press to close it again, and turning back is him looking at you again. While he
       does a task for somebody he turns with mark 'stop', a square where the X goes, which stops him.
       The mark only changes on the way round, so it never swaps on the way back. */
    turn(away = true, mark = 'x') {
      ch.about.target = away ? 1 : 0
      if (away) state.back = mark === 'stop' ? 'stop' : 'x'
      wake()
      return api
    },

    /* Being carried. carry({ vx, vy }) while somebody drags him, with how fast he is going in pixels
       a second, and carry(false) when he is put down. Carried, he stops following the cursor, which
       is only the hand holding him, and looks the way he is being taken and leans into it instead.
       The springs put that a beat behind the hand, which is what makes it read as weight. */
    carry(motion) {
      if (!motion) {
        state.carried = false
        state.trail.length = 0
        state.me = null
        ch.tilt.target = 0
        ch.lookX.target = 0
        ch.lookY.target = 0
        wake()
        return api
      }
      state.carried = true
      const soft = (v) => Math.max(-1, Math.min(1, v / 1200))
      ch.lookX.target = soft(motion.vx || 0)
      ch.lookY.target = soft(motion.vy || 0) * 0.6
      ch.tilt.target = soft(motion.vx || 0) * 9
      wake()
      return api
    },

    /* Shift his colours, smoothly. Every part is optional, and null puts that part back to the
       colour he was built with.

         onsay.color({ body: '#dc2626' })          angry
         onsay.color({ body: null })               back to himself
         onsay.color({ eyes: '#fde68a' })          just the eyes

       This is a target and not a jump: three springs walk him there. And because it only sets
       channels, a gesture can drive the same numbers, which is how flash and throb pulse a colour
       without either of them knowing which colour it is. */
    color(next = {}, opts = {}) {
      const keys = { body: 'tintBody', eyes: 'tintEyes', mouth: 'tintMouth' }
      for (const part of Object.keys(keys)) {
        if (!(part in next)) continue
        if (!next[part]) {
          ch[keys[part]].target = 0
          continue
        }
        toward[part] = rgbOf(next[part], el)
        // Nothing to travel between if either end is not a real colour, so land on it instead.
        base[part] = base[part] || rgbOf(o[part === 'body' ? 'color' : part], el)
        /* hold false names the colour without wearing it, which is what a flash needs: the gesture
           drives the amount, so the colour and the glow move on exactly the same curve instead of
           one springing slowly while the other pulses. */
        if (opts.hold === false) continue
        ch[keys[part]].target = toward[part] && base[part] ? 1 : 0
      }
      wake()
      return api
    },

    /* Change how he looks without rebuilding him. Colour, glow, shadow and sheen are all live.
       variant is not: which shapes exist is decided when he is built. */
    set(next = {}) {
      if (next.face) { next.eyes = next.eyes || next.face; next.mouth = next.mouth || next.face }
      Object.assign(o, next)
      // A new base colour makes every cached tint value stale, so the next frame rewrites them.
      for (const k of Object.keys(tinted)) delete tinted[k]
      for (const part of ['body', 'eyes', 'mouth']) {
        if (next[part === 'body' ? 'color' : part]) base[part] = rgbOf(o[part === 'body' ? 'color' : part], el)
      }
      paint(svg, o)
      if (next.size) {
        svg.setAttribute('width', next.size === 'fill' ? '100%' : next.size)
        svg.setAttribute('height', next.size === 'fill' ? '100%' : next.size)
      }
      return api
    },

    pause() { state.paused = true; return api },
    resume() { state.paused = false; wake(); return api },

    destroy() {
      state.dead = true
      state.speech?.cancel()
      clearTimeout(state.blinkTimer)
      clearTimeout(state.wanderTimer)
      live.delete(c)
      observer?.disconnect()
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisible)
      el.innerHTML = ''
    },

    // For anybody who wants to drive a channel directly rather than through a named pose.
    get channels() { return ch },
    get element() { return svg },
  }

  ////////// only run when he can be seen //////////

  const onVisible = () => {
    state.paused = document.hidden
    if (!document.hidden) wake()
  }
  document.addEventListener('visibilitychange', onVisible)

  let observer = null
  if (typeof IntersectionObserver === 'function') {
    observer = new IntersectionObserver(
      ([entry]) => {
        state.visible = entry.isIntersecting
        if (entry.isIntersecting) wake()
      },
      { rootMargin: '80px' }
    )
    observer.observe(el)
  }

  live.add(c)
  api.mood(state.mood)
  if (o.watch) api.watch(o.watch)
  wake()
  return api
}

////////// SKIN //////////

/* Colour, glow, shadow and sheen, all written onto the element as custom properties and one filter
   string. Kept apart from the markup so set() can change any of them later without rebuilding him,
   and so none of it costs a frame: a filter and a gradient are the compositor's problem. */
/* The filter, on its own, because the frame loop changes it and must not touch anything else.

   This used to live inside paint(), which also rewrote the three colour properties. Every frame a
   glow pulse changed, the colours were reset to their base values behind the tint's back, and the
   tint's own dirty check then decided nothing had changed and left them there. That is why a
   colour and its glow arrived at different times. */
function filterFor(o, glowScale = 1) {
  const filters = []
  if (o.glow) {
    const g = typeof o.glow === 'object' ? o.glow : {}
    /* His own colour unless told otherwise, and it reads the custom property rather than a fixed
       value, so a tint travels into the glow without anybody wiring the two together. */
    const colour = g.color || (typeof o.glow === 'string' ? o.glow : 'color-mix(in srgb, var(--onsay-color) 65%, transparent)')
    filters.push(`drop-shadow(0 0 ${((g.size || 12) * Math.max(0, glowScale)).toFixed(1)}px ${colour})`)
  }
  if (o.shadow) {
    const s = typeof o.shadow === 'object' ? o.shadow : {}
    filters.push(`drop-shadow(0 ${s.y ?? 4}px ${s.blur ?? 10}px ${s.color || 'rgb(15 17 21 / 0.28)'})`)
  }
  // Two drop shadows compose, which is how he can glow and sit on a shadow at the same time.
  return filters.join(' ')
}

// 0 to 1, and anything else becomes 0. These end up in a style property, so nothing that is not a
// number is going anywhere near the element.
const unit = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.min(1, Number(n))) : 0)

function paint(svg, o) {
  const style = svg.style
  if (o.color) style.setProperty('--onsay-color', o.color)
  if (o.eyes) style.setProperty('--onsay-eyes', o.eyes)
  if (o.mouth) style.setProperty('--onsay-mouth', o.mouth)
  style.filter = filterFor(o)

  /* HIS MATERIAL. Each number is the opacity of one painted layer, so the whole thing is a
     handful of property writes and the compositor does the rest. Nothing here runs per frame.

     Gloss drives two layers rather than one. The broad sheen rises with it, and the tight hotspot
     rises with roughly its square, so the low half of the range reads as matte to satin and the
     top of it snaps to wet. That curve is the difference between a slider that feels like a
     material and one that feels like a fade. */
  const gloss = unit(o.gloss)
  style.setProperty('--onsay-depth', unit(o.depth))
  style.setProperty('--onsay-gloss', gloss)
  style.setProperty('--onsay-spec', (gloss ** 2.2).toFixed(3))
  style.setProperty('--onsay-rim', unit(o.rim))
  style.setProperty('--onsay-metal', unit(o.metal))
  style.setProperty('--onsay-tint', o.tint || '#ffffff')
  // pearl is the old boolean. It still works, and it means the same thing it always did.
  style.setProperty('--onsay-sheen', o.sheen === undefined && o.pearl ? 0.55 : unit(o.sheen))

  // Opacity is the one that is not a layer. He is see through, face and all.
  style.opacity = o.alpha === undefined || unit(o.alpha) === 1 ? '' : unit(o.alpha)

  const drifting = o.drift || o.pearl === 'drift'
  if (drifting) svg.setAttribute('data-pearl', 'drift')
  else svg.removeAttribute('data-pearl')
}

////////// 9. THE MARKUP //////////

/* The same character as a plain string, with no script behind it. A static page can drop this in
   and get him standing there correctly, and the library can upgrade him later without a flash of
   anything different. */
export function onsayMarkup(o = {}) {
  const opts = {
    size: 96,
    color: 'var(--color-accent, #5865F2)',
    face: '#ffffff',
    label: 'Onsay',
    // The same surface a live one gets, picked the same way, so the static string is him and not
    // a flatter cousin of him.
    ...(materialOf(o.material) || materialOf('soft')),
    ...o,
  }
  opts.eyes = opts.eyes || opts.face
  opts.mouth = opts.mouth || opts.face
  return svgFor(`onsay${++uid}`, opts)
}

function svgFor(id, o) {
  const dim = o.size === 'fill' ? '100%' : o.size
  const pose = EXPRESSIONS[o.expression] || EXPRESSIONS.happy
  const w = FACE.mouthW * (pose.mouthWidth ?? 1)
  const label = o.label
    ? `role="img" aria-label="${String(o.label).replace(/"/g, '&quot;')}"`
    : 'aria-hidden="true" focusable="false"'

  /* cut is the icon: his face is knocked out of the ball with a mask, so the whole character is one
     colour and whatever is behind him shows through his eyes and mouth. outline is the same idea
     drawn as a ring. Both default to currentColor. */
  const cut = o.variant === 'cut'
  const outline = o.variant === 'outline'
  const eyes = cut ? '#000' : outline ? 'var(--onsay-color)' : 'var(--onsay-eyes, #fff)'
  const mouth = cut ? '#000' : outline ? 'var(--onsay-color)' : 'var(--onsay-mouth, #fff)'

  // The mouth at rest, as part of a circle, so the static markup matches the first drawn frame.
  const rest = mouthArc(w, (pose.mouthCurve ?? 0.9) * FACE.mouthSag, FACE.mouthY, 16, mouthThickness(pose.mouthOpen ?? 0))
  const restMouth = `${smooth(rest.outer)}${smooth(rest.inner.reverse(), false)} Z`

  /* Each eye is a group holding the eye itself behind a lid window, plus the line the lid leaves
     behind. The window is a clip rectangle that the frame loop moves, and that is the shutter. */
  const eye = (side, cx) => `
        <g class="os-hold-${side}" transform="translate(${cx} ${FACE.eyeY})">
          <g clip-path="url(#l${side}${id})">
            <ellipse class="os-eye-${side}" cx="0" cy="0" rx="${FACE.eyeR}" ry="${FACE.eyeR}" fill="${eyes}"/>
          </g>
          <path class="os-slit-${side}" opacity="0" fill="none" stroke="${eyes}" stroke-width="${(FACE.mouthT * 0.62).toFixed(2)}" stroke-linecap="butt" d=""/>
          <path class="os-arc-${side}" opacity="0" fill="none" stroke="${eyes}" stroke-width="${(FACE.mouthT * 0.8).toFixed(2)}" stroke-linecap="butt" d=""/>
        </g>`

  /* Square ends on everything. The mouth is a filled outline now rather than a stroke, so its ends
     are square because the shape says so, and the lid lines keep butt caps for the same reason: a
     rounded cap on a stroke this thick reads as a sausage. */
  const face = `<g class="os-face">${eye('l', -FACE.eyeX)}${eye('r', FACE.eyeX)}
        <path class="os-mouth" fill="${mouth}" d="${restMouth}"/></g>` +
    /* The X on his back rides with his face in every variant: inside the clip for a solid or an
       outline one, inside the mask for the icon. The frame loop draws it only while he is turned. */
    `<path class="os-back" opacity="0" fill="none" stroke-linejoin="round" stroke="${eyes}" stroke-width="${(FACE.mouthT * 0.9).toFixed(2)}" stroke-linecap="round" d=""/>`

  const lidDefs = ['l', 'r'].map((s) =>
    `<clipPath id="l${s}${id}"><rect class="os-lid-${s}" x="${-FACE.eyeR * 1.6}" y="${-FACE.eyeR}" width="${FACE.eyeR * 3.2}" height="${FACE.eyeR * 2}"/></clipPath>`
  ).join('')

  /* HIS SURFACE. The numbers a material has in any 3D tool, drawn as flat gradients stacked over
     the body. There is no lighting model and no renderer: a sphere lit from one side always looks
     the same, so the shading can be painted once and only its strength has to change.

     Every strength is a CSS variable rather than a value baked into the markup, which is what lets
     a slider in the designer move him without redrawing him. stop-opacity is a real CSS property in
     SVG, so this works without a single line of JavaScript per frame.

       depth   shades him toward his edge, which is the one that stops him reading as a flat disc
       metal   a banded reflection: bright sky, a dark horizon across his middle, bright ground.
               Plastic scatters light and metal returns it, so the difference between the two is
               that a reflection has edges, and bands are edges. Its colour is --onsay-tint, which
               is why chrome, gold and copper are one gradient and not three
       sheen   iridescence, the pearl. Soft hues raked across him
       rim     light catching his far edge, thrown back from the opposite side to the highlight
       gloss   the highlight. A broad sheen, plus a tight hotspot that only arrives high up the
               range, so the ramp from matte to wet happens without changing any geometry

     They are drawn cheapest first, and all of them are always present. A circle at zero opacity
     costs nothing to paint and means the designer can turn any of them up from nothing. */
  /* Two groups rather than one. The outer carries the mask that cuts his face out of him in the
     cut variant, and the inner is the one the frame loop turns back against his lean. Rotating the
     masked group itself would take the mask round with it and slide the knockout off his face. */
  const material = `
    <g${cut ? ` mask="url(#m${id})"` : ''}>
     <g class="os-material">
      <circle cx="0" cy="0" r="${FACE.r}" fill="url(#d${id})" style="opacity:var(--onsay-depth,0)"/>
      <circle cx="0" cy="0" r="${FACE.r}" fill="url(#t${id})" style="opacity:var(--onsay-metal,0)"/>
      <g class="os-pearl"><circle cx="0" cy="0" r="${FACE.r}" fill="url(#p${id})" style="opacity:var(--onsay-sheen,0)"/></g>
      <circle cx="0" cy="0" r="${FACE.r}" fill="url(#r${id})" style="opacity:var(--onsay-rim,0)"/>
      <circle cx="0" cy="0" r="${FACE.r}" fill="url(#h${id})" style="opacity:var(--onsay-gloss,0)"/>
      <circle cx="0" cy="0" r="${FACE.r}" fill="url(#s${id})" style="opacity:var(--onsay-spec,0)"/>
     </g>
    </g>`

  const materialDefs = `
    <radialGradient id="d${id}" cx="0.42" cy="0.36" r="0.72">
      <stop offset="34%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="t${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style="stop-color:var(--onsay-tint,#ffffff)" stop-opacity="0.96"/>
      <stop offset="17%" style="stop-color:var(--onsay-tint,#ffffff)" stop-opacity="0.62"/>
      <stop offset="30%" style="stop-color:var(--onsay-tint,#ffffff)" stop-opacity="0.1"/>
      <stop offset="38%" stop-color="#000000" stop-opacity="0.34"/>
      <stop offset="56%" stop-color="#000000" stop-opacity="0.44"/>
      <stop offset="74%" stop-color="#000000" stop-opacity="0.28"/>
      <stop offset="90%" style="stop-color:var(--onsay-tint,#ffffff)" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.34"/>
    </linearGradient>
    <linearGradient id="p${id}" x1="0.05" y1="0.1" x2="0.95" y2="0.9">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.42"/>
      <stop offset="26%" stop-color="#7dd3fc" stop-opacity="0.34"/>
      <stop offset="50%" stop-color="#f0abfc" stop-opacity="0.3"/>
      <stop offset="74%" stop-color="#fde68a" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="r${id}" cx="0.62" cy="0.72" r="0.56">
      <stop offset="62%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="94%" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="h${id}" cx="0.32" cy="0.26" r="0.5">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="s${id}" cx="0.3" cy="0.23" r="0.17">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>`

  // A ring, on any variant. On the outline variant it is the character.
  const ring = o.outline || outline
    ? `<circle cx="0" cy="0" r="${FACE.r - (outline ? o.outlineWidth / 2 : 0)}" fill="none"
              stroke="${o.outline === true || outline ? 'var(--onsay-color)' : o.outline}"
              stroke-width="${o.outlineWidth}"/>`
    : ''

  const body = cut
    ? `<circle cx="0" cy="0" r="${FACE.r}" fill="var(--onsay-color)" mask="url(#m${id})"/>${material}${ring}`
    : outline
      ? `${ring}<g clip-path="url(#c${id})">${face}</g>`
      : `<circle cx="0" cy="0" r="${FACE.r}" fill="var(--onsay-color)"/>${material}${ring}<g clip-path="url(#c${id})">${face}</g>`

  /* In cut mode the face lives inside the mask instead. Anything that slides past the edge as he
     turns simply stops masking, so the clip the other variants need is free here. */
  const defs = cut
    ? `${lidDefs}<mask id="m${id}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="100" height="100">
        <circle cx="0" cy="0" r="${FACE.r}" fill="#fff"/>${face}
      </mask>${materialDefs}`
    : `${lidDefs}<clipPath id="c${id}"><circle cx="0" cy="0" r="${FACE.r}"/></clipPath>${materialDefs}`

  /* The material, written into the markup itself. Without this the static character would render
     flat, because the variables the layers read are normally set by paint() at runtime and a page
     with no script never gets there. Now the string and the live character agree. */
  const gloss = unit(o.gloss)
  const surface = [
    /* His colours belong here too. The body fill reads var(--onsay-color), which only paint() ever
       set, so a page with no script rendered him black. The string and the live character are the
       same character now. */
    `--onsay-color:${o.color}`,
    `--onsay-eyes:${o.eyes}`,
    `--onsay-mouth:${o.mouth}`,
    `--onsay-depth:${unit(o.depth)}`,
    `--onsay-gloss:${gloss}`,
    `--onsay-spec:${(gloss ** 2.2).toFixed(3)}`,
    `--onsay-rim:${unit(o.rim)}`,
    `--onsay-metal:${unit(o.metal)}`,
    `--onsay-tint:${o.tint || '#ffffff'}`,
    `--onsay-sheen:${o.sheen === undefined && o.pearl ? 0.55 : unit(o.sheen)}`,
    o.alpha === undefined || unit(o.alpha) === 1 ? '' : `opacity:${unit(o.alpha)}`,
  ].filter(Boolean).join(';')

  return `<svg class="onsay" ${label}${o.drift || o.pearl === 'drift' ? ' data-pearl="drift"' : ''} width="${dim}" height="${dim}" viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;${surface}">
  <defs>${defs}</defs>
  <g class="os-breathe">
    <g class="os-body">${body}</g>
  </g>
</svg>`
}
