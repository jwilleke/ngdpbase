/**
 * Admin user forms (#1521): say when one ticked role already includes
 * everything another ticked role grants, so the second can be unticked.
 * Nothing is unticked for the admin: a policy or a page's audience may name
 * the smaller role, so dropping it is their call.
 */
(function () {
  'use strict';
  const data = document.getElementById('roleGrantsData');
  const note = document.getElementById('roleCoverNote');
  if (!data || !note) return;
  const grants = JSON.parse(data.textContent || '{}');
  const boxes = Array.from(document.querySelectorAll('input[type="checkbox"][data-role]'));
  const label = function (role) {
    const box = boxes.find(function (b) { return b.getAttribute('data-role') === role; });
    return (box && box.getAttribute('data-role-label')) || role;
  };
  // A covers B when every action B is granted, A is granted at least as widely.
  const covers = function (a, b) {
    const ga = grants[a]; const gb = grants[b];
    if (!ga || !gb || !gb.allows.length) return false;
    return gb.allows.every(function (x) {
      return ga.allows.some(function (y) { return y.action === x.action && (!y.limited || x.limited); });
    });
  };
  const update = function () {
    const ticked = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.getAttribute('data-role'); });
    const notes = [];
    ticked.forEach(function (b) {
      const by = ticked.find(function (a) { return a !== b && covers(a, b); });
      if (by) notes.push(label(by) + ' already includes everything ' + label(b) + ' grants; you can untick ' + label(b) + '.');
    });
    note.textContent = notes.join(' ');
    note.classList.toggle('d-none', notes.length === 0);
  };
  boxes.forEach(function (b) { b.addEventListener('change', update); });
  update();
})();
