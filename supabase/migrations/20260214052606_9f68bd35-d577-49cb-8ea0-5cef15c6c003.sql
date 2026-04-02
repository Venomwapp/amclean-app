
-- Make activity_log insert policy more specific (only service role can insert)
DROP POLICY "System can insert activity log" ON public.activity_log;
CREATE POLICY "Admins can manage activity log" ON public.activity_log FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
