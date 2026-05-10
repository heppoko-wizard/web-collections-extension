# Web Collections Design System (MASTER)

## 1. Aesthetic Identity
- **Theme**: Refined Modern UI (Light/Dark Mode Support)
- **Visual Vibe**: Balanced contrast, subtle curves, professional, and accessible.
- **Inspiration**: High-end SaaS dashboards and native OS interfaces.

## 2. Design Tokens

### Colors (Theme Aware)

**Light Mode (Default / `[data-theme="light"]`)**
- **bg-primary**: `#fafafa` (Very light gray background)
- **bg-secondary**: `#f4f4f5` (Slightly darker for panels)
- **bg-surface**: `#ffffff` (Card background)
- **bg-hover**: `#e4e4e7`
- **text-primary**: `#18181b` (Almost black)
- **text-secondary**: `#52525b` (Medium gray)
- **text-muted**: `#71717a`
- **accent-primary**: `#09090b` (Black accent)
- **border-subtle**: `#e4e4e7`
- **border-active**: `#09090b`
- **shadow-color**: `rgba(0, 0, 0, 0.08)`

**Dark Mode (`[data-theme="dark"]`)**
- **bg-primary**: `#09090b` (Deep dark background)
- **bg-secondary**: `#18181b` (Slightly lighter panels)
- **bg-surface**: `#121212` (Card background)
- **bg-hover**: `#27272a`
- **text-primary**: `#fafafa` (Almost white)
- **text-secondary**: `#a1a1aa` (Medium gray)
- **text-muted**: `#71717a`
- **accent-primary**: `#ffffff` (White accent)
- **border-subtle**: `#27272a`
- **border-active**: `#fafafa`
- **shadow-color**: `rgba(0, 0, 0, 0.4)`

### Typography
- **Heading**: `Outfit`, sans-serif (Geometric, Modern)
- **Body**: `Inter`, sans-serif (High legibility, but used with precise tracking)
- **Mono/Technical**: `JetBrains Mono`, monospace (For meta-data and technical details)

### Sizing & Spacing
- **Base Unit**: `4px`
- **Spacing Scale**: `4, 8, 12, 16, 24, 32, 48, 64`
- **Radius**: `4px` (Small), `6px` (Standard), `8px` (Large)
- **Touch Target**: Min `44px x 44px` (High precision spacing)

## 3. Components Guidelines

### Buttons
- **Primary**: Solid `bg-accent`, `text-primary`, no gradient, slight scale on hover.
- **Secondary**: Ghost style with `border-subtle`, transitions to `bg-secondary` on hover.
- **Icon Buttons**: Min size `44px`, no background by default, centered icon.

### Cards (Collections/Items)
- **Default**: Flat surface, subtle border, no shadow unless elevated.
- **Interaction**: On hover, border color changes to `border-active`, content shifts slightly (`translateX(4px)`).

### Icons
- **Strict Rule**: No emojis. Use Lucide SVG icons only.
- **Stroke Width**: `1.5px` for a refined technical look.

## 4. Anti-Patterns (NEVER USE)
- Generic purple/blue gradients on dark backgrounds.
- System fonts (Arial, Meiryo, etc.) as the primary brand expression.
- Emojis for navigation or settings.
- Border-radius > 12px (Avoid "bubble" aesthetic).
- Floating shadows on every element.
