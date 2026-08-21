-- Enums over CHECK constraints: invalid values are rejected by the type
-- system and the permitted set is discoverable via introspection.
create type public.app_role as enum ('admin','supervisor','trainer','trainee');
create type public.profile_status as enum ('pending','active','suspended','rejected');
