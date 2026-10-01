import React from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import Hero from "@/components/Hero";
import MapleLeaves from "@/components/MapleLeaves";
import { Seal } from "@/components/SealLogo";

export default function Landing() {
  const { isAuthenticated, authChecked } = useAuth();
  if (authChecked && isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-ink ink-grain relative overflow-hidden">
      <MapleLeaves count={12} />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10 sm:py-16">
        <div className="flex items-center gap-3 mb-10">
          <Seal size={40} />
          <span className="font-heading tracking-[0.3em] text-gold text-xs uppercase">Guild Hall</span>
        </div>

        <Hero />

        <div className="mt-10 flex flex-col items-center text-center gap-6">
          <h2 className="font-heading text-2xl sm:text-3xl text-gold font-bold">Enter the Blacklist</h2>
          <p className="text-muted-foreground max-w-md">
            Link your Discord to claim your battle points, climb the ranks, and test your luck at the lantern-lit games.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/login">
              <Button size="lg" className="bg-crimson hover:bg-ember text-gold font-heading tracking-wider px-8 h-12 border border-gold/40">
                Log in
              </Button>
            </Link>
            <Link to="/register">
              <Button size="lg" variant="outline" className="border-gold/40 text-gold hover:bg-gold/10 px-8 h-12">
                Create account
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground/70 mt-2 max-w-sm">
            Points hold no real-money value. They cannot be bought or cashed out.
          </p>
        </div>
      </div>
    </div>
  );
}