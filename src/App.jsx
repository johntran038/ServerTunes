import './App.css'

import React, { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

function App() {
  const Landing = lazy(() => import("./pages/Landing"));
  const Host = lazy(() => import("./pages/Host"));
  const Join = lazy(() => import("./pages/Join"));

  return (
    <Suspense fallback={<div className="page">Loading...</div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/host" element={<Host />} />
        <Route path="/join" element={<Join />} />
      </Routes>
    </Suspense>
  );
}

export default App
