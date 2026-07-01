export default function decorate(block) {
  const filter = block.querySelector('.things-to-do-filter');
  if (!filter) return;

  const items = block.querySelectorAll('ul > li');
  const options = [...filter.children];

  const select = document.createElement('select');
  select.className = 'things-to-do-filter-select';
  select.setAttribute('aria-label', 'Filter things to do by category');
  options.forEach((option) => {
    const { textContent } = option;
    const opt = document.createElement('option');
    opt.value = textContent;
    opt.textContent = textContent;
    select.append(opt);
  });
  filter.replaceChildren(select);

  select.addEventListener('change', () => {
    const category = select.value;
    items.forEach((item) => {
      item.style.display = category === 'All' || item.dataset.category === category ? '' : 'none';
    });
  });
}
