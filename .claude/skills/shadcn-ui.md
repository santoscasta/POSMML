---
name: shadcn-ui
description: shadcn/ui component library rules and best practices for this project
---

# shadcn/ui Skill

## Core Principles
1. Search registries before building custom UI
2. Combine existing components (Tabs + Card + form controls)
3. Use component variants before custom styling
4. Apply semantic tokens like `bg-primary`, `text-muted-foreground`, never raw values

## Project Context
- Framework: Vite + React 19
- Tailwind: v4 (uses `@theme inline`)
- Alias: `@/` → `./src/`
- Icon library: lucide-react
- Package manager: npm
- Style: default
- Base: radix

## Styling Rules
- Use `className` for layout only; never override component colors/typography
- Replace `space-x-*`/`space-y-*` with `flex` + `gap-*`
- Apply `size-*` when width equals height
- Use `truncate` shorthand
- Avoid manual `dark:` overrides — use semantic tokens
- Apply `cn()` from `@/lib/utils` for conditional classes
- Don't manually set `z-index` on Dialog, Sheet, Popover

## Component Rules
- Card uses full composition: Header/Title/Description/Content/Footer
- Dialog/Sheet require Title for accessibility
- Use `asChild` for custom triggers
- Items nest in their Group (SelectItem in SelectGroup)
- Use `Badge` instead of styled spans
- Use `Separator` instead of `<hr>`
- Use `sonner` for toasts

## Icons
- Icons in buttons use `data-icon` attributes
- Don't add sizing classes to icons inside components
- Pass icons as objects, not strings

## CLI Workflow
```bash
npx shadcn@latest info        # Project context
npx shadcn@latest search      # Find components
npx shadcn@latest docs <name> # Component docs
npx shadcn@latest add <name>  # Install component
```
