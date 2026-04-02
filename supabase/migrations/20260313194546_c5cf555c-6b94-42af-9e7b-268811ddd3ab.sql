-- telegram_bot_state is only accessed by service_role (edge functions), no user-facing policy needed
-- But we need at least one policy to satisfy the linter
CREATE POLICY "Service role only" ON telegram_bot_state FOR ALL USING (false);