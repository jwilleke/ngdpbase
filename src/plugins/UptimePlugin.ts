import type { SimplePlugin, PluginContext } from './types.js';
import { CLOCK_TOPIC } from '../cache/CacheDependencies.js';

const UptimePlugin: SimplePlugin = {
  name: 'UptimePlugin',
  description: 'Shows the server uptime',
  author: 'ngdpbase',
  version: '1.0.0',

  execute(context: PluginContext): string {
    const { formatDuration } = context.formatters;
    // #1751: changes with the time, not on a write: re-rendered at most once a minute.
    context.dependsOn?.(CLOCK_TOPIC);
    const engine = context.engine;
    if (!engine || !engine.startTime) {
      return 'Unknown';
    }
    const uptimeSeconds = Math.floor((Date.now() - engine.startTime) / 1000);
    return formatDuration(uptimeSeconds);
  }
};

export default UptimePlugin;
