-- E-05 사진 저장소 (FR-004·FR-018).
--
-- 신뢰 모델은 결정 #12 그대로다: 버킷은 public-read 이고 비밀은 **경로**다
-- (무작위 UUID 두 개 = 128bit 이상). 서명 URL 을 쓰지 않는 이유는 만료가 공유 뷰·오프라인
-- 캐시·썸네일 프리페치를 깨기 때문. 그래서 읽기는 열고, 쓰기·삭제만 잠근다.
--
-- 경로 어휘는 0001_schema.sql 의 photos CHECK 와 하나로 맞춘다:
--   photos.storage_path = bucket_id || '/' || storage.objects.name
--   = photos/{uuid}/{uuid}.webp  ·  썸네일은 같은 자리에 -thumb 를 붙인다

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2 * 1024 * 1024, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 읽기: 누구나. 공유 뷰(P2)와 오프라인 캐시가 서명 없이 성립하는 근거 (결정 #12)
create policy photos_public_read on storage.objects
  for select to public
  using (bucket_id = 'photos');

-- 쓰기: 로그인 사용자만, 그것도 무작위 UUID 경로일 때만.
-- 경로를 정책으로 강제해야 "추측 불가"가 사용자 실수와 무관하게 유지된다.
create policy photos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (objects.bucket_id || '/' || objects.name) ~ '^photos/[0-9a-f-]{36}/[0-9a-f-]{36}(-thumb)?\.webp$'
  );

-- 삭제: 그 경로를 참조하는 photos 행의 소유자만.
-- photos 에도 RLS 가 걸려 있으므로 여기서 보이는 행 = 내 행(places 또는 legs→days→trips 경유)이다.
-- 참조하는 행이 없는 파일(=업로드 도중 실패해 남은 고아)은 올린 사람이 치울 수 있다 —
-- E-05 의 "실패 시 정리"가 성립하려면 이 갈래가 필요하다.
create policy photos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and case
      when exists (
        select 1
        from public.photos ph
        where objects.bucket_id || '/' || objects.name in (ph.storage_path, ph.thumb_path)
      ) then true
      else coalesce(objects.owner_id, objects.owner::text) = auth.uid()::text
    end
  );
