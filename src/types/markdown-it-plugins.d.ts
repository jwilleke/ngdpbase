/**
 * markdown-it plugins that ship without type declarations (#1273).
 * markdown-it-anchor ships its own.
 */
declare module 'markdown-it-sub' {
  import type { PluginSimple } from 'markdown-it';
  const plugin: PluginSimple;
  export default plugin;
}

declare module 'markdown-it-sup' {
  import type { PluginSimple } from 'markdown-it';
  const plugin: PluginSimple;
  export default plugin;
}

declare module 'markdown-it-task-lists' {
  import type { PluginWithOptions } from 'markdown-it';
  const plugin: PluginWithOptions<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>;
  export default plugin;
}
