/**
 * The left menu's rendered HTML as Bootstrap navigation, with icons on the
 * common entries. One formatter for core and add-ons (#1622): the Journal
 * add-on used to carry its own copy.
 *
 * @param content - The left menu page rendered to HTML
 * @returns The same HTML with nav classes and icons
 */
export function formatLeftMenuContent(content: string): string {
  // Convert basic markdown list to Bootstrap nav structure
  content = content.replace(/<ul>/g, '<ul class="nav flex-column">');
  content = content.replace(/<li>/g, '<li class="nav-item">');
  content = content.replace(/<a href="([^"]*)">/g, '<a class="nav-link" href="$1">');

  // Add icons to common menu items
  const icons: Array<[string, string]> = [
    ['Main page', 'fa-home'],
    ['About', 'fa-info-circle'],
    ['Find pages', 'fa-search'],
    ['Search', 'fa-search'],
    ['News', 'fa-newspaper'],
    ['Recent Changes', 'fa-history'],
    ['Page Index', 'fa-list'],
    ['SystemInfo', 'fa-server']
  ];
  for (const [label, icon] of icons) {
    content = content.replace(
      new RegExp(`(<a class="nav-link"[^>]*>)${label}`, 'g'),
      `$1<i class="fas ${icon}"></i> ${label}`
    );
  }
  return content;
}
