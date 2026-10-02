import React from "react";
import { Link } from "react-router-dom";
import SkyScene from "./SkyScene";
import Panel from "./Panel";
import { FullLogo } from "./SealLogo";

// Login, register and password pages share this frame: the sky scene behind a
// single game window.
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <div className="relative flex min-h-[100svh] items-center justify-center px-4 py-10">
      <SkyScene dim />
      <div className="relative z-10 w-full max-w-sm">
        <Link to="/" className="mb-6 flex flex-col items-center gap-3 text-center" aria-label="Back to the guild hall">
          <FullLogo className="w-60" />
        </Link>
        <Panel title={title}>
          {subtitle && <p className="-mt-1 mb-5 text-center text-sm text-mist">{subtitle}</p>}
          {children}
        </Panel>
        {footer && <p className="mt-5 text-center text-sm text-mist">{footer}</p>}
      </div>
    </div>
  );
}