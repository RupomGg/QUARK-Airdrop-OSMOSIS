CREATE POLICY "Server can manage users" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Server can manage sessions" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Server can manage wallet sessions" ON public.wallet_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Server can manage vouchers" ON public.vouchers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Server can manage transactions" ON public.transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Server can manage audit logs" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Server can manage lending positions" ON public.lending_positions FOR ALL TO service_role USING (true) WITH CHECK (true);