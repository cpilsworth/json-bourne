/*
 * Hotel Cards block
 * The hotel listing arrives as a default-content <ul> (the json2html hotels
 * template output, flattened to standard HTML by html2md). scripts.js promotes
 * that <ul> to a `hotel-cards` block; this decorator restructures each <li>
 * into a Jet2-style card. decorateIcons has already turned the icon spans into
 * <img>, so those elements are preserved as-is.
 */
export default function decorate(block) {
  const ul = block.querySelector('ul');
  if (!ul) return;

  ul.querySelectorAll(':scope > li').forEach((li) => {
    const kids = [...li.children];
    const isTa = (p) => /tripadvisor/i.test(p.querySelector('img')?.alt || '');
    const pics = kids.filter((k) => k.tagName === 'P' && k.querySelector('picture'));
    const imageP = pics.find((p) => !isTa(p));
    const taP = pics.find(isTa);
    const heading = li.querySelector(':scope > h3');
    const locationP = kids.find((k) => k.tagName === 'P' && k.querySelector('.icon-pin'));
    const starsP = kids.find((k) => k.tagName === 'P' && k.querySelector('.icon-star-fill'));
    const featuresUl = li.querySelector(':scope > ul');
    const textPs = kids.filter((k) => k.tagName === 'P'
      && ![imageP, taP, locationP, starsP].includes(k));
    const reviewsP = textPs.find((p) => /review/i.test(p.textContent));
    const ratingP = textPs.find((p) => p !== reviewsP && /rating/i.test(p.textContent));
    const badgeP = textPs.find((p) => ![reviewsP, ratingP].includes(p));

    const imageWrap = document.createElement('div');
    imageWrap.className = 'hotel-card-image';
    if (imageP) imageWrap.append(imageP.querySelector('picture'));
    if (badgeP && badgeP.textContent.trim()) {
      const badge = document.createElement('span');
      badge.className = 'hotel-card-badge';
      badge.textContent = badgeP.textContent.trim();
      imageWrap.append(badge);
    }
    const fav = document.createElement('span');
    fav.className = 'hotel-card-fav';
    fav.setAttribute('aria-hidden', 'true');
    imageWrap.append(fav);

    const body = document.createElement('div');
    body.className = 'hotel-card-body';
    if (heading) body.append(heading);
    if (locationP) {
      locationP.className = 'hotel-card-location';
      body.append(locationP);
    }

    if (starsP || taP) {
      const ratings = document.createElement('div');
      ratings.className = 'hotel-card-ratings';
      if (starsP) {
        const ratingRow = document.createElement('div');
        ratingRow.className = 'hotel-card-rating';
        const stars = document.createElement('span');
        stars.className = 'hotel-card-stars';
        starsP.querySelectorAll('.icon-star-fill').forEach((s) => stars.append(s));
        ratingRow.append(stars);
        if (ratingP && ratingP.textContent.trim()) {
          const lbl = document.createElement('span');
          lbl.textContent = ratingP.textContent.trim();
          ratingRow.append(lbl);
        }
        ratings.append(ratingRow);
      }
      if (taP) {
        const reviewsRow = document.createElement('div');
        reviewsRow.className = 'hotel-card-reviews';
        reviewsRow.append(taP.querySelector('picture'));
        if (reviewsP && reviewsP.textContent.trim()) {
          const cnt = document.createElement('span');
          cnt.textContent = reviewsP.textContent.trim();
          reviewsRow.append(cnt);
        }
        ratings.append(reviewsRow);
      }
      body.append(ratings);
    }

    if (featuresUl) {
      featuresUl.className = 'hotel-card-features';
      body.append(featuresUl);
    }

    li.replaceChildren(imageWrap, body);
  });

  // Drop the buildBlock table wrapper so the block directly contains the list.
  block.replaceChildren(ul);
}
