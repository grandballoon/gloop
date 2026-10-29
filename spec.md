# Gloop

Run it with `npm start`, then open http://127.0.0.1:5530/.
Test it with `npm test`.

Gloop is a touch interface with a single fluid unit, the gloop, which can be split and combined.
It explores concepts parallel to K–12 math from one primitive: dividing and grouping a unit.
Its lineage is Robert Lawlor's *Sacred Geometry* (number as relation, the One dividing without loss) and iconic algebra (Spencer-Brown's *Laws of Form*, Bricken and Kauffman's boundary math).

## Two worlds

Gloop has two worlds, explored in parallel but never on the same screen.
Both use the same gestures, so the comparison between them is the same action producing different outcomes.

- **Finite world.** A gloop's volume is conserved, like matter. Splitting divides it equally among the pieces.
- **Infinite world.** A gloop has no volume, like information. Every infinite gloop is the same, so splitting and combining change only how many there are.

The finite world is about measuring and the infinite world is about counting.

Each world starts from a single gloop.
Everything else on screen comes from splitting and combining it.

Gloops from the two worlds never interact, so there is no mixing rule.

## State

A world's state is a set of gloops.
Each gloop has an id, a volume, and a position.
The world's kind (finite or infinite) is part of the state, not a property of each gloop.

Finite volumes are exact rationals, never floats.
Thirds and sevenths must stay exact, or equivalence (1/2 vs 2/4) and reconstruction (halves recombining to exactly 1) break.
Infinite gloops have no volume, so each records the same volume, 1, and the representation stays shared.

Positions belong to the physics shell, not the core.
The core decides what gloops exist and how big they are; the shell decides where they sit.

## Operations

There are exactly four operations.
k, g and m are whole numbers, with k ≥ 2 and g > m ≥ 1.

| Operation | Finite world | Infinite world |
|---|---|---|
| 1. Combine k gloops into one | Volume is the sum | k gloops become 1 |
| 2. Split one gloop into k | Each piece has volume v/k | 1 gloop becomes k |
| 3. Split each selected gloop into k | Each piece has its parent's volume divided by k | Each selected gloop becomes k |
| 4. Combine each group of g into m | Each group combines, then splits into m pieces of volume (group total)/m | Each group of g becomes m |

Operations 3 and 4 apply to any selection, from a subset up to every gloop.
In operation 4, every group in the selection has the same size g and becomes the same number m.
The selection is cut into as many groups of g as it holds.
The gloops that can't be grouped are the remainder: they are left as they are and marked.
With fewer than g selected, the operation is unavailable.

Every operation is a pure function from a world state to a new world state.
An unavailable operation returns a refusal value naming why, not an error.

## Invariants

The finite world has one conservation law: total volume never changes.
It should be visible, for example as a fixed total that every operation leaves alone.

The infinite world has no conserved quantity.
Its only observable structure is the count of gloops.

Puzzles can restrict which values of k are allowed.
Restricting k creates further invariants: under local operations, the count mod gcd(kᵢ − 1) never changes.

## Rendering

Every gloop relaxes into a circle.
In the finite world, area is proportional to volume, so radius is proportional to √volume.
Rendering must be honest about this: doubling a gloop's volume grows its diameter by √2, and that relationship is part of what the interface shows.
Every infinite gloop is drawn the same size.

Honest rendering makes small gloops hard to touch.
Ten halvings leave a gloop at 1/32 of its original radius.
The interface needs either zoom or touch targets larger than the drawn gloop.

No unit is drawn by default.
In the finite world, labelling a gloop "1" is an optional action, and every other label follows from it.
The unit being a choice is what the referent whole depends on.
The infinite world has no unit, since it has no volume to measure.

There is no color or shape attribute.
Each world is visually recognizable on its own, but nothing on screen distinguishes gloop kinds, since a screen only ever holds one kind.

## Concept coverage

### Finite world

