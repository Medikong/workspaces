# Design System: DropMong

## Quick Summary

DropMong is a playful limited-drop commerce brand built around speed, scarcity, and a friendly mascot. The design should feel bright, quick, cute, and reliable: purple leads the interface, lavender softens the mood, and magenta is reserved for short-lived moments such as NEW, limited offers, alerts, and rewards.

Use this document as the source of truth when generating or editing screens in Google Stitch. Keep layouts clean and commerce-focused, with rounded components, clear product emphasis, and cheerful mascot or illustration moments used as accents rather than decoration overload.

## 1. Visual Theme & Atmosphere

The product experience should feel like a fast, joyful drop event. Interfaces should be energetic but controlled: clean white or soft-gray backgrounds, high-contrast product and timer areas, rounded buttons, light borders, and small bursts of purple or pink for attention.

Preferred atmosphere:

- Playful commerce
- Fast and time-sensitive
- Cute but trustworthy
- Bright, polished, and lightweight
- Limited-edition shopping energy

Avoid:

- Heavy dark-mode-first layouts
- Overly serious enterprise styling
- Excessive gradients across every section
- Too many competing accent colors
- Mascot usage that distracts from product discovery or checkout

## 2. Brand Color Palette

### Core Brand Colors

| Token | Hex | Role |
| --- | --- | --- |
| Drop Purple | `#6C3DF5` | Primary brand color, main CTA, active states, icon stroke, drop labels |
| Lavender | `#B69BFF` | Secondary brand color, soft surfaces, illustration depth, selected backgrounds |
| Magenta Pink | `#FF6DB6` | Accent color for NEW, rewards, urgency, delight moments |

### Supporting Neutrals

| Token | Hex | Role |
| --- | --- | --- |
| Ink | `#111827` | Main text, strong labels, high-contrast badge backgrounds |
| Slate | `#4B5563` | Secondary text, helper copy, subdued labels |
| Gray | `#E5E7EB` | Borders, dividers, disabled outlines |
| Soft Gray | `#F3F4F6` | Subtle surfaces, disabled backgrounds, page bands |
| White | `#FFFFFF` | Main background and clean component surfaces |

### Background Tints

| Token | Hex | Role |
| --- | --- | --- |
| BG Default | `#FFFFFF` | Main canvas |
| BG Sub | `#F9FAFC` | Quiet page sections and dashboard surfaces |
| Purple Tint | `#F3F0FF` | Selected states, soft purple panels, badge backgrounds |
| Pink Tint | `#FFE2F7` | NEW labels, reward highlights, benefit surfaces |

### Gradient Guidance

Use gradients sparingly for strong brand moments, not as the default background.

- Primary Gradient: `#8F5EFF` to `#5A2DF2`
- Accent Gradient: `#FF8EC7` to `#FF5BA7`

Recommended use:

- Hero CTA
- Drop countdown feature block
- Campaign card header
- Mascot-backed promotional panel

## 3. Typography Rules

Use Pretendard as the primary typeface. The type system should be simple, legible, and mobile-commerce friendly.

| Style | Font | Weight | Size / Line Height | Usage |
| --- | --- | --- | --- | --- |
| H1 | Pretendard ExtraBold | 800 | `24 / 32` | Hero title, major campaign heading |
| H2 | Pretendard Bold | 700 | `20 / 28` | Section title, product group title |
| H3 | Pretendard SemiBold | 600 | `16 / 24` | Card title, modal title, compact heading |
| Body | Pretendard Regular | 400 | `14 / 20` | Product copy, descriptions, standard UI text |
| Caption | Pretendard Medium | 500 | `12 / 16` | Labels, metadata, timer captions, badge text |

Typography direction:

- Use short, energetic headings.
- Keep product and timer information highly scannable.
- Use bold weights for decisions and actions, not long paragraphs.
- Avoid thin weights because the brand relies on soft, friendly confidence.

## 4. Component Stylings

### Buttons

Buttons should be rounded, clear, and easy to identify. The primary action should always use Drop Purple or the primary gradient.

| Variant | Background | Text | Border | Usage |
| --- | --- | --- | --- | --- |
| Primary | `#6C3DF5` or Primary Gradient | `#FFFFFF` | None | Purchase, join drop, primary checkout action |
| Secondary | `#FFFFFF` | `#6C3DF5` | `#6C3DF5` | View details, set alert, less dominant actions |
| Soft | `#F3F0FF` | `#6C3DF5` | None | Add to cart, saved state, low-pressure action |
| Disabled | `#F3F4F6` | `#4B5563` | None | Unavailable states |

