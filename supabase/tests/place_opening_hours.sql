begin;

select plan(5);

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
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.places'::regclass
      and conname = 'places_opening_hours_length_check'
      and pg_get_constraintdef(oid) like '%char_length(opening_hours) <= 2000%'
  ),
  'opening_hours is limited to 2000 characters'
);

select * from finish();

rollback;
