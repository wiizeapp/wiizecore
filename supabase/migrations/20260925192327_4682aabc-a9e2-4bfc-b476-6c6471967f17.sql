INSERT INTO public.user_roles (user_id, role)
SELECT id, 'platform_admin'::public.app_role FROM auth.users
WHERE id = '171acb4e-d077-4224-9ba3-599df8507218' AND lower(email) = 'caiowiize@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;