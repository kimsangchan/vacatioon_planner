begin;

select plan(19);

-- T6-4 · E-05 사진 스토리지. 신뢰 모델은 결정 #12 — public-read + 무작위 128bit 경로,
-- 쓰기는 로그인 사용자만, 삭제는 그 경로를 참조하는 photos 행의 소유자(또는 자기 고아 파일)만.
-- 경로 어휘는 0001_schema.sql 의 photos CHECK 와 같다: photos/{uuid}/{uuid}(-thumb)?.webp
--   = storage.objects 의 bucket_id || '/' || name

-- ── 버킷 설정 ────────────────────────────────────────────────────────────────

select is(
  (select public from storage.buckets where id = 'photos'),
  true,
  'photos bucket is public-read (결정 #12)'
);
select is(
  (select file_size_limit from storage.buckets where id = 'photos'),
  (2 * 1024 * 1024)::bigint,
  'photos bucket caps every object at 2MB (E-05)'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'photos'),
  array['image/webp'],
  'photos bucket accepts WebP only (E-05)'
);

-- ── 정책 존재·연산·롤 (05 §권한 모델 Storage 행) ────────────────────────────

select is(
  (select cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_public_read'),
  'SELECT',
  'photos_public_read policy exists for SELECT'
);
select is(
  (select roles::text[] from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_public_read'),
  array['public'],
  'photos_public_read is open to everyone'
);
select is(
  (select cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_owner_insert'),
  'INSERT',
  'photos_owner_insert policy exists for INSERT'
);
select is(
  (select roles::text[] from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_owner_insert'),
  array['authenticated'],
  'only signed-in users may upload'
);
select is(
  (select cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_owner_delete'),
  'DELETE',
  'photos_owner_delete policy exists for DELETE'
);
select is(
  (select roles::text[] from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'photos_owner_delete'),
  array['authenticated'],
  'only signed-in users may delete'
);

-- ── 시드 (postgres 롤 — RLS 우회) ───────────────────────────────────────────

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'a@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2', 'authenticated', 'authenticated', 'b@example.com', '', now(), now(), now());

insert into public.trips (id, owner_id, name, start_date, end_date)
values ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'A trip', '2026-08-08', '2026-08-10');

insert into public.places (id, trip_id, owner_id, category, name, lat, lng, provider)
values ('30000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'spot', 'A place', 34.801942, 126.365881, 'naver');

insert into public.photos (id, place_id, storage_path, thumb_path)
values (
  '60000000-0000-0000-0000-0000000000a1',
  '30000000-0000-0000-0000-0000000000a1',
  'photos/60000000-0000-0000-0000-0000000000a1/60000000-0000-0000-0000-0000000000a1.webp',
  'photos/60000000-0000-0000-0000-0000000000a1/60000000-0000-0000-0000-0000000000a1-thumb.webp'
);

-- 위 photos 행이 가리키는 실제 오브젝트 + 아무 행도 가리키지 않는 고아 오브젝트
insert into storage.objects (bucket_id, name, owner, owner_id)
values
  ('photos', '60000000-0000-0000-0000-0000000000a1/60000000-0000-0000-0000-0000000000a1.webp', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1'),
  ('photos', '70000000-0000-0000-0000-00000000000f/70000000-0000-0000-0000-00000000000f.webp', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1');

-- ── 사용자 A: 업로드 경로 형식 강제 ─────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner, owner_id)
    values ('photos', '80000000-0000-0000-0000-0000000000a1/80000000-0000-0000-0000-0000000000a1.webp', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1')$$,
  'signed-in user can upload a random-uuid webp path'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner, owner_id)
    values ('photos', '80000000-0000-0000-0000-0000000000a1/80000000-0000-0000-0000-0000000000a1-thumb.webp', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1')$$,
  'signed-in user can upload the matching thumbnail path'
);
select throws_like(
  $$insert into storage.objects (bucket_id, name, owner, owner_id)
    values ('photos', '80000000-0000-0000-0000-0000000000a1/80000000-0000-0000-0000-0000000000a1.jpg', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1')$$,
  '%row-level security policy%',
  'non-webp paths are refused'
);
select throws_like(
  $$insert into storage.objects (bucket_id, name, owner, owner_id)
    values ('photos', 'holidays/beach.webp', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1')$$,
  '%row-level security policy%',
  'guessable paths are refused (결정 #12)'
);

-- ── anon: 읽기는 되고 쓰기는 안 된다 ────────────────────────────────────────

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

-- 절대 건수 금지 — 실사용 업로드가 쌓이면 깨진다. 이 테스트가 만든 경로만 센다.
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'photos'
      and (name like '60000000-%' or name like '70000000-%' or name like '80000000-%')),
  4,
  'anyone can read photo objects (공유 뷰·오프라인 캐시 전제)'
);
select throws_like(
  $$insert into storage.objects (bucket_id, name)
    values ('photos', '90000000-0000-0000-0000-0000000000c3/90000000-0000-0000-0000-0000000000c3.webp')$$,
  '%row-level security policy%',
  'anon cannot upload'
);

-- ── 삭제: 참조하는 photos 행의 소유자만 ─────────────────────────────────────
-- storage.objects 는 직접 DELETE 를 트리거로 막는다(Storage API 경유 강제) —
-- 정책만 떼어 검증하려고 테스트에서만 해제한다.
set local "storage.allow_delete_query" = 'true';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', true);

select results_eq(
  $$with d as (
      delete from storage.objects
      where bucket_id = 'photos'
        and name = '60000000-0000-0000-0000-0000000000a1/60000000-0000-0000-0000-0000000000a1.webp'
      returning 1)
    select count(*)::int from d$$,
  $$values (0)$$,
  'another account cannot delete a photo it does not own'
);
select results_eq(
  $$with d as (
      delete from storage.objects
      where bucket_id = 'photos'
        and name = '70000000-0000-0000-0000-00000000000f/70000000-0000-0000-0000-00000000000f.webp'
      returning 1)
    select count(*)::int from d$$,
  $$values (0)$$,
  'another account cannot delete someone else orphan upload'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

select results_eq(
  $$with d as (
      delete from storage.objects
      where bucket_id = 'photos'
        and name = '60000000-0000-0000-0000-0000000000a1/60000000-0000-0000-0000-0000000000a1.webp'
      returning 1)
    select count(*)::int from d$$,
  $$values (1)$$,
  'owner of the photos row can delete its object'
);
select results_eq(
  $$with d as (
      delete from storage.objects
      where bucket_id = 'photos'
        and name = '70000000-0000-0000-0000-00000000000f/70000000-0000-0000-0000-00000000000f.webp'
      returning 1)
    select count(*)::int from d$$,
  $$values (1)$$,
  'uploader can clean up an orphan upload (E-05 실패 정리)'
);

select * from finish();

rollback;
