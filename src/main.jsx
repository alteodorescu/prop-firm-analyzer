import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Landing from './Landing.jsx'
import { supabase } from './supabaseClient.js'
import './index.css'

// ── Lightweight path-based routing ───────────────────────────────────────
// `/`          → marketing landing page (+ waitlist)
// `/app`, `/*` → authed product (existing App)
//
// We intentionally avoid react-router here — the app uses in-memory tab
// state for navigation and doesn't need per-page routes. A single top-level
// path check is enough to separate marketing from product.
function resolveRoute() {
  if (typeof window === "undefined") return "app";
  const p = window.location.pathname;
  if (p === "/" || p === "" || p === "/index.html") return "landing";
  return "app";
}

function Root() {
  const [route, setRoute] = useState(resolveRoute);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Keep route in sync if the user uses back/forward.
  useEffect(() => {
    const onPop = () => setRoute(resolveRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Auth session is only needed for the product route. The landing page
  // submits waitlist rows via the anon key and doesn't care about session.
  useEffect(() => {
    if (route !== "app") { setLoading(false); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => { setSession(session); }
    );

    return () => subscription.unsubscribe();
  }, [route]);

  if (route === "landing") return <Landing />;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <App
      session={session}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
