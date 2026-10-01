import React from "react";
import { Navigate } from "react-router-dom";
import Panel from "@/components/Panel";
import LanternSpinner from "@/components/LanternSpinner";
import { useGuild } from "@/lib/GuildContext";
import { ROLE_TITLE } from "@/components/SealLogo";
import AwardSection from "@/components/admin/AwardSection";
import BanSection from "@/components/admin/BanSection";
import SettingsSection from "@/components/admin/SettingsSection";
import ImportSection from "@/components/admin/ImportSection";
import TotalsSection from "@/components/admin/TotalsSection";

export default function Admin() {
  const { account, loading } = useGuild();

  if (loading) return <LanternSpinner label="Checking your rank" className="py-24" />;
  if (!account || !account.linked) return <Navigate to="/link-discord" replace />;

  const role = account.member.role;
  if (role !== "officer" && role !== "leader") {
    return (
      <Panel title="Elders only" className="mx-auto mt-6 max-w-md">
        <p className="text-center text-sm text-mist">The admin hall is for Elders and the Guild Master.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <header className="text-center">
        <h1 className="font-heading text-3xl font-extrabold gilt-text">Admin hall</h1>
        <p className="mt-1 text-sm text-mist">Signed in as {ROLE_TITLE[role]}.</p>
      </header>

      {role === "leader" && account.setup && !account.setup.guild_configured && (
        <p className="rounded-md border border-gold/60 bg-gold/10 px-4 py-3 text-sm">
          <b className="text-gold">Members can't link yet.</b> Paste your Discord server ID in Guild settings below and save.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <AwardSection />
        <BanSection />
      </div>
      <TotalsSection />
      {role === "leader" && <SettingsSection />}
      {role === "leader" && <ImportSection />}
    </div>
  );
}