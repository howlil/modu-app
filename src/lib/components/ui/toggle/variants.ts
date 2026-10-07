import { type VariantProps, tv } from "tailwind-variants";

export const toggleVariants = tv({
  base: "group/toggle inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium outline-none transition-[color,box-shadow] hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-muted [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  variants: {
    variant: {
      default: "bg-transparent",
      outline: "border border-input bg-transparent shadow-xs hover:bg-muted"
    },
    size: {
      default: "h-9 min-w-9 px-2.5",
      sm: "h-8 min-w-8 px-2.5",
      lg: "h-10 min-w-10 px-2.5"
    }
  },
  defaultVariants: {
    variant: "default",
    size: "default"
  }
});

export type ToggleVariant = VariantProps<typeof toggleVariants>["variant"];
export type ToggleSize = VariantProps<typeof toggleVariants>["size"];
export type ToggleVariants = VariantProps<typeof toggleVariants>;