- Fractions as objects, and the referent whole.
- Equivalent fractions, adding unlike fractions, and Egyptian fractions.
- Partitive division: how big is each share?
- Place value by size, with a merged ten ten times the volume of a one.
- Mean as fair share: combine everything, then split evenly.
- Unequal ratios a:b: split into a+b pieces, then combine a and b of them.
- Probability tree diagrams, as repeated splits, with rational probabilities.
- Halving series that recombine to exactly 1, and binary.
- Square-root scaling of radius and growth of total boundary under splitting, seen through circle rendering.
- No primes: every volume splits evenly.

### Infinite world

- Counting, successor and predecessor, and fenceposts (combining k removes k − 1).
- Multiplication and exponentials, of the count.
- Quotative division with remainders: 7 ÷ 2 is 3 r1, where the finite world gives 3½.
- Primes, factorization, LCM, and Collatz.
- Fractions as operators, where the reduced form works on the most counts.
- Modular invariants and Frobenius-style reachability puzzles.

### Both worlds

- Addition as combining, with commutativity and associativity.
- Local operations are additive and global operations are multiplicative.
- The distributive law, through operation 3 on a subset.
- Linear versus exponential growth.

## Deferred features

These features are not designed yet.
Each is added at the point where testing the two worlds shows a concept that needs it.

- **Contain.** Persistent membranes around groups. Needed when a grouping must survive past the operation that made it: nested expressions, order of operations, Laws of Form crossing, and James algebra.
- **Deform.** Changing a gloop's shape at constant volume. Needed for a product of two magnitudes (area as a × b), for every route to irrational quantities, for shape conservation, and for the rest of geometry.
- **Linked.** Copies that stay linked, so resizing one resizes all. This is where variables begin. It only becomes visible once an operation can resize a gloop in place, so it arrives with deform. Infinite gloops have no volume to resize, so which world linking belongs to is open.

These remain out of scope with no planned trigger:

- Zero and negatives. No operation reaches the void.
- A second attribute, such as color, for mixtures, concentration, and weighted means.
- History or age, needed for Fibonacci-style rules.
- Continuous flow, needed for rates and integration.

## Interface

The prototype is a web page for touch screens, in plain JavaScript modules with no build step.

### Touch

- Tap a gloop to select or deselect it.
- Drag across empty space to lasso a selection, and tap empty space to clear it.
- Drag one gloop onto another to combine the two.

### Buttons

The buttons act on the selection.

- **Select all** selects every gloop, which turns operations 3 and 4 global.
- **Combine** is operation 1, on everything selected.
- **Split into k** is operation 2 with one gloop selected and operation 3 with several. A stepper sets k, from 2 to 20.
- **Regroup g → m** is operation 4. Steppers set g, from 2 to 20, and m, from 1 to g − 1. The selection is grouped by nearness: the leftmost ungrouped gloop takes its g − 1 nearest ungrouped neighbours, until fewer than g remain.
- **Set unit**, in the finite world only, declares the one selected gloop's volume to be 1. Every gloop then shows its volume in that unit, and the status line shows the total. With no single gloop selected, the same button clears the unit.
- **Undo** and **Reset** act on the current world only. The two worlds keep separate state.

Whatever an operation makes becomes the new selection, so pressing Split repeatedly keeps splitting the newest pieces.

### Scale

The camera's scale depends only on the world's total volume, which in the infinite world is the count.
It is chosen so the whole world covers a fixed share of the screen, and so the whole, merged into one gloop, would always fit.

The finite world's total never changes, so its camera never moves.
That is how conservation shows: the pieces always fill the same space the first gloop did.

The infinite world's camera zooms out as the count grows, so every gloop is drawn smaller as there are more of them.

### Small gloops

Every gloop can be touched across a radius of at least 22 pixels, however small it is drawn.
Where touch areas overlap, the gloop whose centre is relatively nearest wins.
The lasso is the way to select many small gloops at once.

## Open questions

- Whether learners need zoom in the finite world, where the camera never moves and halvings get small fast.
- Whether grouping by nearness is predictable enough, or whether learners need to form groups themselves.
- Whether "Select all" should be implicit when nothing is selected.
- Whether labels should be shown as mixed numbers (3½) rather than improper fractions (7/2).
