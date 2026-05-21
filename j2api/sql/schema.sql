CREATE TABLE IF NOT EXISTS hotels (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT,
  url TEXT,
  resort TEXT,
  area TEXT,
  region TEXT,
  brand TEXT,
  brand_id INTEGER,
  star_rating REAL,
  key_selling_points TEXT,
  villa_features TEXT,
  rating_value REAL,
  rating_image_url TEXT,
  review_count INTEGER,
  awards TEXT,
  jet2_awards TEXT,
  is_villa INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS hotel_resorts (
  hotel_id INTEGER NOT NULL,
  resort_id INTEGER NOT NULL,
  PRIMARY KEY (hotel_id, resort_id)
);

CREATE INDEX IF NOT EXISTS idx_hotels_area ON hotels(area);
CREATE INDEX IF NOT EXISTS idx_hotels_star ON hotels(star_rating);
CREATE INDEX IF NOT EXISTS idx_hotels_is_villa ON hotels(is_villa);
CREATE INDEX IF NOT EXISTS idx_hotel_resorts_resort ON hotel_resorts(resort_id);
