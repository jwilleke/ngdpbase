/**
 * #1813 — an add-on asks PageManager for a page's URL and a vault page's name,
 * instead of importing `utils/pageUrl` and `utils/privateStorePath` from core's
 * `dist/`. Pure: nothing is read but the configuration.
 */
import PageManager from '../PageManager';
import type { WikiEngine } from '../../types/WikiEngine';

function makeEngine(props: Record<string, unknown> = {}, withConfig = true): WikiEngine {
  const cm = { getProperty: vi.fn((key: string, dv: unknown) => (key in props ? props[key] : dv)) };
  return { getManager: vi.fn((name: string) => (name === 'ConfigurationManager' && withConfig ? cm : null)) };
}

describe('PageManager.pageUrl (#1813)', () => {
  const pm = new PageManager(makeEngine());

  it('is /view/ for a public page, encoded', () => {
    expect(pm.pageUrl('Main')).toBe('/view/Main');
    expect(pm.pageUrl('A B', 'edit')).toBe('/edit/A%20B');
  });

  it('is under /vaults/ for a vault page, with the action below it', () => {
    expect(pm.pageUrl('vaults/jim/default/Diary')).toBe('/vaults/jim/default/Diary');
    expect(pm.pageUrl('vaults/jim/default/Diary', 'edit')).toBe('/vaults/jim/default/Diary/edit');
  });
});

describe('PageManager.privatePageName (#1813)', () => {
  it('names the page in the vault given', () => {
    expect(new PageManager(makeEngine()).privatePageName('jim', 'Entry', 'journal')).toBe('vaults/jim/journal/Entry');
  });

  it('names the page in the default vault the system-category declares when none is given', () => {
    const categories = {
      'ngdpbase.system-category': {
        general: { default: true, storageLocation: { privatestore: 'pages/vaults/{user}/personal' } },
        journal: { storageLocation: { privatestore: 'pages/vaults/{user}/journal' } }
      }
    };
    expect(new PageManager(makeEngine(categories)).privatePageName('jim', 'Entry')).toBe('vaults/jim/personal/Entry');
  });

  it('refuses without ConfigurationManager when it has to look up the default vault', () => {
    expect(() => new PageManager(makeEngine({}, false)).privatePageName('jim', 'Entry')).toThrow(/ConfigurationManager/);
  });
});
