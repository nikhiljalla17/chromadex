# chromadex

A fun-first named-color picker web app: explore color values, see where they live on a 2D color map, and find human-friendly names for them.

## Language

### The color itself

**Current Color**:
The single color value that the entire app displays and edits. Every view — Gamut Map cursor, Name Wheel, readouts, swatches — derives from it; every control writes to it.
_Avoid_: selected color, active color, the color

**Driver**:
An editable representation of the Current Color (hex, RGB, HSL). All Drivers are co-equal: editing any of them sets the Current Color.
_Avoid_: input, control panel, source format

**Eyedropper**:
The interaction for sampling a color from an uploaded image to set the Current Color.
_Avoid_: picker, dropper tool

### The color's location

**Gamut Map**:
The 2D shape on the left (CIE 1931 chromaticity horseshoe plus a luminance slider) that shows where the Current Color sits within all producible colors.
_Avoid_: blob, color wheel (overloaded with Name Wheel), visualization

**Cursor**:
The marker on the Gamut Map showing the Current Color's position. Draggable, and driven by the Current Color from any source.
_Avoid_: pointer, marker, dot

### Naming

**Name Wheel**:
The full-height scrolling rolodex of color Names; a live Driver — the row under its needle IS the Current Color at all times, updating as it scrolls, drags, spins, or keyboard-browses. Names radiate outward from the Current Color in both directions (a continuous gradient path through color space), with the current Name anchored at center.
_Avoid_: rolodex, roulette, list

**Name**:
A human-friendly label for a color, drawn from the bundled color-name dataset. A Name belongs to exactly one color value.
_Avoid_: title, label (when referring to color names)
