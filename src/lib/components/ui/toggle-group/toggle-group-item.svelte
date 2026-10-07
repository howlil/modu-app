<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
  import { getToggleGroupCtx } from "./toggle-group.svelte";
  import { cn } from "$lib/utils.js";
  import { type ToggleVariants, toggleVariants } from "$lib/components/ui/toggle/index.js";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    size,
    variant,
    ...restProps
  }: ToggleGroupPrimitive.ItemProps & ToggleVariants = $props();

  const ctx = getToggleGroupCtx();
</script>

<ToggleGroupPrimitive.Item
  bind:ref
  data-slot="toggle-group-item"
  data-variant={ctx.variant || variant}
  data-size={ctx.size || size}
  data-spacing={ctx.spacing}
  class={cn(
    "shrink-0 rounded-full focus:z-10 focus-visible:z-10 data-[state=on]:bg-muted",
    toggleVariants({
      variant: ctx.variant || variant,
      size: ctx.size || size
    }),
    className
  )}
  {value}
  {...restProps}
/>
