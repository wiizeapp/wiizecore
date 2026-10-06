REVOKE SELECT ON public.tracking_settings FROM anon, authenticated;
GRANT SELECT (id, enabled, gtm_id, ga4_id, meta_pixel_id, updated_at) ON public.tracking_settings TO anon, authenticated;
GRANT SELECT ON public.tracking_settings TO service_role;