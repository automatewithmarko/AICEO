# Reddit Business Landing Page - Design System Analysis
## Source: https://www.business.reddit.com/advertise/paid-lp/cp-ads-v1
## Last Published: Fri Mar 27, 2026

---

## 1. TYPOGRAPHY

### Font Families
```css
--font-family-body:  "Reddit Sans", Arial, sans-serif;
--font-family-title: "Reddit Display", Arial, sans-serif;
```

### Font Size Scale (Design Tokens)
| Token | Desktop | Tablet/Mobile |
|-------|---------|---------------|
| `--font-size--72` | 4.5rem (72px) | 4.5rem |
| `--font-size--60` | 3.75rem (60px) | 2.75rem |
| `--font-size--56` | 3.5rem (56px) | 2.625rem |
| `--font-size--48` | 3rem (48px) | 2.5rem |
| `--font-size--42` | 2.625rem (42px) | 2.125rem |
| `--font-size--32` | 2rem (32px) | 2rem |
| `--font-size--28` | 1.75rem (28px) | 1.5rem |
| `--font-size--24` | 1.5rem (24px) | 1.5rem |
| `--font-size--20` | 1.25rem (20px) | 1.25rem |
| `--font-size--18` | 1.125rem (18px) | 1.125rem |
| `--font-size--16` | 1rem (16px) | 1rem |
| `--font-size--14` | 0.875rem (14px) | 0.875rem |
| `--font-size--12` | 0.75rem (12px) | 0.75rem |
| `--font-size--10` | 0.625rem (10px) | 0.625rem |

### Responsive Font Scaling (html element)
```css
@media (max-width: 1920px) { html { font-size: 1rem } }
@media (max-width: 1440px) { html { font-size: calc(0.198rem + 0.891vw) } }
@media (max-width: 991px)  { html { font-size: 1rem } }
@media (max-width: 390px)  { html { font-size: calc(-3.875rem + 20vw) } }
@media (max-width: 375px)  { html { font-size: calc(-0.04rem + 3.636vw) } }
@media (max-width: 320px)  { html { font-size: 0.6875rem } }
```

### Heading Styles
```css
.heading-style-h1 {
  font-family: var(--font-family-title); /* "Reddit Display" */
  font-size: 3.5rem;    /* 56px desktop, 2.625rem mobile */
  font-weight: 800;
  line-height: 1;
}
.heading-style-h1 strong { color: orangered; } /* accent on keywords */

.heading-style-h2 {
  font-family: var(--font-family-title);
  font-size: 2.625rem;  /* 42px desktop, 2.125rem mobile */
  font-weight: 800;
  line-height: 1.2;
}
.heading-style-h2 strong { color: orangered; }

.heading-style-h5 {
  font-family: var(--font-family-title);
  font-size: 1.25rem;   /* 20px */
  font-weight: 700;
  line-height: 1.2;
}
```

### Text Styles
```css
.text-eyebrow {
  color: orangered;
  font-size: 1rem;           /* 16px */
  text-transform: uppercase;
  font-weight: 700;
  line-height: 1.1;
}
.text-sh1-semi  { font-size: 1.25rem; font-weight: 600; line-height: 1.3; }
.text-sh1-bold  { font-size: 1.25rem; font-weight: 700; line-height: 1.3; }
.text-sh2-semi  { font-size: 1.125rem; font-weight: 600; line-height: 1.3; }
.text-xl-reg    { font-size: 1.25rem; /* 20px */ }
.text-l-reg     { font-size: 1.125rem; /* 18px */ }
.text-l-semi    { font-size: 1.125rem; font-weight: 600; }
.text-m-bold    { font-size: 1rem; font-weight: 700; line-height: 1.3; }
.text-xs-reg    { font-size: 0.875rem; line-height: 1.3; }
.text-xs-semi   { font-size: 0.875rem; font-weight: 600; line-height: 1.1; }
.text-cta-s     { font-size: 1.125rem; font-weight: 700; line-height: 1.4; }
```

---

## 2. COLOR PALETTE

