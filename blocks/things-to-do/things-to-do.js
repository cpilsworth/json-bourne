const INITIAL_COUNT = 6;

export default function decorate(block) {
  const rows = [...block.children];
  if (rows.length < 2) return;

  // Row 0 is the filter (category names in cells); the rest are POI cards.
  // Block-internal classes are stripped by the pipeline, so key off position.
  const [filterRow, ...cardRows] = rows;

  const ul = document.createElement('ul');
  cardRows.forEach((row) => {
    const cells = [...row.children];
    const category = cells[0] ? cells[0].textContent.trim() : '';
    const imageCell = cells[1];
    const linkEl = cells[2] ? cells[2].querySelector('a') : null;
    const location = cells[3] ? cells[3].textContent.trim() : '';
    const summary = cells[4] ? cells[4].textContent.trim() : '';

    const li = document.createElement('li');
    li.dataset.category = category;

    const imageWrap = document.createElement('div');
    imageWrap.className = 'things-to-do-card-image';
    const picture = imageCell && (imageCell.querySelector('picture') || imageCell.querySelector('img'));
    if (picture) imageWrap.append(picture);
    if (category) {
      const badge = document.createElement('span');
      badge.className = 'things-to-do-card-badge';
      badge.textContent = category;
      imageWrap.append(badge);
    }

    const body = document.createElement('div');
    body.className = 'things-to-do-card-body';
    const heading = document.createElement('h3');
    if (linkEl) {
      // rebuild a clean link (avoids inherited button decoration/classes)
      const a = document.createElement('a');
      a.href = linkEl.href;
      a.textContent = linkEl.textContent.trim();
      heading.append(a);
    } else if (cells[2]) {
      heading.textContent = cells[2].textContent.trim();
    }
    body.append(heading);
    if (location) {
      const loc = document.createElement('p');
      loc.className = 'things-to-do-card-location';
      loc.textContent = location;
      body.append(loc);
    }
    if (summary) {
      const sum = document.createElement('p');
      sum.textContent = summary;
      body.append(sum);
    }

    li.append(imageWrap, body);
    ul.append(li);
  });

  // Convert the filter row into a dropdown.
  const select = document.createElement('select');
  select.className = 'things-to-do-filter';
  select.setAttribute('aria-label', 'Filter things to do by category');
  [...filterRow.children].forEach((cell) => {
    const name = cell.textContent.trim();
    if (!name) return;
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.append(opt);
  });

  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'things-to-do-more';
  moreButton.textContent = 'Show more things to do';

  let expanded = false;
  const apply = () => {
    const category = select.value;
    const matching = [...ul.children]
      .filter((li) => category === 'All' || li.dataset.category === category);
    [...ul.children].forEach((li) => { li.hidden = true; });
    matching.forEach((li, i) => {
      if (expanded || i < INITIAL_COUNT) li.hidden = false;
    });
    moreButton.hidden = expanded || matching.length <= INITIAL_COUNT;
  };

  select.addEventListener('change', () => { expanded = false; apply(); });
  moreButton.addEventListener('click', () => { expanded = true; apply(); });

  block.replaceChildren(select, ul, moreButton);
  apply();
}
