/*
 * Hotel Cards block
 * Rendered from the json2html hotels template (templates/hotels.html) as a
 * block-table: one row per hotel with fixed cells
 *   [0] brand/badge  [1] image  [2] name link  [3] location
 *   [4] star rating text  [5] TripAdvisor rating + review count  [6] features
 * Block-internal classes don't survive html2md, so cells are read by position.
 * Star/pin icons are created here and coloured via CSS mask (no <img> needed).
 */
function buildStars(text) {
  const stars = document.createElement('span');
  stars.className = 'hotel-card-stars';
  const count = parseInt((text.match(/\d+/) || [0])[0], 10);
  for (let i = 0; i < count; i += 1) {
    const s = document.createElement('span');
    s.className = 'icon-star-fill';
    stars.append(s);
  }
  if (/plus/i.test(text)) {
    const plus = document.createElement('span');
    plus.className = 'hotel-card-stars-plus';
    plus.textContent = 'plus';
    stars.append(plus);
  }
  return stars;
}

export default function decorate(block) {
  const ul = document.createElement('ul');

  block.querySelectorAll(':scope > div').forEach((row) => {
    const cells = [...row.children];
    const badge = cells[0] ? cells[0].textContent.trim() : '';
    const picture = cells[1] ? cells[1].querySelector('picture') : null;
    const link = cells[2] ? cells[2].querySelector('a') : null;
    const location = cells[3] ? cells[3].textContent.trim() : '';
    const starsText = cells[4] ? cells[4].textContent.trim() : '';
    const reviewsCell = cells[5];
    const featuresCell = cells[6];

    const li = document.createElement('li');

    const imageWrap = document.createElement('div');
    imageWrap.className = 'hotel-card-image';
    if (picture) imageWrap.append(picture);
    if (badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'hotel-card-badge';
      badgeEl.textContent = badge;
      imageWrap.append(badgeEl);
    }
    const fav = document.createElement('span');
    fav.className = 'hotel-card-fav';
    fav.setAttribute('aria-hidden', 'true');
    imageWrap.append(fav);

    const body = document.createElement('div');
    body.className = 'hotel-card-body';

    const heading = document.createElement('h3');
    if (link) {
      const a = document.createElement('a');
      a.href = link.getAttribute('href');
      a.textContent = link.textContent.trim();
      heading.append(a);
    }
    body.append(heading);

    if (location) {
      const loc = document.createElement('p');
      loc.className = 'hotel-card-location';
      const pin = document.createElement('span');
      pin.className = 'icon-pin';
      loc.append(pin, document.createTextNode(location));
      body.append(loc);
    }

    const taPicture = reviewsCell ? reviewsCell.querySelector('picture') : null;
    if (starsText || taPicture) {
      const ratings = document.createElement('div');
      ratings.className = 'hotel-card-ratings';
      if (starsText) {
        const ratingRow = document.createElement('div');
        ratingRow.className = 'hotel-card-rating';
        ratingRow.append(buildStars(starsText));
        const lbl = document.createElement('span');
        lbl.textContent = 'Our rating';
        ratingRow.append(lbl);
        ratings.append(ratingRow);
      }
      if (taPicture) {
        const reviewsRow = document.createElement('div');
        reviewsRow.className = 'hotel-card-reviews';
        reviewsRow.append(taPicture);
        const count = reviewsCell.textContent.trim();
        if (count) {
          const cnt = document.createElement('span');
          cnt.textContent = count;
          reviewsRow.append(cnt);
        }
        ratings.append(reviewsRow);
      }
      body.append(ratings);
    }

    const featureItems = featuresCell ? [...featuresCell.querySelectorAll('p')] : [];
    if (featureItems.length) {
      const features = document.createElement('ul');
      features.className = 'hotel-card-features';
      featureItems.forEach((p) => {
        const item = document.createElement('li');
        item.textContent = p.textContent.trim();
        features.append(item);
      });
      body.append(features);
    }

    li.append(imageWrap, body);
    ul.append(li);
  });

  block.replaceChildren(ul);
}