### Brand Colors
```css
--orange:             orangered;        /* Primary brand - CTA, accents */
--orange-dark:        #d82300;
--orange-light:       #ff8864;
--orange-100:         #ffdad7;          /* Light orange tint */

--yellow-highlight:   #ffbf0b;
--banana-yellow-200:  #ffde55;

--green-highlight:    #00e2b7;          /* Teal/mint green */
--lime-highlight:     #aeef0f;          /* Bright lime */
--limegreen-300:      #aeef0f;
--limegreen-500:      #427500;
--limegreen-100:      #f0ffb3;

--pink-dark:          #d3168b;
--pink-300:           #ff5fc2;
--pink-100:           #ffe6f9;
--pink-500:           #a20065;
```

### Neutral Colors
```css
--black:              #000;
--white:              #fff;
--grey:               #f6f9fb;          /* Lightest grey background */
--grey-100:           #f6f9fb;          /* Same as grey */
--grey-150:           #e7eef4;          /* Light grey, used for tags/badges */
--grey-250:           #c0d2e2;
--grey-300:           #c6c9ca;          /* Border/stroke color */
--grey-400:           #949798;
--grey-450:           #828687;          /* Tertiary text */
--grey-550:           #355674;          /* Dark blue-grey */

/* Neutral scale */
--neutral-lightest:   #eee;
--neutral-lighter:    #ccc;
--neutral-light:      #aaa;
--neutral:            #666;
--neutral-dark:       #444;
--neutral-darker:     #222;
--neutral-darkest:    #111;
```

### Utility Colors
```css
--text-primary:       #000;             /* var(--black) */
--text-secondary:     #000c;           /* Black at 80% opacity (rgba) */
--text-secondary-white: #fffc;         /* White at 80% opacity */
--text-tertiary-black: #828687;         /* var(--grey-450) */
--text-white:         white;
--stroke-grey:        #c6c9ca;          /* var(--grey-300) */
```

### Additional Colors from Components
```css
#ff4500   /* Reddit orange (used in post flairs, links) */
#172e35   /* Dark teal (post subreddit wrappers) */
#f1f3f5   /* Light grey (post CTA backgrounds) */
#dfdfdf   /* Nav divider */
```

---

## 3. SPACING SYSTEM

### Global Spacing Tokens
| Token | Desktop | Mobile |
|-------|---------|--------|
| `--global--4` | 0.25rem (4px) | 0.25rem |
| `--global--8` | 0.5rem (8px) | 0.5rem |
| `--global--12` | 0.75rem (12px) | 0.75rem |
| `--global--16` | 1rem (16px) | 1rem |
| `--global--20` | 1.25rem (20px) | 1.25rem |
| `--global--24` | 1.5rem (24px) | 1rem |
| `--global--32` | 2rem (32px) | 2rem |
| `--global--40` | 2.5rem (40px) | 2.5rem |
| `--global--48` | 3rem (48px) | 3rem |
| `--global--56` | 3.5rem (56px) | 2.5rem |
| `--global--64` | 4rem (64px) | 2.75rem |
| `--global--112` | 7rem (112px) | 2.5rem |
| `--global--134` | 8.375rem (134px) | 2.5rem |

### Module Spacing
```css
--module-topbottom:       4.5rem;       /* Section padding top/bottom (3rem mobile) */
--module-margin:          4.5rem;       /* Module margins (1rem mobile) */
--module-gutter:          1.5rem;       /* Grid gutter */
--card-inner-margin-s:    1.5rem;       /* Small card padding (1rem mobile) */
--card-inner-margin-m:    2rem;         /* Medium card padding (1.5rem mobile) */
--card-inner-margin-l:    3rem;         /* Large card padding (1.5rem mobile) */
--card-inner-margin-xl:   4rem;         /* XL card padding (1.5rem mobile) */
```

### Text Spacing
```css
--text-copy-button:   2rem;   /* Gap between copy block and button */
--text-title-copy:    1.5rem; /* Gap between title and body copy (1rem mobile) */
```

