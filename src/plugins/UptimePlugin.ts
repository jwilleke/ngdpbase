import type { SimplePlugin, PluginContext } from './types.js';
import { formatDuration } from '../utils/pluginFormatters.js';

const UptimePlugin: SimplePlugin = {
  name: 'UptimePlugin',
  // #1751: the uptime changes with nothing written, so a page showing it is not kept in the page cache.
  volatile: true,
  description: 'Shows the server uptime',
  author: 'ngdpbase',
  version: '1.0.0',

  execute(context: PluginContext): string {
    const engine = context.engine;
    if (!engine || !engine.startTime) {
      return 'Unknown';
    }
    const uptimeSeconds = Math.floor((Date.now() - engine.startTime) / 1000);
    return formatDuration(uptimeSeconds);
  }
};

export default UptimePlugin;
