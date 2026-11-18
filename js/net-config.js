'use strict';

/* ============================================================
   联机配置（复用同一个 Supabase 项目的 Realtime 广播）
   anon key 是公开键，写进前端是正常做法（RLS 只允许 broadcast）。
   ============================================================ */

window.COD_NET = {
  url: 'https://cgwodpaprylgpgefbakr.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnd29kcGFwcnlsZ3BnZWZiYWtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMDIzNTksImV4cCI6MjEwOTg3ODM1OX0.NGlUXtp8CC2WC_lSyKPbeacfLQ3mCg2pia_tJ3s2zjo',
  channelPrefix: 'cod'
};