### Padding Utilities
```css
.padding-global   { padding-left: 2.5rem; padding-right: 2.5rem; }
.padding-xlarge   { padding: 4rem; }    /* 3rem tablet, 2rem mobile */
.padding-xhuge    { padding: 6rem; }    /* 4rem mobile */
.padding-medium   { padding: 1.5rem; }  /* 1.25rem mobile */
```

---

## 4. CORNER RADIUS

```css
--corner-radius--xxs:  0.25rem;  /* 4px */
--corner-radius--xs:   0.5rem;   /* 8px */
--corner-radius--m:    1rem;     /* 16px */
--corner-radius--l:    1.25rem;  /* 20px, 1.125rem mobile */
--corner-radius--xxl:  3rem;     /* 48px */
--corner-radius--xxxl: 4.5rem;   /* 72px, 3rem mobile */
```

---

## 5. SHADOWS

```css
/* Light shadow (default cards) */
box-shadow: 0 5px 30px 5px #0000000f;    /* ~6% black */

/* Medium shadow (card hover) */
box-shadow: 0 5px 50px 5px #00000026;    /* ~15% black */

/* Post card shadow */
box-shadow: 0 4px 1.25rem #7a929940;     /* Tinted blue-grey */

/* Nav dropdown shadow */
box-shadow: 0 7px 16px #0000001a, 0 29px 29px #00000017, 0 65px 39px #0000000d;
/* Layered: 10%, 9%, 5% black - progressive depth effect */
```

---

## 6. BUTTONS

### Primary Button (CTA)
```css
.button {
  padding-right: 1.5rem;      /* var(--global--24) */
  padding-left: 1.5rem;
  gap: 0.5rem;                /* var(--global--8) */
  border: 2px solid orangered;
  background-color: orangered;
  color: white;
  font-size: 1.25rem;         /* 20px */
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
  border-radius: 6.25rem;     /* Fully rounded / pill shape */
  transition: all 0.3s;
  display: flex;
  justify-content: center;
  align-items: center;
}
.button:hover {
  background-color: black;
  border-color: black;
}
```

### Small Button
```css
.button.is-small {
  font-size: 1.125rem;   /* 18px */
  height: 2.625rem;      /* Fixed height */
  padding-top: 0;
  padding-bottom: 0;
}
```

### Secondary Button (Outline)
```css
.button.is-secondary {
  color: orangered;
  background-color: transparent;
  border: 2px solid orangered;
}
.button.is-secondary:hover {
  background-color: black;
  color: white;
  border-color: black; /* inferred from primary */
}
```

### White Button Variant
```css
.button[white-variant] {
  border-color: white;
  background-color: white;
  color: var(--text-primary); /* black */
}
```

### Grey Button
```css
.button.is-grey {
  background-color: #e7eef4; /* grey-150 */
  color: var(--text-primary);
  border-width: 0;
}
```

### Alternate Button (Compact)
```css
.button.is-alternate {
  padding: 0.5rem 1.5rem;
  background-color: white;
  color: black;
  border-width: 0;
}
```

---

## 7. LAYOUT / GRID PATTERNS

### Container
```css
.container-large {
  width: 100%;
  max-width: 81rem;      /* 1296px */
  margin-left: auto;
  margin-right: auto;
}
/* Narrow variant: max-width: 53.5rem (856px) */
/* Medium variant: max-width: 67.25rem (1076px) */
```

### Hero Section
```css
.hero-copy-visual-component {
  display: grid;
  grid-template-columns: 46.625rem minmax(0, 1fr);  /* ~746px text + flexible visual */
  grid-template-rows: auto;
  gap: 1.5rem;           /* module gutter */
}
/* Mobile: single column */
@media (max-width: 991px) {
  grid-template-columns: minmax(0, 1fr);
  gap: 2.5rem;
}
```

### Hero with Background Card
```css
.hero-copy-visual-component[grey-variant] {
  padding: 3rem;         /* card-inner-margin-l */
  border-radius: 1.25rem; /* corner-radius--l */
  background-color: #f6f9fb; /* grey-100 */
}
```

### 3-Column Grid
```css
._3x2-grid-24 {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto;
  gap: 1.5rem;           /* module gutter */
}
/* 4-column variant */
._3x2-grid-24._4-column {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
```

