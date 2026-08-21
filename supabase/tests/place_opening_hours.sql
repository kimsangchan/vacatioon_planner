begin;

select plan(4);

-- Business hours are authored by the user. Keep the storage contract deliberately
-- simple: plain multiline text, not provider-shaped JSON.
select has_column(
  'public',
  'places',
  'opening_hours',
  'places.opening_hours stores user-authored business hours'
);
select col_type_is(
  'public',
  'places',
  'opening_hours',
  'text',
  'opening_hours is plain text rather than json/jsonb'
);
select col_not_null(
  'public',
  'places',
  'opening_hours',
  'opening_hours uses an empty string instead of null for no value'
);
select col_default_is(
  'public',
  'places',
  'opening_hours',
  '',
  'opening_hours defaults to an empty string'
);

select * from finish();

rollback;