Button shape:

- Height: `40px` to `48px`
- Radius: `8px`
- Label weight: Bold
- Interaction: subtle lift or brightness change on hover, no dramatic motion

### Badges & Labels

Badges should communicate drop status quickly.

| Variant | Background | Text | Usage |
| --- | --- | --- | --- |
| D-Day | `#6C3DF5` | `#FFFFFF` | Main countdown label |
| NEW | `#FFE2F7` | `#FF6DB6` | Newly opened item or benefit |
| LIMITED | `#111827` | `#FFFFFF` | Scarcity and premium limitation |
| SOLD OUT | `#E5E7EB` | `#4B5563` | Closed or unavailable drops |
| ONLY 100 | `#F3F0FF` | `#6C3DF5` | Quantity-limited offer |

Badge shape:

- Radius: `6px`
- Height: around `28px`
- Horizontal padding: `10px` to `12px`
- Text: caption size, bold or medium

### Cards & Containers

Cards should look light and approachable, with enough structure for fast comparison.

- Background: `#FFFFFF`
- Border: `1px solid #E5E7EB`
- Radius: `8px` to `12px`
- Shadow: soft and diffused only when the card needs emphasis
- Product image area: bright, clean, and inspectable
- Avoid nested card-heavy layouts

### Timer

The timer is a core DropMong pattern and should be highly visible.

- D-Day label: Drop Purple background with white text
- Time numbers: Ink text, bold and high-contrast
- Unit labels: Slate or Ink, caption size
- Container: white background, light border, `8px` radius

### Iconography

Icons should be line-based, rounded, and friendly.

- Stroke: `2px`
- Corner radius: `2px`
- Main color: `#6C3DF5`
- Use filled or tinted backgrounds only for active/selected states
- Keep icons simple enough to read at mobile sizes

## 5. Layout Principles

Design for fast scanning first. Users should immediately understand what is dropping, how much time is left, what is limited, and what action they can take.

Layout guidance:

- Put drop status, product image, price or benefit, and CTA close together.
- Use generous whitespace around hero and product moments.
- Keep section dividers light with Gray or Soft Gray.
- Use purple to guide action, pink to mark novelty or delight.
- Place mascot or illustration near brand, campaign, empty state, or reward moments.
- Product photography should be bright, clean, and pastel-friendly.

Responsive behavior:

- Mobile-first commerce layout with single-column product focus.
- Desktop can use 2 to 4 column grids for product discovery.
- Keep timer and CTA visible without overwhelming the product.
- Avoid tiny labels on mobile; badge text must remain readable.

## 6. Stitch Prompt Guidance

When creating a new screen in Google Stitch, include this design-system block in the prompt:

```markdown
Design a bright, playful limited-drop commerce interface for DropMong.

DESIGN SYSTEM:
- Brand mood: playful commerce, fast, cute, trustworthy, limited-edition shopping energy.
- Primary color: Drop Purple (#6C3DF5) for main CTAs, icons, active states, and D-Day badges.
- Secondary color: Lavender (#B69BFF) for soft brand surfaces and illustration depth.
- Accent color: Magenta Pink (#FF6DB6) for NEW labels, rewards, and delightful urgency.
- Backgrounds: White (#FFFFFF), BG Sub (#F9FAFC), Purple Tint (#F3F0FF), Pink Tint (#FFE2F7).
- Typography: Pretendard, bold headings, readable 14px body copy, compact 12px labels.
- Components: rounded 8px buttons, 6px badges, 8-12px cards, 2px purple line icons.
- Visual style: clean product-first layout, soft borders, subtle shadows, mascot accents used sparingly.
```

For product listing or drop pages, prioritize:

- Countdown timer
- Limited quantity badge
- Product image clarity
- Primary purchase or alert action
- Trustworthy but cheerful tone

## 7. Copy Tone

Brand voice should be friendly, quick, and exciting.

Use:

- "시간이 열리면, 특별한 드롭이 시작돼요"
- "정해진 시간에만 만나는 한정 아이템"
- "놓치기 전에 알림을 받아보세요"
- "빠르게 열리고, 즐겁게 고르는 드롭"

Avoid:

- Overly formal enterprise copy
- Fear-heavy scarcity language
- Long explanatory paragraphs
- Generic shopping-mall wording