### 50/50 Split Grid
```css
._5050-standard-grid {
  display: grid;
  grid-template-columns: 39.75rem 1fr;   /* ~636px fixed + flexible */
  gap: 8.375rem;         /* global--134, large gap between columns */
  place-items: center stretch;
}
/* Reversed variant (image on right) */
._5050-standard-grid.reverse {
  grid-template-columns: 1fr 39.75rem;
}
/* Mobile: single column */
@media (max-width: 991px) {
  grid-template-columns: minmax(0, 1fr);
  gap: 2.5rem;
}
```

### 2-Column Asymmetric Grid
```css
._2col-grid-270-134 {
  gap: 8.375rem;  /* var(--global--134) */
  /* Specific column sizes set by variants */
}
```

### Features Container (Grey Card Section)
```css
.features-container {
  padding: 3rem;                /* card-inner-margin-l */
  border-radius: 1.25rem;      /* corner-radius--l */
  background-color: #f6f9fb;   /* grey */
}
```

---

## 8. CARD STYLES

### Feature Big Card
```css
.feature-big-card {
  padding: 1.5rem;                    /* card-inner-margin-s */
  border-radius: 1.25rem;            /* corner-radius--l */
  background-color: white;
}
.feature-big-card.shadow-s {
  gap: 2rem;
  flex-flow: column;
  transition: all 0.3s;
  display: flex;
  box-shadow: 0 5px 30px 5px #0000000f; /* implied default */
}
.feature-big-card.shadow-s:hover {
  box-shadow: 0 5px 50px 5px #00000026;
}
```

### Stat Line Card
```css
.stat-line-card {
  padding: 2rem;                      /* card-inner-margin-m */
  gap: 2.5rem;                        /* global--40 */
  border-left: 2px solid #c6c9ca;    /* grey-300 */
  flex-flow: column;
  justify-content: space-between;
  display: flex;
}
```

### Banner Card (Announcement)
```css
.banner-card {
  padding: 0.5rem 1.5rem;            /* global--8 + card-inner-margin-s */
  gap: 0.5rem;
  border-radius: 0.5rem;             /* corner-radius--xs */
  background-color: #00e2b7;         /* green-highlight */
  justify-content: flex-start;
  align-items: center;
  transition: all 0.3s;
  display: flex;
}
.banner-card:hover {
  background-color: black;
  color: white;
}
/* Lime variant */
.banner-card[lime] {
  background-color: #aeef0f;
}
```

---

## 9. SECTION PATTERNS

### Standard Section
```css
.section {
  z-index: 1;
  padding-top: 4.5rem;       /* module-topbottom */
  padding-bottom: 4.5rem;
  position: relative;
}
/* Mobile: 3rem top/bottom */
```

### Section with Global Padding
```css
.section.padding-global {
  padding-left: 2.5rem;
  padding-right: 2.5rem;
}
```

### Section Padding Top (Pre-section spacer)
```css
.section-padding-top {
  padding-top: 1.5rem;     /* var(--global--24) */
}
/* Variants: 0.5rem, 1rem, 3.5rem, 4.5rem */
```

### Footer Section
```css
.footer-component {
  padding-top: 4.5rem;
  padding-bottom: 1.25rem;
  background-color: black;
  color: white;
}
.footer-divider {
  background-color: white;
  opacity: 0.3;
  height: 1px;
}
.footer-link {
  transition: all 0.3s;
}
.footer-link:hover {
  color: orangered;
}
```

### Logo/Features Section
```css
.section-features-logos {
  padding-top: 4.5rem;
  padding-bottom: 4.5rem;
}
```

---

## 10. NAVBAR

```css
.navbar1_component {
  background-color: white;
  width: 100%;
  height: 5.25rem;          /* 84px */
  padding-left: 4.5rem;     /* module-margin */
  padding-right: 4.5rem;
  display: flex;
  align-items: center;
}
.navbar1_container {
  max-width: 81rem;
  gap: 2.5rem;
  justify-content: space-between;
  align-items: center;
  display: flex;
  margin: 0 auto;
  width: 100%;
}
.navbar1_logo-link { width: 9.6875rem; /* ~155px */ }
.navbar1_menu-links { gap: 2rem; display: flex; align-items: center; }
.navbar-link-toggle {
  color: black;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
  gap: 0.25rem;
  display: flex;
  align-items: center;
}
```

