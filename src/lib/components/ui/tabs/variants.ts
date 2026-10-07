import { tv, type VariantProps } from "tailwind-variants";

export const tabsListVariants = tv({
  base: "rounded-lg p-1 group-data-[orientation=horizontal]/tabs:h-9 data-[variant=line]:rounded-none group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  variants: {
    variant: {
      default: "bg-muted",
      line: "gap-1 bg-transparent"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

export type TabsListVariant = VariantProps<typeof tabsListVariants>["variant"];
