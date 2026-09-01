import { resolveMaintenanceState } from '../maintenanceState';

/**
 * #1147 — maintenance mode had two readers on two different sources and the
 * toggle wrote to only one. These tests pin the property the issue asks for:
 * one switch, one state.
 */
describe('resolveMaintenanceState (#1147)', () => {
  const get = (values: Record<string, unknown>) =>
    (key: string, fallback: unknown): unknown =>
      key in values ? values[key] : fallback;

  test('is off, admin-permitted and message-bearing by default', () => {
    const state = resolveMaintenanceState(get({}));
    expect(state.enabled).toBe(false);
    expect(state.allowAdmins).toBe(true);
    expect(typeof state.message).toBe('string');
    expect(state.message.length).toBeGreaterThan(0);
    expect(state.estimatedDuration).toBeNull();
  });

  test('reads the documented configuration keys', () => {
    const state = resolveMaintenanceState(get({
      'ngdpbase.features.maintenance.enabled': true,
      'ngdpbase.features.maintenance.allow-admins': false,
      'ngdpbase.features.maintenance.message': 'Rebuilding the index',
      'ngdpbase.features.maintenance.estimated-duration': '50 seconds'
    }));
    expect(state.enabled).toBe(true);
    expect(state.allowAdmins).toBe(false);
    expect(state.message).toBe('Rebuilding the index');
    expect(state.estimatedDuration).toBe('50 seconds');
  });

  test('coerces a non-boolean enabled rather than trusting it', () => {
    // A hand-edited app-custom-config.json can carry "true" as a string.
    expect(resolveMaintenanceState(get({ 'ngdpbase.features.maintenance.enabled': 'true' })).enabled).toBe(true);
    expect(resolveMaintenanceState(get({ 'ngdpbase.features.maintenance.enabled': 'false' })).enabled).toBe(false);
    expect(resolveMaintenanceState(get({ 'ngdpbase.features.maintenance.enabled': 1 })).enabled).toBe(true);
  });

  test('allow-admins is true unless explicitly false', () => {
    expect(resolveMaintenanceState(get({ 'ngdpbase.features.maintenance.allow-admins': undefined })).allowAdmins).toBe(true);
    expect(resolveMaintenanceState(get({ 'ngdpbase.features.maintenance.allow-admins': false })).allowAdmins).toBe(false);
    expect(resolveMaintenanceState(get({ 'ngdpbase.features.maintenance.allow-admins': 'false' })).allowAdmins).toBe(false);
  });

  test('an empty estimated-duration is null, not an empty string', () => {
    // The view renders it when present, so '' must not read as "configured".
    expect(resolveMaintenanceState(get({ 'ngdpbase.features.maintenance.estimated-duration': '' })).estimatedDuration).toBeNull();
  });
});