### Nav Dropdown
```css
.nav-dd-content {
  background-color: #f6f9fb;  /* grey-100 */
  border-radius: varies;
  /* 4-column grid variant */
  grid-template-columns: repeat(4, minmax(0, 1fr));
  box-shadow: 0 7px 16px #0000001a, 0 29px 29px #00000017, 0 65px 39px #0000000d;
}
.nav-dd-col {
  padding: 1.25rem;
  background-color: white;
}
.nav-divider { background-color: #dfdfdf; }
```

---

## 11. TRANSITIONS & ANIMATIONS

```css
/* Standard transition */
transition: all 0.3s;

/* Background color transition */
transition: background-color 0.2s;

/* Opacity transition */
transition: opacity 0.3s;

/* Color + background combination */
transition: color 0.2s, background-color 0.2s;

/* Smooth font rendering */
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

---

## 12. FLEX LAYOUT UTILITIES

```css
.flex-vert-copy-button  { gap: 2rem; flex-flow: column; }   /* title+body+button stack */
.flex-vert-title-copy   { gap: 1.5rem; flex-flow: column; } /* title+body stack */
.flex-vertical-4        { gap: 0.25rem; flex-flow: column; }
.flex-vertical-8        { gap: 0.5rem; flex-flow: column; }
.flex-vertical-16       { gap: 1rem; flex-flow: column; }
.flex-vertical-24       { gap: 1.5rem; flex-flow: column; }
.flex-vertical-32       { gap: 2rem; flex-flow: column; }
.flex-vertical-56       { gap: 3.5rem; flex-flow: column; }
.flex-horizontal-copy-button {
  gap: 2rem; flex-flow: row;
  justify-content: space-between;
  align-items: flex-end;
}
```

---

## 13. PAGE CONTENT FLOW

1. **Announcement Banner** - Lime/green background, "Get $500 in Ad Credit when you spend $500*!"
2. **Navbar** - White, logo left, menu links center, CTA button right
3. **Hero Section** - Two-column grid: H1 heading left ("Reach people ready to buy with Reddit Ads"), visual right. Body text + CTA button below heading.
4. **Logo Carousel / Features** - Partner logos in marquee
5. **Stats Section** - Grey background card with H2 "Why should you advertise on Reddit?" + 3-4 stat cards in a grid:
   - "+46%" - More likely to trust brands
   - "+27%" - More likely to purchase
   - "2.5x" - Customers spend more
   - "8x" - Brand awareness increase
6. **5050 Split Sections** (alternating):
   - "Why Reddit Ads outperform other ad platforms" + image
   - "Brand trust is higher on Reddit" + image
7. **Testimonial Quotes** - Quote cards with attribution
8. **Sources/Footnotes** - Small text, sourced data
9. **Footer** - Black background, white text, 4-column grid for links, dividers at 30% opacity

---

## 14. KEY DESIGN PATTERNS SUMMARY

- **Pill buttons** with 6.25rem border-radius, bold 700 weight, orangered primary
- **Grey card containers** (#f6f9fb) with 1.25rem border-radius for grouping content
- **White cards** with subtle shadow (0 5px 30px 5px 6% black), deepening on hover
- **Stat cards** with left border accent (2px solid grey-300)
- **Uppercase eyebrow text** in orangered above headings
- **Extra-bold headings** (800 weight) in "Reddit Display" display font
- **Black footer** with white text and orangered hover links
- **Section spacing** of 4.5rem top/bottom (3rem on mobile)
- **Container max-width** of 81rem (1296px) with 2.5rem horizontal padding
- **Transitions** are consistently 0.3s on all properties
- **Two-tone hover**: Orange/colored buttons hover to black; links hover to orangered
- **Announcement banner** in bright lime/green with hover-to-black effect
